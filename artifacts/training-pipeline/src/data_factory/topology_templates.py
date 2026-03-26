"""Topology templates for generating synthetic photonic circuits.

Provides parameterised circuit generators that produce circuit dictionaries
compatible with the Photonics-Equilibrium API build schema.  Each generator
returns::

    {
        "components": [{"id", "type", "label", "x", "y", "params": {}}],
        "connections": [{"id", "fromComponentId", "fromPort",
                         "toComponentId", "toPort"}],
        "topology": "<template_name>",
    }

Fifteen canonical component types are supported, each with physically
motivated parameter ranges drawn uniformly at random.
"""

from __future__ import annotations

import random
import uuid
from typing import Any

# ---------------------------------------------------------------------------
# Component catalogue
# ---------------------------------------------------------------------------

COMPONENT_TYPES: list[str] = [
    "laser_source",
    "waveguide",
    "beam_splitter",
    "coupler",
    "modulator",
    "photodetector",
    "optical_amplifier",
    "phase_shifter",
    "filter",
    "isolator",
    "circulator",
    "mzi",
    "ring_resonator",
    "grating_coupler",
    "mirror",
]

#: Physically motivated parameter ranges for each component type.
#: Each value maps ``param_name -> (lo, hi)``.
PARAM_RANGES: dict[str, dict[str, tuple[float, float]]] = {
    "laser_source": {
        "power_mw": (0.1, 100.0),
        "wavelength_nm": (1260.0, 1640.0),
        "linewidth_mhz": (0.01, 100.0),
    },
    "waveguide": {
        "length_um": (1.0, 10000.0),
        "width_um": (0.3, 2.0),
        "loss_db_per_cm": (0.1, 5.0),
        "neff": (1.4, 3.5),
    },
    "beam_splitter": {
        "split_ratio": (0.01, 0.99),
        "insertion_loss_db": (0.05, 1.0),
    },
    "coupler": {
        "coupling_ratio": (0.01, 0.99),
        "insertion_loss_db": (0.05, 1.0),
        "num_ports": (2.0, 8.0),
    },
    "modulator": {
        "bandwidth_ghz": (1.0, 100.0),
        "vpi_v": (1.0, 10.0),
        "insertion_loss_db": (1.0, 8.0),
        "extinction_ratio_db": (10.0, 40.0),
    },
    "photodetector": {
        "responsivity_a_per_w": (0.5, 1.2),
        "bandwidth_ghz": (1.0, 100.0),
        "dark_current_na": (0.01, 100.0),
    },
    "optical_amplifier": {
        "gain_db": (5.0, 40.0),
        "noise_figure_db": (3.0, 10.0),
        "saturation_power_dbm": (5.0, 25.0),
    },
    "phase_shifter": {
        "phase_shift_rad": (0.0, 6.2832),
        "insertion_loss_db": (0.05, 2.0),
    },
    "filter": {
        "center_wavelength_nm": (1260.0, 1640.0),
        "bandwidth_nm": (0.1, 20.0),
        "insertion_loss_db": (0.1, 5.0),
        "extinction_ratio_db": (10.0, 50.0),
    },
    "isolator": {
        "isolation_db": (20.0, 60.0),
        "insertion_loss_db": (0.3, 2.0),
    },
    "circulator": {
        "isolation_db": (20.0, 50.0),
        "insertion_loss_db": (0.3, 2.0),
        "num_ports": (3.0, 4.0),
    },
    "mzi": {
        "arm_length_diff_um": (0.0, 500.0),
        "insertion_loss_db": (0.5, 5.0),
        "extinction_ratio_db": (15.0, 40.0),
    },
    "ring_resonator": {
        "radius_um": (2.0, 100.0),
        "coupling_gap_nm": (50.0, 500.0),
        "fsr_nm": (0.5, 50.0),
        "q_factor": (1000.0, 1000000.0),
    },
    "grating_coupler": {
        "coupling_efficiency": (0.1, 0.9),
        "bandwidth_nm": (20.0, 80.0),
        "center_wavelength_nm": (1260.0, 1640.0),
    },
    "mirror": {
        "reflectivity": (0.5, 0.9999),
        "bandwidth_nm": (10.0, 200.0),
    },
}

#: Component types suitable for insertion in the middle of a chain.
_PASSIVE_ACTIVE_TYPES: list[str] = [
    "waveguide",
    "beam_splitter",
    "coupler",
    "modulator",
    "optical_amplifier",
    "phase_shifter",
    "filter",
    "isolator",
    "circulator",
    "mzi",
    "ring_resonator",
    "grating_coupler",
    "mirror",
]

# Types that are passive (no gain) -- used in augmentation swapping.
PASSIVE_TYPES: list[str] = [
    "waveguide",
    "beam_splitter",
    "coupler",
    "phase_shifter",
    "filter",
    "isolator",
    "circulator",
    "mzi",
    "ring_resonator",
    "grating_coupler",
    "mirror",
]

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _uid() -> str:
    """Return a short unique ID string."""
    return uuid.uuid4().hex[:8]


