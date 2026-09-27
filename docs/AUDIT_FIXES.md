# Correctness and reliability fixes

Scope: `main` at `e108b5d`, the only remote branch returned by the repository fetch during the audit. Changes live on `fix/audit-correctness-and-reliability`. Historical commits are not independent maintained branches.

## Findings addressed

| Finding | Change | Regression coverage |
|---|---|---|
| F01: advertised gates fail on native Aer execution | Lower circuits to each backend before execution; synthesize local Clifford rotations for stabilizer execution. Generated Qiskit code also transpiles. | CH, iSWAP, DCX unitary equivalence and real Aer execution; RX/RY/RZ/P Clifford lowering |
| F02: explicit engines silently ignore noise | Reject noise requests on incompatible engines; noisy density simulation uses an explicit `u/cx/id` lowering basis and refuses noise-model failures. | Explicit engine rejection; real noisy density analysis |
| F03: nested custom-gate import collisions change behavior | Resolve and remap the complete dependency graph transactionally, including identical parents whose children change; reject missing dependencies and cycles. | Colliding parent/child X-versus-Z example, atomic failure tests |
| F04: truncated MPS state marked exact | Propagate approximation uncertainty into state metrics and UI; enforce an administrator-bounded bond dimension. | Existing MPS metadata tests; state analysis coverage |
| F05: IBM account state shared across users | Scope provider objects to random browser-session identifiers; expire inactive sessions; disable implicit server-account fallback by default. | Session-state isolation and redacted credential failures |
| F06: caller-controlled resource limits | Enforce server memory/work budgets, job admission, killable process deadlines, and MPS bond bounds. Hardware parsing/transpilation also uses workers. | Budget clamping, repeated-measurement work, busy admission, timeout kill, resolved-target worker handoff |
| F07: expensive density-matrix analysis | Compute purity in quadratic work; cap density analysis at 10 qubits and global spectrum/entropy at 8; label truncated spectra. | Guard against global eigendecomposition above its cap |
| F08: Stim sampling bound ignores repeated records | Count measurement records as well as output width in work estimates. | Repeated writes to one classical bit |
| F09: sampled/theoretical comparison ignores classical mapping | Return a versioned measurement map and marginalize/reorder state probabilities into classical labels; suppress incomplete and approximate comparisons. | Permuted, partial, unused-bit, and top-k distributions |
| F10: automatic measurement differs across engines | Measure into existing classical bits, add only missing bits, and flatten Qiskit register-separated counts. | Automatic measurement with zero, equal, and extra classical bits |
| F11: Stim tableau drops idle qubits | Allocate the complete tableau and normalize generator bit order. | Idle three-qubit register |
| F12: debounce loses edits during project transitions | Flush before switching, duplication, detachment, deletion, and page exit; block transitions on failed writes. | Rapid switching, failed storage, active deletion, pagehide |
| F13: obsolete comparison responses reappear | Reject responses from older circuit/library generations. | Deferred response after editing |
| F14: custom-definition changes leave stale Composer results | Invalidate results using the resolved circuit; save definition snapshots with projects; preserve snapshot physics during restoration and duplication. | Project snapshot restore/duplicate after library mutation |
| F15: browser preview treats mid-circuit measurement as unitary | Refuse a pure-state preview when a later gate touches a measured qubit. | H–measure–H versus terminal measurement |
| F16: QBER=1 produces a key | Reject high-error key extraction, expose aborted/insufficient states, remove disclosed test bits, and label output as illustrative. | Fully corrupted channel; disclosed bits excluded from hashing |
| F17: recovery backups truncate stored data | Preserve complete corrupt payloads and refuse replacement when backup creation fails. | Payload above one million characters and quota failure |
| F18: validation echoes credential input | Return validation locations/types/messages without input or context objects. | Invalid credential request containing sensitive strings |

Additional improvements: stale-tab project saves fail visibly instead of overwriting external edits; deleting a definition used by another definition is blocked; QASM imports reject nonstandard filesystem includes and oversized register declarations; routing SWAPs are counted after decomposing logical SWAPs; E91 reports setting counts, an approximate standard error, and insufficient sampling. Client cancellation and deadlines remain active through response-body parsing. CI adds a real backend/browser integration job that fails when the backend is unavailable.

## Execution and deployment contract

