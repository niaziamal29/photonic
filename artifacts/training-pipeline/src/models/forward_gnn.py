"""
GNN + Set Transformer surrogate model for photonic circuit simulation.

Architecture
------------
1. Node & edge encoders project raw features into latent space.
2. Six MPNN layers with GRU-gated updates perform message passing.
3. A per-node MLP head predicts local quantities (power, SNR, phase, status).
4. A Set Transformer global head aggregates node embeddings via learned
   multi-head self-attention and predicts system-level quantities
   (equilibrium score, system loss, coherence length, converged flag).

Total parameter budget: ~2M parameters.
"""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import MessagePassing
from torch_geometric.data import Data


# ---------------------------------------------------------------------------
# Feature schema constants (single source of truth for training pipeline)
# ---------------------------------------------------------------------------

NODE_INPUT_DIM: int = 29        # 15 type one-hot + 14 normalised params
PORT_VOCAB_SIZE: int = 17       # Distinct port names in lib/ml-models/src/portSpec.ts
EDGE_INPUT_DIM: int = PORT_VOCAB_SIZE * 2  # one-hot(from_port) + one-hot(to_port)
HIDDEN_DIM: int = 128
EDGE_HIDDEN_DIM: int = 64
NUM_MPNN_LAYERS: int = 6
NUM_NODE_OUTPUTS: int = 6      # power, snr, phase, status_logit x 3
NUM_GLOBAL_OUTPUTS: int = 4    # eq_score, system_loss, coherence_length, converged_logit
DROPOUT: float = 0.1
NUM_ATTENTION_HEADS: int = 4
NUM_SET_TRANSFORMER_LAYERS: int = 2


# ---------------------------------------------------------------------------
# Helper: two-layer MLP
# ---------------------------------------------------------------------------

def _mlp(in_dim: int, hidden_dim: int, out_dim: int) -> nn.Sequential:
    """Build a two-layer MLP with ReLU activation."""
    return nn.Sequential(
        nn.Linear(in_dim, hidden_dim),
        nn.ReLU(inplace=True),
        nn.Linear(hidden_dim, out_dim),
    )


# ---------------------------------------------------------------------------
# MPNN Layer
# ---------------------------------------------------------------------------

class PhotonMPNNLayer(MessagePassing):
    """Single message-passing layer with GRU-gated node updates.

    Message function:
        m_ij = MLP([h_i || h_j || e_ij])

    Update function:
        h_i' = GRU(h_i, sum_j m_ij)

    Parameters
    ----------
    hidden_dim : int
        Dimension of node hidden states.
    edge_dim : int
        Dimension of edge feature vectors.
    """

    def __init__(self, hidden_dim: int = HIDDEN_DIM, edge_dim: int = EDGE_HIDDEN_DIM) -> None:
        super().__init__(aggr="add", flow="source_to_target")
        self.message_mlp = nn.Sequential(
            nn.Linear(hidden_dim * 2 + edge_dim, hidden_dim),
            nn.ReLU(inplace=True),
            nn.Linear(hidden_dim, hidden_dim),
        )
        self.gru = nn.GRUCell(hidden_dim, hidden_dim)

    def forward(
        self,
        x: torch.Tensor,
        edge_index: torch.Tensor,
        edge_attr: torch.Tensor,
    ) -> torch.Tensor:
        """Run one round of message passing.

        Parameters
        ----------
        x : Tensor [N, hidden_dim]
            Node hidden states.
        edge_index : Tensor [2, E]
            COO edge indices.
        edge_attr : Tensor [E, edge_dim]
            Edge feature vectors.

        Returns
        -------
        Tensor [N, hidden_dim]
            Updated node hidden states.
        """
        agg = self.propagate(edge_index, x=x, edge_attr=edge_attr)
        return self.gru(agg, x)

    def message(
        self,
        x_i: torch.Tensor,
        x_j: torch.Tensor,
        edge_attr: torch.Tensor,
    ) -> torch.Tensor:
        """Compute messages from source *j* to target *i*."""
        return self.message_mlp(torch.cat([x_i, x_j, edge_attr], dim=-1))


# ---------------------------------------------------------------------------
# Set Transformer Global Head
# ---------------------------------------------------------------------------

