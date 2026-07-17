"""Secure, optional IBM Quantum account discovery.

Only this module ever handles IBM credential material.  Tokens are accepted
from server environment variables, Qiskit's locally saved account file, or an
explicit localhost/HTTPS session connection.  A token is held only inside the
runtime service object in process memory; it is never serialized, logged, or
returned by any function in this package.
"""

from __future__ import annotations

import os
import queue
import threading
from datetime import datetime
from typing import Any, Callable, TypeVar

from .availability import fake_provider_available, ibm_runtime_available, ibm_runtime_version, qasm3_import_available
from .describe import describe_target, summarize_target
from .schemas import BackendDetail, BackendSummary, ConnectionStatus


IBM_TIMEOUT_SECONDS = 18.0
_T = TypeVar("_T")


class IBMConnectionError(RuntimeError):
    """A redacted, user-actionable IBM account/discovery error."""


_lock = threading.RLock()
_service: Any | None = None
_connection_mode: str = "none"
_instance_hint: str | None = None
_account_error: str | None = None


def _call_with_timeout(function: Callable[[], _T], timeout: float = IBM_TIMEOUT_SECONDS) -> _T:
    """Run a provider call in a daemon thread with a hard response deadline.

    qiskit-ibm-runtime does not expose a uniform request-timeout option on the
    service constructor.  A daemon worker prevents a provider outage from
    blocking the FastAPI request forever.  Connection attempts are rate-
    limited at the route boundary, so timed-out workers cannot be multiplied
    without bound by one browser.
    """

    output: queue.Queue[tuple[bool, Any]] = queue.Queue(maxsize=1)

    def run() -> None:
        try:
            output.put((True, function()))
        except BaseException as error:  # carried to the request thread; never logged here
            output.put((False, error))

    worker = threading.Thread(target=run, name="ibm-runtime-call", daemon=True)
    worker.start()
    try:
        ok, value = output.get(timeout=timeout)
    except queue.Empty as error:
        raise IBMConnectionError(
            "IBM Quantum did not respond before the server-side timeout. Retry after checking network and account status."
        ) from error
    if ok:
        return value
    raise value


def _public_error(action: str) -> str:
    # Deliberately does not interpolate the provider exception: those messages
    # can echo tokens, URLs, account CRNs, or tenant details.
    return (
        f"IBM Quantum could not {action}. Verify the server-side API key, channel, instance access, "
        "and network connectivity. Provider details were redacted."
    )


def _hint(instance: str | None) -> str | None:
    if not instance:
        return None
    compact = instance.strip()
    if len(compact) <= 16:
        return compact
    return f"...{compact[-12:]}"


def _has_saved_account() -> bool:
    if not ibm_runtime_available():
        return False
    try:
        from qiskit_ibm_runtime import QiskitRuntimeService

        # The returned dict contains secrets; inspect only its truthiness and
        # immediately discard it.  Never stringify or log this value.
        return bool(QiskitRuntimeService.saved_accounts())
    except Exception:
        return False


def configured_connection_mode() -> str:
    with _lock:
        if _service is not None:
            return _connection_mode
    if os.getenv("IBM_QUANTUM_API_KEY", "").strip():
        return "environment"
    if _has_saved_account():
        return "saved_account"
    return "none"


def _build_configured_service() -> tuple[Any, str, str | None]:
    if not ibm_runtime_available():
        raise IBMConnectionError(
            "IBM backend discovery requires the optional qiskit-ibm-runtime dependency. "
            "Fake/generic/manual mapping remains available without it."
        )
    from qiskit_ibm_runtime import QiskitRuntimeService

    token = os.getenv("IBM_QUANTUM_API_KEY", "").strip()
    instance = os.getenv("IBM_QUANTUM_INSTANCE", "").strip() or None
    channel = os.getenv("IBM_QUANTUM_CHANNEL", "ibm_quantum_platform").strip() or "ibm_quantum_platform"
    if token:
        service = _call_with_timeout(
            lambda: QiskitRuntimeService(channel=channel, token=token, instance=instance)
        )
        return service, "environment", _hint(instance)
    if _has_saved_account():
        service = _call_with_timeout(lambda: QiskitRuntimeService())
        return service, "saved_account", None
    raise IBMConnectionError(
        "No IBM Quantum account is configured. Set IBM_QUANTUM_API_KEY on the server, save a trusted "
        "QiskitRuntimeService account locally, or create a temporary secure session connection."
    )


def get_service() -> Any:
    global _service, _connection_mode, _instance_hint, _account_error
    with _lock:
        if _service is not None:
            return _service
    try:
        service, mode, instance_hint = _build_configured_service()
    except IBMConnectionError:
        raise
    except Exception as error:
        with _lock:
            _account_error = _public_error("connect")
        raise IBMConnectionError(_public_error("connect")) from error
    with _lock:
        _service = service
        _connection_mode = mode
        _instance_hint = instance_hint
        _account_error = None
        return service