Use one ASGI worker per container. Account sessions and admission slots are in process memory; multiple workers require an external session/admission design or sticky routing. Process restart expires connections. A browser sends a random 256-bit `X-Quantum-Session` identifier for hardware requests. Treat it as an ephemeral bearer secret and keep HTTPS enabled outside localhost. Sessions expire after 30 minutes of inactivity, with at most 100 retained sessions. Four concurrent IBM provider calls are allowed; their response timeout does not kill the underlying provider thread, so hung calls consume those four slots until completion or restart.

| Environment variable | Default | Meaning |
|---|---:|---|
| `QUANTUM_COMPOSER_MAX_MEMORY_MB` | 1024 | Simulation budget, clamped to 64–65536 MB. Half is available to the engine estimator to leave working headroom. Caller budgets can lower it. |
| `QUANTUM_COMPOSER_MAX_JOBS` | 2 | Concurrent simulation/import/transpilation worker processes. |
| `QUANTUM_COMPOSER_JOB_TIMEOUT_SECONDS` | 60 | Per-worker wall deadline, clamped to 1–300 seconds. CPU limits also apply on POSIX. |
| `QUANTUM_COMPOSER_ALLOW_SERVER_ACCOUNT` | unset | Set to `1` only for an intentionally trusted single-user installation that should use environment/saved IBM credentials. |

POSIX workers also receive an address-space ceiling of the configured memory budget plus 2048 MB for Python, native libraries, and rendering. This is a virtual-address ceiling, not an RSS guarantee. Configure container memory/CPU limits for the deployment as well. On Windows the process deadline works, but `resource` limits are unavailable; use an OS/container memory limit. Busy workers return 429; deadline termination returns 408; infeasible/unsupported requests return 422. A client abort does not instantly kill a job; the server deadline still bounds its lifetime.

IBM discovery stays in the account-scoped parent. Only resolved Qiskit targets and display metadata pass through a private temporary file to the worker; account/service objects and credentials do not. The worker's trusted-object file is created exclusively by the server and is never accepted as an HTTP path or uploaded serialized payload. Targets and ordinary requests execute under the same worker admission/deadline limits.

Sampling work is capped at 10 million bit-record cells and 50 million operation-shots. MPS effective bond dimension is memory-derived and at most 256. When that cap can truncate and the caller has supplied no explicit bond limit, approximation must be enabled. Reported approximation means truncation is possible; discarded weight is not measured. These conservative limits may reject some structured circuits that would fit with a more specialized algorithm.

## Result compatibility

Counts use fixed-width classical strings with the highest classical index on the left. Automatic measurement maps qubit `q[i]` to classical bit `c[i]`, retaining extra zero classical bits. V2 metadata contains `measurement.version = 1`, `classical_to_qubit`, `num_clbits`, automatic-measurement status, circuit fingerprint, engine version, and applied options. Consumers must not compare quantum basis labels directly to classical outcomes. Old saved results without this metadata still render, but omit that comparison.

Density spectra indicate total/returned eigenvalue counts and omitted weight. Above 8 qubits, global entropy and spectrum are unavailable rather than estimated. BB84/E91 are deterministic educational models when seeded; they do not implement authenticated reconciliation, finite-key proofs, hardware randomness, or deployable key establishment. The E91 standard error is a plug-in sampling diagnostic, not a confidence interval or Bell-test certification.

Project snapshots restore saved definitions even if the shared library changed. Missing definitions in legacy projects cannot be reconstructed automatically. A failed save retains the in-memory circuit and blocks destructive navigation. Cross-tab protection compares the last observed project content before writing; it is not a distributed transaction and simultaneous localStorage writes still require a future transactional store for a strict concurrency guarantee.

## Verification

- Backend suite runs with real Qiskit, Aer, Stim, IBM fake targets, and isolated execution workers.
- Frontend unit/workflow tests include jsdom persistence, lifecycle, request-race, cancellation, and scientific comparison regressions.
- TypeScript, ESLint, and the production Next.js build are checked.
- `requirements-tested-py312.txt` records the complete clean Python 3.12 verification environment; the normal requirement files retain their supported ranges.
- Browser execution could not be completed locally because the Playwright Chromium download returned corrupt/truncated archives. The connected CI job is included but must pass in GitHub before browser-level validation is claimed.
- Live IBM account authentication was not exercised with real credentials; account boundaries use mocked provider objects and real local/fake-target compilation tests.