def _random_params(component_type: str) -> dict[str, float]:
    """Sample uniformly within the parameter ranges for *component_type*."""
    ranges = PARAM_RANGES.get(component_type, {})
    return {name: random.uniform(lo, hi) for name, (lo, hi) in ranges.items()}


def _make_component(
    component_type: str,
    x: float = 0.0,
    y: float = 0.0,
    label: str | None = None,
    cid: str | None = None,
) -> dict[str, Any]:
    """Create a single component dict with random parameters.

    Parameters
    ----------
    component_type:
        One of :data:`COMPONENT_TYPES`.
    x, y:
        Canvas position for layout visualisation.
    label:
        Human-readable label; defaults to the component type.
    cid:
        Optional explicit component ID.

    Returns
    -------
    dict
        ``{"id", "type", "label", "x", "y", "params": {}}``.
    """
    return {
        "id": cid or f"{component_type}_{_uid()}",
        "type": component_type,
        "label": label or component_type,
        "x": x,
        "y": y,
        "params": _random_params(component_type),
    }


def _make_connection(
    from_id: str,
    to_id: str,
    from_port: str = "output",
    to_port: str = "input",
) -> dict[str, str]:
    """Create a connection dict between two components.

    Parameters
    ----------
    from_id, to_id:
        Component IDs to connect.
    from_port, to_port:
        Port names on the source and destination components.

    Returns
    -------
    dict
        ``{"id", "fromComponentId", "fromPort", "toComponentId", "toPort"}``.
    """
    return {
        "id": f"conn_{_uid()}",
        "fromComponentId": from_id,
        "fromPort": from_port,
        "toComponentId": to_id,
        "toPort": to_port,
    }


# ---------------------------------------------------------------------------
# Topology generators
# ---------------------------------------------------------------------------


def linear_chain(n_middle: int = 3) -> dict[str, Any]:
    """Generate a linear chain: Laser -> [n_middle random components] -> Detector.

    Parameters
    ----------
    n_middle:
        Number of intermediate passive/active components (clamped to 1..20).

    Returns
    -------
    dict
        Circuit dictionary with ``components``, ``connections``, ``topology``.
    """
    n_middle = max(1, min(n_middle, 20))
    spacing = 150.0

    laser = _make_component("laser_source", x=0.0, y=0.0, label="Source")
    middle: list[dict[str, Any]] = []
    for i in range(n_middle):
        ctype = random.choice(_PASSIVE_ACTIVE_TYPES)
        middle.append(_make_component(ctype, x=spacing * (i + 1), y=0.0))
    detector = _make_component(
        "photodetector", x=spacing * (n_middle + 1), y=0.0, label="Detector"
    )

    components = [laser, *middle, detector]
    connections: list[dict[str, str]] = []
    for i in range(len(components) - 1):
        connections.append(_make_connection(components[i]["id"], components[i + 1]["id"]))

    return {"components": components, "connections": connections, "topology": "linear_chain"}


def mzi_interferometer() -> dict[str, Any]:
    """Generate an MZI interferometer topology.

    Structure::

        Laser -> Splitter --arm1(phase_shifter)--> Combiner -> Detector
                           --arm2(waveguide)------>

    Returns
    -------
    dict
        Circuit dictionary.
    """
    laser = _make_component("laser_source", x=0.0, y=0.0, label="Source")
    splitter = _make_component("beam_splitter", x=150.0, y=0.0, label="Splitter")
    arm1 = _make_component("phase_shifter", x=300.0, y=-80.0, label="Arm1_PhaseShifter")
    arm2 = _make_component("waveguide", x=300.0, y=80.0, label="Arm2_Waveguide")
    combiner = _make_component("beam_splitter", x=450.0, y=0.0, label="Combiner")
    detector = _make_component("photodetector", x=600.0, y=0.0, label="Detector")

    components = [laser, splitter, arm1, arm2, combiner, detector]
    connections = [
        _make_connection(laser["id"], splitter["id"]),
        _make_connection(splitter["id"], arm1["id"], from_port="output_1", to_port="input"),
        _make_connection(splitter["id"], arm2["id"], from_port="output_2", to_port="input"),
        _make_connection(arm1["id"], combiner["id"], from_port="output", to_port="input_1"),
        _make_connection(arm2["id"], combiner["id"], from_port="output", to_port="input_2"),
        _make_connection(combiner["id"], detector["id"]),
    ]

    return {"components": components, "connections": connections, "topology": "mzi_interferometer"}


