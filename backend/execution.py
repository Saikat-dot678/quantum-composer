"""Bounded, killable subprocess execution; one ASGI worker per container."""
from __future__ import annotations
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import tempfile
import pickle
from fastapi import HTTPException
from engines.limits import server_memory_mb

_slots = threading.BoundedSemaphore(max(1, int(os.getenv("QUANTUM_COMPOSER_MAX_JOBS", "2"))))


def execute(kind: str, payload: dict, *, trusted_targets: dict | None = None):
    if not _slots.acquire(blocking=False):
        raise HTTPException(429, "All execution slots are busy. Retry after the current jobs finish.")
    process = None
    target_directory = None
    try:
        timeout = max(1, min(int(os.getenv("QUANTUM_COMPOSER_JOB_TIMEOUT_SECONDS", "60")), 300))
        env = {**os.environ, "RAYON_NUM_THREADS": "2"}
        command = [sys.executable, str(Path(__file__).with_name("execution_worker.py"))]
        if trusted_targets is not None:
            # Only server-resolved Qiskit Targets and display metadata enter this
            # private file. Never accept serialized objects or paths from HTTP.
            target_directory = tempfile.TemporaryDirectory(prefix="qc-targets-")
            target_path = Path(target_directory.name) / "targets.pkl"
            with target_path.open("wb") as handle:
                pickle.dump(trusted_targets, handle)
            command.append(str(target_path))
        process = subprocess.Popen(
            command,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, env=env,
        )
        try:
            output, _ = process.communicate(json.dumps({"kind": kind, "payload": payload,
                "memory_mb": server_memory_mb() + 2048, "cpu_seconds": timeout}), timeout=timeout)
        except subprocess.TimeoutExpired:
            process.kill()
            process.communicate()
            raise HTTPException(408, "Execution exceeded the server deadline and was terminated.")
        if process.returncode or not output:
            raise HTTPException(422, "Execution worker stopped, possibly because its resource limit was exceeded. Reduce circuit size or shots.")
        response = json.loads(output)
        if "error" in response:
            raise HTTPException(response.get("status", 422), response["error"])
        return response["result"]
    finally:
        if process is not None and process.poll() is None:
            process.kill()
            process.wait()
        if target_directory is not None:
            target_directory.cleanup()
        _slots.release()