class SetTransformerHead(nn.Module):
    """Set Transformer global readout head.

    Uses stacked self-attention layers over node embeddings followed by
    attention-based pooling with a learned seed vector (PMA) and a
    final MLP projection.

    Parameters
    ----------
    hidden_dim : int
        Dimension of input node embeddings.
    output_dim : int
        Number of scalar outputs.
    num_heads : int
        Number of attention heads per layer.
    num_layers : int
        Number of self-attention blocks.
    """

    def __init__(
        self,
        hidden_dim: int = HIDDEN_DIM,
        output_dim: int = NUM_GLOBAL_OUTPUTS,
        num_heads: int = NUM_ATTENTION_HEADS,
        num_layers: int = NUM_SET_TRANSFORMER_LAYERS,
    ) -> None:
        super().__init__()

        # Self-attention blocks (ISAB-style, without inducing points for
        # simplicity -- full self-attention is fine for circuits with
        # typically < 500 nodes).
        self.sa_layers = nn.ModuleList()
        for _ in range(num_layers):
            self.sa_layers.append(
                _SetAttentionBlock(hidden_dim, num_heads)
            )

        # Pooling via learned seed vector (Pooling by Multihead Attention).
        self.seed = nn.Parameter(torch.randn(1, 1, hidden_dim))
        self.pool_attn = nn.MultiheadAttention(
            embed_dim=hidden_dim,
            num_heads=num_heads,
            batch_first=True,
        )
        self.pool_norm = nn.LayerNorm(hidden_dim)

        # Output projection
        self.output_mlp = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(inplace=True),
            nn.Linear(hidden_dim // 2, output_dim),
        )

    def forward(self, x: torch.Tensor, batch: torch.Tensor) -> torch.Tensor:
        """Aggregate node embeddings into a single global prediction per graph.

        Parameters
        ----------
        x : Tensor [N, hidden_dim]
            Node embeddings from the MPNN stack.
        batch : Tensor [N]
            Batch assignment vector (which graph each node belongs to).

        Returns
        -------
        Tensor [B, output_dim]
            Global predictions, one row per graph in the batch.
        """
        # -- Pack nodes into a padded [B, max_N, D] tensor -----------------
        batch_size = int(batch.max().item()) + 1
        hidden_dim = x.size(-1)

        # Count nodes per graph
        counts = torch.zeros(batch_size, dtype=torch.long, device=x.device)
        counts.scatter_add_(0, batch, torch.ones_like(batch, dtype=torch.long))
        max_nodes = int(counts.max().item())

        # Build padded tensor and mask
        padded = x.new_zeros(batch_size, max_nodes, hidden_dim)
        mask = torch.ones(batch_size, max_nodes, dtype=torch.bool, device=x.device)

        # Fill padded tensor
        offsets = torch.zeros(batch_size, dtype=torch.long, device=x.device)
        offsets[1:] = counts[:-1].cumsum(0)
        for b in range(batch_size):
            n = int(counts[b].item())
            padded[b, :n] = x[offsets[b] : offsets[b] + n]
            mask[b, :n] = False  # False = attend, True = ignore

        # -- Self-attention layers -----------------------------------------
        for sa in self.sa_layers:
            padded = sa(padded, key_padding_mask=mask)

        # -- Pooling by multihead attention with learned seed --------------
        seed = self.seed.expand(batch_size, -1, -1)          # [B, 1, D]
        pooled, _ = self.pool_attn(
            seed, padded, padded,
            key_padding_mask=mask,
        )                                                      # [B, 1, D]
        pooled = self.pool_norm(seed + pooled).squeeze(1)      # [B, D]

        return self.output_mlp(pooled)                         # [B, output_dim]


class _SetAttentionBlock(nn.Module):
    """Pre-norm Transformer encoder block (self-attention + FFN)."""

    def __init__(self, hidden_dim: int, num_heads: int) -> None:
        super().__init__()
        self.norm1 = nn.LayerNorm(hidden_dim)
        self.attn = nn.MultiheadAttention(
            embed_dim=hidden_dim,
            num_heads=num_heads,
            batch_first=True,
        )
        self.norm2 = nn.LayerNorm(hidden_dim)
        self.ffn = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim * 2),
            nn.ReLU(inplace=True),
            nn.Linear(hidden_dim * 2, hidden_dim),
        )

    def forward(
        self,
        x: torch.Tensor,
        key_padding_mask: torch.Tensor | None = None,
    ) -> torch.Tensor:
        # Self-attention with residual
        h = self.norm1(x)
        h, _ = self.attn(h, h, h, key_padding_mask=key_padding_mask)
        x = x + h
        # Feed-forward with residual
        x = x + self.ffn(self.norm2(x))
        return x