def ring_filter() -> dict[str, Any]:
    """Generate a ring resonator filter topology.

    Structure::

        Laser -> Waveguide -> Ring Resonator -> Waveguide -> Detector

    Returns
    -------
    dict
        Circuit dictionary.
    """
    laser = _make_component("laser_source", x=0.0, y=0.0, label="Source")
    wg1 = _make_component("waveguide", x=150.0, y=0.0, label="InputWaveguide")
    ring = _make_component("ring_resonator", x=300.0, y=0.0, label="RingResonator")
    wg2 = _make_component("waveguide", x=450.0, y=0.0, label="OutputWaveguide")
    detector = _make_component("photodetector", x=600.0, y=0.0, label="Detector")

    components = [laser, wg1, ring, wg2, detector]
    connections = [
        _make_connection(laser["id"], wg1["id"]),
        _make_connection(wg1["id"], ring["id"]),
        _make_connection(ring["id"], wg2["id"]),
        _make_connection(wg2["id"], detector["id"]),
    ]

    return {"components": components, "connections": connections, "topology": "ring_filter"}


def amplified_link() -> dict[str, Any]:
    """Generate an amplified optical link topology.

    Structure::

        Laser -> Waveguide -> Optical Amplifier -> Waveguide -> Detector

    Returns
    -------
    dict
        Circuit dictionary.
    """
    laser = _make_component("laser_source", x=0.0, y=0.0, label="Source")
    wg1 = _make_component("waveguide", x=150.0, y=0.0, label="InputWaveguide")
    amp = _make_component("optical_amplifier", x=300.0, y=0.0, label="Amplifier")
    wg2 = _make_component("waveguide", x=450.0, y=0.0, label="OutputWaveguide")
    detector = _make_component("photodetector", x=600.0, y=0.0, label="Detector")

    components = [laser, wg1, amp, wg2, detector]
    connections = [
        _make_connection(laser["id"], wg1["id"]),
        _make_connection(wg1["id"], amp["id"]),
        _make_connection(amp["id"], wg2["id"]),
        _make_connection(wg2["id"], detector["id"]),
    ]

    return {"components": components, "connections": connections, "topology": "amplified_link"}


def multi_stage_filter() -> dict[str, Any]:
    """Generate a multi-stage filter topology with isolation.

    Structure::

        Laser -> Filter -> Isolator -> Filter -> Detector

    Returns
    -------
    dict
        Circuit dictionary.
    """
    laser = _make_component("laser_source", x=0.0, y=0.0, label="Source")
    f1 = _make_component("filter", x=150.0, y=0.0, label="Filter1")
    iso = _make_component("isolator", x=300.0, y=0.0, label="Isolator")
    f2 = _make_component("filter", x=450.0, y=0.0, label="Filter2")
    detector = _make_component("photodetector", x=600.0, y=0.0, label="Detector")

    components = [laser, f1, iso, f2, detector]
    connections = [
        _make_connection(laser["id"], f1["id"]),
        _make_connection(f1["id"], iso["id"]),
        _make_connection(iso["id"], f2["id"]),
        _make_connection(f2["id"], detector["id"]),
    ]

    return {
        "components": components,
        "connections": connections,
        "topology": "multi_stage_filter",
    }


def star_coupler(n_outputs: int = 4) -> dict[str, Any]:
    """Generate a star coupler topology with multiple output waveguides.

    Structure::

        Laser -> Coupler -> [n_outputs waveguides] -> [n_outputs detectors]

    Parameters
    ----------
    n_outputs:
        Number of output branches (clamped to 2..8).

    Returns
    -------
    dict
        Circuit dictionary.
    """
    n_outputs = max(2, min(n_outputs, 8))

    laser = _make_component("laser_source", x=0.0, y=0.0, label="Source")
    coupler = _make_component("coupler", x=150.0, y=0.0, label="StarCoupler")
    # Override num_ports to match n_outputs
    coupler["params"]["num_ports"] = float(n_outputs)

    components: list[dict[str, Any]] = [laser, coupler]
    connections: list[dict[str, str]] = [_make_connection(laser["id"], coupler["id"])]

    y_start = -((n_outputs - 1) * 100.0) / 2.0
    for i in range(n_outputs):
        y_pos = y_start + i * 100.0
        wg = _make_component("waveguide", x=300.0, y=y_pos, label=f"Waveguide_{i}")
        det = _make_component("photodetector", x=450.0, y=y_pos, label=f"Detector_{i}")
        components.extend([wg, det])
        connections.append(
            _make_connection(
                coupler["id"], wg["id"], from_port=f"output_{i}", to_port="input"
            )
        )
        connections.append(_make_connection(wg["id"], det["id"]))

    return {"components": components, "connections": connections, "topology": "star_coupler"}


def generate_random_circuit() -> dict[str, Any]:
    """Generate a random circuit by picking a random topology template with random params.

    Selects one of the six canonical topologies uniformly at random, with
    randomised structural parameters (chain length, number of outputs, etc.).

    Returns
    -------
    dict
        Circuit dictionary with ``components``, ``connections``, ``topology``.
    """
    choice = random.randint(0, 5)
    if choice == 0:
        return linear_chain(n_middle=random.randint(1, 8))
    elif choice == 1:
        return mzi_interferometer()
    elif choice == 2:
        return ring_filter()
    elif choice == 3:
        return amplified_link()
    elif choice == 4:
        return multi_stage_filter()
    else:
        return star_coupler(n_outputs=random.randint(2, 8))
