"""Conditional VAE for photonic circuit generation (inverse design)."""
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import GCNConv, global_mean_pool
from torch_geometric.data import Data

LATENT_DIM = 256
CONDITION_DIM = 4  # wavelength, power, SNR, max_components
MAX_NODES = 50
NUM_COMPONENT_TYPES = 15
NUM_PARAMS = 14
NODE_FEATURE_DIM = NUM_COMPONENT_TYPES + NUM_PARAMS  # 29


class GraphEncoder(nn.Module):
    """GNN encoder: circuit graph -> (mu, logvar) in R^LATENT_DIM."""
    def __init__(self, input_dim=NODE_FEATURE_DIM, hidden_dim=128, latent_dim=LATENT_DIM):
        super().__init__()
        self.conv1 = GCNConv(input_dim, hidden_dim)
        self.conv2 = GCNConv(hidden_dim, hidden_dim)
        self.conv3 = GCNConv(hidden_dim, hidden_dim)
        self.mu_head = nn.Linear(hidden_dim, latent_dim)
        self.logvar_head = nn.Linear(hidden_dim, latent_dim)

    def forward(self, x, edge_index, batch):
        h = F.relu(self.conv1(x, edge_index))
        h = F.relu(self.conv2(h, edge_index))
        h = F.relu(self.conv3(h, edge_index))
        pooled = global_mean_pool(h, batch)
        return self.mu_head(pooled), self.logvar_head(pooled)


class GraphDecoder(nn.Module):
    """Autoregressive decoder: (z, condition) -> circuit graph."""
    def __init__(self, latent_dim=LATENT_DIM, condition_dim=CONDITION_DIM, hidden_dim=256):
        super().__init__()
        input_dim = latent_dim + condition_dim

        # Step 1: Predict number of nodes (classification: 2-MAX_NODES)
        self.num_nodes_head = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, MAX_NODES - 1),  # classes for 2..MAX_NODES
        )

        # Step 2: Predict node types and params for each node
        self.node_generator = nn.GRUCell(input_dim + NUM_COMPONENT_TYPES + NUM_PARAMS, hidden_dim)
        self.type_head = nn.Linear(hidden_dim, NUM_COMPONENT_TYPES)
        self.param_head = nn.Linear(hidden_dim, NUM_PARAMS)

        # Step 3: Predict edges (pairwise)
        self.edge_predictor = nn.Sequential(
            nn.Linear(hidden_dim * 2 + input_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, 1),
        )

        self.init_hidden = nn.Linear(input_dim, hidden_dim)

    def forward(self, z, condition, target_num_nodes=None, target_node_features=None):
        """Forward pass for training (teacher forcing)."""
        zc = torch.cat([z, condition], dim=-1)
        batch_size = z.shape[0]

        # Predict num nodes
        num_nodes_logits = self.num_nodes_head(zc)

        # Generate nodes autoregressively (teacher forcing during training)
        h = self.init_hidden(zc)
        all_type_logits = []
        all_param_preds = []

        num_nodes = target_num_nodes.max().item() if target_num_nodes is not None else 10
        prev_features = torch.zeros(batch_size, NUM_COMPONENT_TYPES + NUM_PARAMS, device=z.device)

        for step in range(num_nodes):
            gru_input = torch.cat([zc, prev_features], dim=-1)
            h = self.node_generator(gru_input, h)
            type_logits = self.type_head(h)
            param_pred = torch.sigmoid(self.param_head(h))  # [0,1] normalized
            all_type_logits.append(type_logits)
            all_param_preds.append(param_pred)

            if target_node_features is not None and step < target_node_features.shape[1]:
                prev_features = target_node_features[:, step]
            else:
                type_onehot = F.one_hot(type_logits.argmax(-1), NUM_COMPONENT_TYPES).float()
                prev_features = torch.cat([type_onehot, param_pred], dim=-1)

        type_logits_stack = torch.stack(all_type_logits, dim=1)
        param_preds_stack = torch.stack(all_param_preds, dim=1)

        # Predict edges
        edge_logits = self._predict_edges(h.unsqueeze(1).expand(-1, num_nodes, -1), zc, num_nodes)

        return num_nodes_logits, type_logits_stack, param_preds_stack, edge_logits

    def _predict_edges(self, node_hiddens, zc, num_nodes):
        batch_size = zc.shape[0]
        edges = []
        for i in range(num_nodes):
            for j in range(num_nodes):
                if i != j:
                    pair = torch.cat([
                        node_hiddens[:, i],
                        node_hiddens[:, j] if j < node_hiddens.shape[1] else torch.zeros_like(node_hiddens[:, 0]),
                        zc,
                    ], dim=-1)
                    edges.append(self.edge_predictor(pair))
        if edges:
            return torch.cat(edges, dim=-1)
        return torch.zeros(batch_size, 1, device=zc.device)

    @torch.no_grad()
    def generate(self, z, condition, temperature=1.0):
        """Generate a circuit from latent code and condition."""
        zc = torch.cat([z, condition], dim=-1)

        # Predict number of nodes
        num_logits = self.num_nodes_head(zc)
        num_nodes = (num_logits / temperature).softmax(-1).multinomial(1).item() + 2

        # Generate nodes
        h = self.init_hidden(zc)
        nodes = []
        prev_features = torch.zeros(1, NUM_COMPONENT_TYPES + NUM_PARAMS, device=z.device)

        for _ in range(num_nodes):
            gru_input = torch.cat([zc, prev_features], dim=-1)
            h = self.node_generator(gru_input, h)
            type_logits = self.type_head(h) / temperature
            type_idx = type_logits.softmax(-1).multinomial(1).item()
            params = torch.sigmoid(self.param_head(h)).squeeze(0)

            type_onehot = F.one_hot(torch.tensor([type_idx]), NUM_COMPONENT_TYPES).float().to(z.device)
            prev_features = torch.cat([type_onehot, params.unsqueeze(0)], dim=-1)

            nodes.append({"type_idx": type_idx, "params": params.cpu().tolist()})

        # Predict edges
        edges = []
        node_h = h.unsqueeze(0).expand(num_nodes, -1)
        for i in range(num_nodes):
            for j in range(i + 1, num_nodes):
                pair = torch.cat([node_h[i:i+1], node_h[j:j+1], zc], dim=-1)
                prob = torch.sigmoid(self.edge_predictor(pair)).item()
                if prob > 0.5:
                    edges.append((i, j))

        return {"nodes": nodes, "edges": edges, "num_nodes": num_nodes}