def connect_session(token: str, instance: str | None, channel: str) -> ConnectionStatus:
    """Create a process-memory-only session service.

    The caller is responsible for enforcing HTTPS/localhost and rate limits.
    """

    global _service, _connection_mode, _instance_hint, _account_error
    if not ibm_runtime_available():
        raise IBMConnectionError(
            "Session connection requires the optional qiskit-ibm-runtime dependency on the server."
        )
    from qiskit_ibm_runtime import QiskitRuntimeService

    try:
        service = _call_with_timeout(
            lambda: QiskitRuntimeService(channel=channel, token=token, instance=instance)
        )
        # Authentication is not considered verified until account-scoped
        # discovery succeeds.  No backend name is assumed or hardcoded.
        _call_with_timeout(lambda: service.backends())
    except IBMConnectionError:
        raise
    except Exception as error:
        with _lock:
            _account_error = _public_error("authenticate")
        raise IBMConnectionError(_public_error("authenticate")) from error

    with _lock:
        _service = service
        _connection_mode = "session"
        _instance_hint = _hint(instance)
        _account_error = None
    return connection_status()


def disconnect() -> ConnectionStatus:
    global _service, _connection_mode, _instance_hint, _account_error
    with _lock:
        _service = None
        _connection_mode = "none"
        _instance_hint = None
        _account_error = None
    return connection_status()


def connection_status() -> ConnectionStatus:
    with _lock:
        service_connected = _service is not None
        active_mode = _connection_mode if service_connected else configured_connection_mode()
        return ConnectionStatus(
            ibm_runtime_installed=ibm_runtime_available(),
            ibm_runtime_version=ibm_runtime_version(),
            fake_provider_available=fake_provider_available(),
            qasm3_import_available=qasm3_import_available(),
            connection_mode=active_mode,
            connected=service_connected,
            instance_hint=_instance_hint,
            account_error=_account_error,
            execution_enabled=False,
        )


def _value(obj: Any, name: str, default: Any = None) -> Any:
    try:
        value = getattr(obj, name, default)
        return value() if callable(value) else value
    except Exception:
        return default


def _iso(value: Any) -> str | None:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value) if value else None


def _region_from_instance(instance: Any) -> str | None:
    if not isinstance(instance, str):
        return None
    for region in ("us-east", "eu-de"):
        if region in instance:
            return region
    return None


def _ibm_meta(backend: Any, *, include_status: bool = True) -> dict[str, Any]:
    configuration = _value(backend, "configuration")
    processor = _value(configuration, "processor_type", {}) if configuration is not None else {}
    if not isinstance(processor, dict):
        processor = {}
    status = _value(backend, "status") if include_status else None
    properties = _value(backend, "properties")
    instance = _value(backend, "instance") or _value(backend, "_instance")
    name = _value(backend, "name", "unknown_ibm_backend")
    return {
        "name": str(name),
        "source": "ibm",
        "simulator": False,
        "operational": _value(status, "operational") if status is not None else None,
        "pending_jobs": _value(status, "pending_jobs") if status is not None else None,
        "processor_family": processor.get("family") or processor.get("type"),
        "processor_version": str(processor.get("revision")) if processor.get("revision") is not None else None,
        "region": _region_from_instance(instance),
        "calibration_timestamp": _iso(_value(properties, "last_update_date")),
        "description": "Live backend available to the authenticated IBM Quantum account.",
    }


def _summary(backend: Any) -> BackendSummary:
    meta = _ibm_meta(backend)
    summary = summarize_target(backend.target, meta)
    return summary.model_copy(
        update={
            "processor_version": meta.get("processor_version"),
            "region": meta.get("region"),
        }
    )


def list_ibm_backends(
    *,
    operational_only: bool = False,
    min_qubits: int = 1,
    processor_family: str | None = None,
    region: str | None = None,
    dynamic_circuits: bool | None = None,
    required_instructions: list[str] | None = None,
) -> list[BackendSummary]:
    service = get_service()

    def discover() -> list[BackendSummary]:
        backends = service.backends(
            min_num_qubits=min_qubits,
            dynamic_circuits=dynamic_circuits,
        )
        summaries: list[BackendSummary] = []
        for backend in backends:
            try:
                summary = _summary(backend)
            except Exception:
                continue
            if operational_only and summary.operational is not True:
                continue
            if processor_family and (summary.processor_family or "").lower() != processor_family.lower():
                continue
            if region and (summary.region or "").lower() != region.lower():
                continue
            required = {item.lower() for item in (required_instructions or [])}
            if required and not required.issubset({item.lower() for item in summary.basis_gates}):
                continue
            summaries.append(summary)
        return sorted(summaries, key=lambda item: (item.pending_jobs is None, item.pending_jobs or 0, item.name))

    try:
        return _call_with_timeout(discover)
    except IBMConnectionError:
        raise
    except Exception as error:
        raise IBMConnectionError(_public_error("discover accessible backends")) from error


def resolve_ibm_target(name: str) -> tuple[Any, dict[str, Any]]:
    service = get_service()

    def load() -> tuple[Any, dict[str, Any]]:
        backend = service.backend(name)
        # service.backend is account-scoped; if inaccessible it raises instead
        # of falling back to a hardcoded/public catalog.
        return backend.target, _ibm_meta(backend)

    try:
        return _call_with_timeout(load)
    except IBMConnectionError:
        raise
    except Exception as error:
        raise IBMConnectionError(
            "The requested IBM backend is unavailable to this account or could not be loaded. "
            "Refresh discovery and choose an accessible backend. Provider details were redacted."
        ) from error


def describe_ibm_backend(name: str) -> BackendDetail:
    target, meta = resolve_ibm_target(name)
    return describe_target(target, meta)
