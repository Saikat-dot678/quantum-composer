"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Maximize2, Minus, Plus, Scan, X } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { ModalPortal, useModalLifecycle } from "@/components/workspace/Modal";
import {
  circuitDiagramDataUrl,
  clampDiagramZoom,
  fitDiagramZoom,
  type CircuitDiagramPayload,
} from "@/lib/circuitDiagram";

type DiagramTheme = "surface" | "lab";

interface CircuitDiagramProps {
  diagram: CircuitDiagramPayload | null | undefined;
  title?: string;
  warning?: string | null;
  loading?: boolean;
  theme?: DiagramTheme;
  className?: string;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function decodeBase64(content: string): ArrayBuffer {
  const binary = window.atob(content);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return buffer;
}

export function CircuitDiagram({
  diagram,
  title = "Circuit diagram",
  warning = null,
  loading = false,
  theme = "surface",
  className = "",
}: CircuitDiagramProps) {
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const fullscreenViewportRef = useRef<HTMLDivElement>(null);
  const fullscreenPanelRef = useRef<HTMLElement>(null);
  const closeFullscreen = useCallback(() => setFullscreen(false), []);
  useModalLifecycle(fullscreen, fullscreenPanelRef, closeFullscreen);

  const source = circuitDiagramDataUrl(diagram);
  const lab = theme === "lab";

  useEffect(() => {
    setZoom(1);
    setImageFailed(false);
  }, [diagram?.content]);

  const fit = useCallback((viewport: HTMLDivElement | null) => {
    if (!viewport || !diagram) return;
    setZoom(fitDiagramZoom(viewport.clientWidth, diagram.width));
    viewport.scrollTo({ left: 0, top: 0 });
  }, [diagram]);

  const reset = useCallback((viewport: HTMLDivElement | null) => {
    setZoom(1);
    viewport?.scrollTo({ left: 0, top: 0 });
  }, []);

  const downloadSvg = useCallback(() => {
    if (!diagram || !source) return;
    downloadBlob(new Blob([decodeBase64(diagram.content)], { type: "image/svg+xml;charset=utf-8" }), "quantum-circuit.svg");
  }, [diagram, source]);

  const downloadPng = useCallback(() => {
    if (!diagram || !source) return;
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 4096 / Math.max(diagram.width, diagram.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(diagram.width * scale));
      canvas.height = Math.max(1, Math.round(diagram.height * scale));
      const context = canvas.getContext("2d");
      if (!context) return;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => { if (blob) downloadBlob(blob, "quantum-circuit.png"); }, "image/png");
    };
    image.src = source;
  }, [diagram, source]);

  function Toolbar({ viewport, allowFullscreen = true }: { viewport: React.RefObject<HTMLDivElement | null>; allowFullscreen?: boolean }) {
    return (
      <div role="toolbar" aria-label={`${title} controls`} className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="quiet" aria-label="Zoom out circuit diagram" disabled={!source || zoom <= 0.5} onClick={() => setZoom((value) => clampDiagramZoom(value - 0.25))}><Minus className="h-3.5 w-3.5" /></Button>
        <button type="button" className={`min-h-8 min-w-14 rounded-md px-2 font-mono text-[10px] font-semibold ${lab && !fullscreen ? "text-lab-muted" : "text-ink-600"}`} onClick={() => reset(viewport.current)} disabled={!source} aria-label="Reset circuit diagram zoom">{Math.round(zoom * 100)}%</button>
        <Button size="sm" variant="quiet" aria-label="Zoom in circuit diagram" disabled={!source || zoom >= 3} onClick={() => setZoom((value) => clampDiagramZoom(value + 0.25))}><Plus className="h-3.5 w-3.5" /></Button>
        <Button size="sm" variant="quiet" aria-label="Fit circuit diagram to viewport" disabled={!source} onClick={() => fit(viewport.current)}><Scan className="h-3.5 w-3.5" /><span className="hidden sm:inline">Fit</span></Button>
        {allowFullscreen && <Button size="sm" variant="quiet" aria-label="Open fullscreen circuit diagram" disabled={!source} onClick={() => setFullscreen(true)}><Maximize2 className="h-3.5 w-3.5" /><span className="hidden sm:inline">Fullscreen</span></Button>}
        <Button size="sm" variant="quiet" aria-label="Download circuit diagram as SVG" disabled={!source} onClick={downloadSvg}><Download className="h-3.5 w-3.5" /><span className="hidden md:inline">SVG</span></Button>
        <Button size="sm" variant="quiet" aria-label="Download circuit diagram as PNG" disabled={!source} onClick={downloadPng}><Download className="h-3.5 w-3.5" /><span className="hidden md:inline">PNG</span></Button>
      </div>
    );
  }

  function Viewport({ viewport, fullscreenView = false }: { viewport: React.RefObject<HTMLDivElement | null>; fullscreenView?: boolean }) {
    if (loading) {
      return <div role="status" className="grid min-h-48 place-items-center bg-white px-4 text-center text-xs text-ink-500"><span><span className="mx-auto mb-3 block h-7 w-7 animate-spin rounded-full border-2 border-accent-200 border-t-accent-600" />Rendering circuit diagramâ€¦</span></div>;
    }
    if (!source || imageFailed) {
      return <div role="status" className="grid min-h-48 place-items-center bg-white px-4 py-8 text-center"><div><p className="text-xs font-semibold text-ink-700">Circuit diagram unavailable</p><p className="mx-auto mt-1 max-w-lg text-[11px] leading-5 text-ink-500">{warning ?? (imageFailed ? "The graphical diagram could not be displayed. The simulation result is still available." : "The backend did not return a graphical diagram for this circuit.")}</p></div></div>;
    }
    return (
      <div
        ref={viewport}
        tabIndex={0}
        aria-label={`${title} scrollable viewport`}
        className={`${fullscreenView ? "h-full min-h-0" : "max-h-[24rem] min-h-48"} overflow-auto overscroll-contain bg-white p-3 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent-500 [touch-action:pan-x_pan-y]`}
      >
        <div style={{ width: diagram!.width * zoom, height: diagram!.height * zoom }} className="relative shrink-0 transition-[width,height] duration-150 motion-reduce:transition-none">
          {/* The source is a validated in-memory SVG data URL; Next Image's
              remote optimizer cannot improve or safely proxy this payload. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={source}
            alt={`${title}, graphical Qiskit circuit`}
            width={diagram!.width}
            height={diagram!.height}
            draggable={false}
            onError={() => setImageFailed(true)}
            onLoad={() => { if (!fullscreenView && zoom === 1) fit(viewport.current); }}
            className="block max-w-none select-none"
            style={{ width: "100%", height: "100%" }}
          />
        </div>
      </div>
    );
  }

  return (
    <section aria-label={title} className={`${lab ? "border-lab-borderStrong bg-lab-panel" : "border-line bg-surface"} min-w-0 overflow-hidden rounded-lg border ${className}`}>
      <div className={`${lab ? "border-lab-border text-lab-text" : "border-line-hairline text-ink-900"} flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2`}>
        <div className="min-w-0">
          <p className="instrument-label">Circuit diagram</p>
          <p className={`${lab ? "text-lab-faint" : "text-ink-500"} mt-0.5 truncate text-[10px]`}>{title}{diagram?.wrapped ? " Â· wrapped into multiple rows" : " Â· Qiskit Matplotlib SVG"}</p>
        </div>
        <Toolbar viewport={viewportRef} />
      </div>
      <Viewport viewport={viewportRef} />
      {diagram?.wrapped && <p className={`${lab ? "border-lab-border text-lab-faint" : "border-line-hairline text-ink-500"} border-t px-3 py-2 text-[10px] leading-4`}>This circuit was wrapped into multiple rows to keep gate labels readable and the render size bounded.</p>}

      {fullscreen && (
        <ModalPortal>
          <div className="fixed inset-0 z-[110] flex bg-black/65 p-2 sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeFullscreen(); }}>
            <section ref={fullscreenPanelRef} role="dialog" aria-modal="true" aria-label={`Fullscreen ${title}`} tabIndex={-1} className="mx-auto flex h-full min-h-0 w-full max-w-[96rem] flex-col overflow-hidden rounded-xl2 border border-line bg-surface shadow-floating">
              <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2 sm:px-4">
                <div><p className="instrument-label">Circuit diagram</p><p className="mt-0.5 text-xs font-semibold text-ink-900">{title}</p></div>
                <div className="flex flex-wrap items-center gap-1.5"><Toolbar viewport={fullscreenViewportRef} allowFullscreen={false} /><Button size="sm" variant="quiet" onClick={closeFullscreen} aria-label="Close fullscreen circuit diagram"><X className="h-4 w-4" /></Button></div>
              </header>
              <div className="min-h-0 flex-1"><Viewport viewport={fullscreenViewportRef} fullscreenView /></div>
            </section>
          </div>
        </ModalPortal>
      )}
    </section>
  );
}
