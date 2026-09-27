"""Private JSON worker entry point; accepts declarative data only."""
import json
import sys


def main():
    request = json.load(sys.stdin)
    try:
        import resource
        memory = int(request["memory_mb"]) * 1024**2
        resource.setrlimit(resource.RLIMIT_AS, (memory, memory))
        seconds = int(request["cpu_seconds"])
        resource.setrlimit(resource.RLIMIT_CPU, (seconds, seconds + 1))
    except ImportError:
        pass  # Windows needs a container/job memory limit; deadline still applies.
    try:
        trusted_targets = {}
        if len(sys.argv) == 2:
            # Private file created by execution.execute, never HTTP-supplied.
            import pickle
            with open(sys.argv[1], "rb") as handle:
                trusted_targets = pickle.load(handle)
        from schemas import CircuitRequest, SimulateV2Request
        if request["kind"] == "v1":
            from simulator import simulate
            result = simulate(CircuitRequest(**request["payload"]))
        elif request["kind"] == "v2":
            from engines.router import simulate
            body = SimulateV2Request(**request["payload"])
            result = simulate(body.circuit, body.options)
        elif request["kind"] == "hardware_import":
            from hardware.schemas import ImportCircuitRequest
            from hardware.transpilation import import_circuit
            result = import_circuit(ImportCircuitRequest(**request["payload"])).model_dump(mode="json")
        elif request["kind"] == "hardware_transpile":
            from hardware.schemas import TranspileRequest
            from hardware.transpilation import transpile_request
            result = transpile_request(TranspileRequest(**request["payload"]), resolved_target=trusted_targets.get(0)).model_dump(mode="json")
        elif request["kind"] == "hardware_compare":
            from hardware.schemas import CompareRequest
            from hardware.transpilation import compare_request
            result = compare_request(CompareRequest(**request["payload"]), resolved_targets=trusted_targets).model_dump(mode="json")
        else:
            raise ValueError("Unknown worker operation")
        from pydantic import TypeAdapter
        print(TypeAdapter(dict).dump_json({"result": result}).decode())
    except Exception as error:
        status = 503 if type(error).__name__ in {"EngineNotAvailableError", "QuantumDependencyError"} else 422
        print(json.dumps({"error": str(error), "status": status}))


if __name__ == "__main__":
    main()