# ---------------------------------------------------------------------------
# Full Surrogate Model
# ---------------------------------------------------------------------------

class PhotonicSurrogateGNN(nn.Module):
    """GNN + Set Transformer surrogate for photonic circuit simulation.

    Accepts a PyTorch Geometric ``Data`` object and returns per-node
    predictions and a global (per-graph) prediction vector.

    Expected ``Data`` attributes
    ----------------------------
    x : Tensor [N, 29]
        Node features (15 type one-hot + 14 normalised parameters).
    edge_index : Tensor [2, E]
        COO edge connectivity.
    edge_attr : Tensor [E, 34], optional
        Edge features encoded as
        ``[one_hot(from_port, 17) || one_hot(to_port, 17)]``.
        Defaults to zeros when absent.
    batch : Tensor [N]
        Batch assignment for mini-batching.

    Returns
    -------
    node_out : Tensor [N, 6]
        Per-node predictions: power, snr, phase, status_logit (3 classes).
    global_out : Tensor [B, 4]
        Per-graph predictions: eq_score, system_loss, coherence_length,
        converged_logit.
    """

    def __init__(
        self,
        node_input_dim: int = NODE_INPUT_DIM,
        edge_input_dim: int = EDGE_INPUT_DIM,
        hidden_dim: int = HIDDEN_DIM,
        edge_hidden_dim: int = EDGE_HIDDEN_DIM,
        num_layers: int = NUM_MPNN_LAYERS,
        num_node_outputs: int = NUM_NODE_OUTPUTS,
        num_global_outputs: int = NUM_GLOBAL_OUTPUTS,
        dropout: float = DROPOUT,
    ) -> None:
        super().__init__()

        # -- Encoders ------------------------------------------------------
        self.node_encoder = nn.Sequential(
            nn.Linear(node_input_dim, hidden_dim),
            nn.ReLU(inplace=True),
            nn.Linear(hidden_dim, hidden_dim),
        )

        self.edge_encoder = nn.Sequential(
            nn.Linear(edge_input_dim, edge_hidden_dim),
            nn.ReLU(inplace=True),
            nn.Linear(edge_hidden_dim, edge_hidden_dim),
        )

        # -- Message-passing stack -----------------------------------------
        self.layers = nn.ModuleList(
            [PhotonMPNNLayer(hidden_dim, edge_hidden_dim) for _ in range(num_layers)]
        )

        self.dropout = nn.Dropout(dropout)

        # -- Output heads --------------------------------------------------
        self.node_head = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(inplace=True),
            nn.Linear(hidden_dim // 2, num_node_outputs),
        )

        self.global_head = SetTransformerHead(
            hidden_dim=hidden_dim,
            output_dim=num_global_outputs,
        )

    def forward(self, data: Data) -> tuple[torch.Tensor, torch.Tensor]:
        """Run the full forward pass.

        Parameters
        ----------
        data : torch_geometric.data.Data
            Batched graph data.

        Returns
        -------
        node_out : Tensor [N, NUM_NODE_OUTPUTS]
        global_out : Tensor [B, NUM_GLOBAL_OUTPUTS]
        """
        x, edge_index = data.x, data.edge_index
        batch = data.batch

        # Edge attributes -- default to zeros if not provided
        if data.edge_attr is not None:
            edge_attr = data.edge_attr
        else:
            num_edges = edge_index.size(1)
            edge_attr = x.new_zeros(num_edges, EDGE_INPUT_DIM)

        # Encode
        h = self.node_encoder(x)
        e = self.edge_encoder(edge_attr)

        # Message passing
        for layer in self.layers:
            h = layer(h, edge_index, e)
            h = self.dropout(h)

        # Per-node prediction
        node_out = self.node_head(h)

        # Global prediction via Set Transformer
        global_out = self.global_head(h, batch)

        return node_out, global_out
