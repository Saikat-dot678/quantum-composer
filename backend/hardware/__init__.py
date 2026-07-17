"""Hardware Mapping: backend discovery, target construction, and
backend-aware transpilation/mapping.

Replaces the old 7-line ``hardware.py`` Protocol stub ("future
remote-execution boundary"). Mapping/transpilation works fully offline
against fake snapshots, generic topologies, and user-defined targets;
IBM Quantum account discovery is an *optional* layer on top
(``qiskit-ibm-runtime``, detected at runtime exactly like the optional
Stim engine). Real-hardware *execution* is deliberately not implemented
in this package -- see docs/HARDWARE_MAPPING.md.
"""
