"use client";

// Dedicated custom gate library: Built-in reference alongside My Gates / My
// Operations, favorites, recently used, search, qubit-count filter, and
// import/export — mirrors ProjectsDrawer.tsx's layout and interaction
// conventions (same modal chrome, same inline-confirm delete pattern) so the
// two "manage my saved things" surfaces feel like one product.
import { useMemo, useRef, useState } from "react";
import { Copy, Download, Pencil, Star, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { ModalPortal, useModalLifecycle } from "@/components/workspace/Modal";
import { useToast } from "@/components/workspace/ToastProvider";
import { definitionNumClbits, definitionNumQubits, type CustomDefinition } from "@/lib/customGates";
import { localCustomGateRepository } from "@/lib/customGateRepository";
import { CustomGateGlyph } from "./CustomGateGlyph";

const KIND_LABEL: Record<CustomDefinition["kind"], string> = { matrix: "Matrix", decomposition: "Decomposition", composite: "Composite" };

function formatWhen(timestamp: number): string {
  const delta = Math.max(0, Date.now() - timestamp);
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function CustomGateLibraryDrawer({
  open,
  onClose,
  definitions,
  recentIds,
  onSelect,
  onCreate,
  onEdit,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  definitions: CustomDefinition[];
  recentIds: string[];
  onSelect: (id: string) => void;
  onCreate: () => void;
  onEdit: (definition: CustomDefinition) => void;
  onChanged: () => void;
}) {
  const { pushToast } = useToast();
  const panelRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useModalLifecycle(open, panelRef, onClose, searchRef);

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "favorites" | "recent">("all");
  const [qubitFilter, setQubitFilter] = useState<number | "any">("any");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let list = definitions;
    if (tab === "favorites") list = list.filter((d) => d.favorite);
    if (tab === "recent") {
      const order = new Map(recentIds.map((id, index) => [id, index]));
      list = list.filter((d) => order.has(d.id)).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    }
    if (qubitFilter !== "any") list = list.filter((d) => definitionNumQubits(d) === qubitFilter);
    if (needle) list = list.filter((d) => d.name.toLowerCase().includes(needle) || d.label.toLowerCase().includes(needle) || d.tags.some((t) => t.toLowerCase().includes(needle)));
    return list;
  }, [definitions, tab, qubitFilter, query, recentIds]);

  if (!open) return null;

  function notifyFailure(reason?: string) {
    pushToast(reason ?? "That operation could not be completed.", "error");
  }

  function toggleFavorite(definition: CustomDefinition) {
    const result = localCustomGateRepository.setFavorite(definition.id, !definition.favorite);
    if (!result.ok) return notifyFailure(result.reason);
    onChanged();
  }

  function duplicate(definition: CustomDefinition) {
    const result = localCustomGateRepository.duplicate(definition.id);
    if (!result.ok) return notifyFailure(result.reason);
    pushToast(`Duplicated as "${result.value?.name}".`, "success");
    onChanged();
  }

  function remove(id: string) {
    const result = localCustomGateRepository.remove(id);
    if (!result.ok) return notifyFailure(result.reason);
    pushToast("Custom gate deleted. Placed instances stay on the canvas but can no longer be simulated until replaced or removed.");
    setDeletingId(null);
    onChanged();
  }

  function exportAll() {
    const json = localCustomGateRepository.exportAll();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "quantum-composer-custom-gates.json";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    pushToast(`Exported ${definitions.length} custom gate${definitions.length === 1 ? "" : "s"}.`, "success");
  }

  async function importFile(file: File) {
    if (file.size > 2_000_000) return notifyFailure("Custom gate library files are capped at 2 MB.");
    try {
      const result = localCustomGateRepository.importMany(await file.text());
      if (!result.ok || !result.value) return notifyFailure(result.reason);
      const { imported, skipped } = result.value;
      pushToast(`Imported ${imported} custom gate${imported === 1 ? "" : "s"}${skipped ? `, skipped ${skipped}` : ""}.`, skipped ? "error" : "success");
      onChanged();
    } catch {
      notifyFailure("That file is not valid JSON.");
    }
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <section
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="custom-gate-library-title"
          tabIndex={-1}
          className="drawer-enter absolute inset-y-0 right-0 flex w-[min(34rem,100vw)] flex-col border-l border-line bg-surface shadow-floating"
        >
          <header className="border-b border-line-hairline px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow text-accent-600">Custom gates &amp; operations</p>
                <h2 id="custom-gate-library-title" className="mt-1 text-lg font-semibold text-ink-900">My Gates &amp; My Operations</h2>
                <p className="mt-1 text-xs text-ink-500">Stored only in this browser. Export is the portable backup — shared/exported circuits embed their own dependencies automatically.</p>
              </div>
              <Button variant="quiet" size="sm" onClick={onClose} aria-label="Close custom gate library">✕</Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" size="sm" onClick={onCreate}>Create new</Button>
              <Button variant="quiet" size="sm" onClick={exportAll}><Download className="h-3.5 w-3.5" />Export all</Button>
              <Button variant="quiet" size="sm" onClick={() => fileInputRef.current?.click()}><Upload className="h-3.5 w-3.5" />Import</Button>
              <input ref={fileInputRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Import custom gate library" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = ""; }} />
            </div>
          </header>

          <div className="border-b border-line-hairline px-4 py-3">
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder="Search by name, label, or tag"
              aria-label="Search custom gates"
              onChange={(event) => setQuery(event.target.value)}
              className="min-h-10 w-full rounded-lg border border-line-hairline bg-surface-sunken px-3 text-sm text-ink-900 outline-none focus:border-accent-500"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-1">
                {(["all", "favorites", "recent"] as const).map((id) => (
                  <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)} className={`min-h-8 rounded-lg px-2.5 text-xs font-semibold capitalize transition-colors ${tab === id ? "bg-accent-50 text-accent-700" : "text-ink-500 hover:text-ink-900"}`}>
                    {id}
                  </button>
                ))}
              </div>
              <select aria-label="Filter by qubit count" value={qubitFilter} onChange={(event) => setQubitFilter(event.target.value === "any" ? "any" : Number(event.target.value))} className="min-h-8 rounded-lg border border-line-hairline bg-surface-sunken px-2 text-xs text-ink-700">
                <option value="any">Any qubit count</option>
                {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} qubit{n > 1 ? "s" : ""}</option>)}
              </select>
            </div>
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto p-3" aria-label="Custom gates and operations">
            {visible.length === 0 && (
              <li className="rounded-xl border border-dashed border-line-hairline px-5 py-10 text-center text-sm leading-6 text-ink-500">
                {definitions.length === 0 ? "No custom gates yet. Create one from a matrix, a gate sequence, or a canvas selection." : "Nothing matches these filters."}
              </li>
            )}
            {visible.map((definition) => (
              <li key={definition.id} className="mb-2 rounded-xl border border-line-hairline bg-surface-sunken p-3">
                <div className="flex items-start gap-3">
                  <button type="button" onClick={() => { onSelect(definition.id); onClose(); }} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line-hairline bg-surface"><CustomGateGlyph icon={definition.icon} size={16} /></span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink-900">{definition.name}</span>
                      <span className="mt-0.5 block font-mono text-[11px] text-ink-500">{definition.label} · {KIND_LABEL[definition.kind]} · {definitionNumQubits(definition)}q{definitionNumClbits(definition) > 0 ? ` · ${definitionNumClbits(definition)}c` : ""}</span>
                      {definition.description && <span className="mt-1 block text-[11px] leading-4 text-ink-500">{definition.description}</span>}
                    </span>
                  </button>
                  <button type="button" onClick={() => toggleFavorite(definition)} aria-label={definition.favorite ? "Remove from favorites" : "Add to favorites"} aria-pressed={definition.favorite} className={`shrink-0 rounded-md p-1 ${definition.favorite ? "text-warn-text" : "text-ink-500 hover:text-ink-900"}`}>
                    <Star className="h-4 w-4" fill={definition.favorite ? "currentColor" : "none"} />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-line-hairline pt-2">
                  <span className="mr-auto text-[10px] text-ink-500">updated {formatWhen(definition.updatedAt)}</span>
                  <Button variant="quiet" size="sm" onClick={() => onEdit(definition)}><Pencil className="h-3.5 w-3.5" />Edit</Button>
                  <Button variant="quiet" size="sm" onClick={() => duplicate(definition)}><Copy className="h-3.5 w-3.5" />Duplicate</Button>
                  {deletingId === definition.id ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-danger-text">
                      Delete?
                      <Button variant="danger" size="sm" onClick={() => remove(definition.id)}>Confirm</Button>
                      <Button variant="quiet" size="sm" onClick={() => setDeletingId(null)}>Cancel</Button>
                    </span>
                  ) : (
                    <Button variant="quiet" size="sm" className="!text-danger-text" onClick={() => setDeletingId(definition.id)}><Trash2 className="h-3.5 w-3.5" />Delete</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <footer className="border-t border-line-hairline px-4 py-2">
            <button type="button" onClick={onClose} className="flex w-full items-center justify-center gap-1.5 py-1.5 text-[11px] text-ink-500 hover:text-ink-900">
              <X className="h-3 w-3" /> Close without selecting
            </button>
          </footer>
        </section>
      </div>
    </ModalPortal>
  );
}
