"""Runtime detection of the optional hardware-related dependencies.

Same pattern as engines/base.py's stim/aer detection: import lazily, cache
the answer, never crash at import time because an optional package is
absent. The backend runs -- and every hardware-mapping feature that only
needs qiskit core keeps working -- without qiskit-ibm-runtime installed.
"""

from __future__ import annotations

from functools import lru_cache


@lru_cache(maxsize=1)
def ibm_runtime_available() -> bool:
    try:
        import qiskit_ibm_runtime  # noqa: F401
    except ImportError:
        return False
    return True


@lru_cache(maxsize=1)
def ibm_runtime_version() -> str | None:
    if not ibm_runtime_available():
        return None
    import qiskit_ibm_runtime

    return getattr(qiskit_ibm_runtime, "__version__", "unknown")


@lru_cache(maxsize=1)
def fake_provider_available() -> bool:
    """The fake-backend catalog ships inside qiskit-ibm-runtime."""
    if not ibm_runtime_available():
        return False
    try:
        from qiskit_ibm_runtime.fake_provider import FakeProviderForBackendV2  # noqa: F401
    except ImportError:
        return False
    return True


@lru_cache(maxsize=1)
def qasm3_import_available() -> bool:
    """OpenQASM 3 *parsing* needs the optional qiskit_qasm3_import package."""
    try:
        import qiskit_qasm3_import  # noqa: F401
    except ImportError:
        return False
    return True