class PhotonicCircuitCVAE(nn.Module):
    """Full conditional VAE for photonic circuit generation."""
    def __init__(self):
        super().__init__()
        self.encoder = GraphEncoder()
        self.decoder = GraphDecoder()

    def reparameterize(self, mu, logvar):
        std = torch.exp(0.5 * logvar)
        eps = torch.randn_like(std)
        return mu + eps * std

    def forward(self, data, condition, target_num_nodes=None, target_node_features=None):
        mu, logvar = self.encoder(data.x, data.edge_index, data.batch)
        z = self.reparameterize(mu, logvar)
        outputs = self.decoder(z, condition, target_num_nodes, target_node_features)
        return mu, logvar, outputs

    @torch.no_grad()
    def generate(self, condition, num_samples=5, temperature=1.0):
        """Generate circuit candidates from target specifications."""
        self.eval()
        candidates = []
        for _ in range(num_samples):
            z = torch.randn(1, LATENT_DIM, device=condition.device)
            circuit = self.decoder.generate(z, condition, temperature)
            candidates.append(circuit)
        return candidates

    def loss(self, mu, logvar, outputs, targets, kl_weight=1.0):
        """ELBO loss = reconstruction + KL divergence."""
        num_logits, type_logits, param_preds, edge_logits = outputs

        # Reconstruction losses
        recon_loss = F.cross_entropy(num_logits, targets["num_nodes"] - 2)

        if type_logits.shape[1] > 0 and "node_types" in targets:
            type_loss = F.cross_entropy(
                type_logits.reshape(-1, NUM_COMPONENT_TYPES),
                targets["node_types"].reshape(-1),
                ignore_index=-1,
            )
        else:
            type_loss = torch.tensor(0.0)

        if "node_params" in targets:
            param_loss = F.mse_loss(param_preds, targets["node_params"])
        else:
            param_loss = torch.tensor(0.0)

        # KL divergence
        kl_loss = -0.5 * torch.sum(1 + logvar - mu.pow(2) - logvar.exp()) / mu.shape[0]

        total = recon_loss + type_loss + param_loss + kl_weight * kl_loss
        return total, {
            "recon": recon_loss.item(),
            "type": type_loss.item(),
            "param": param_loss.item(),
            "kl": kl_loss.item(),
        }
