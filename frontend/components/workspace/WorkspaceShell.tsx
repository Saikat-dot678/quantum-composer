"use client";

// Workbench frame: left activity rail (bottom tab bar on narrow screens),
// sticky console header with live telemetry, route-keyed content, and the
// global surfaces (command palette, projects drawer). Routes stay thin; this
// shell derives the active mode from the URL.
import { useCallback, useEffect, useRef, useState, useMemo, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ConsoleHeader } from "@/components/shell/ConsoleHeader";
import { NavRail } from "@/components/shell/NavRail";
import type { BackendStatus, Mode } from "@/components/shell/types";
import { analyzeLocally } from "@/lib/feasibility";
import { labApi } from "@/lib/labApi";
import { CommandPalette } from "./CommandPalette";
import { ProjectsDrawer } from "./ProjectsDrawer";
import { useToast } from "./ToastProvider";
import { useWorkspace } from "./WorkspaceProvider";

const MODE_ROUTES: Record<Mode, string> = {
  composer: "/composer",
  simulator: "/simulator",
  crypto: "/crypto",
};

function modeFromPathname(pathname: string): Mode {
  if (pathname.startsWith("/simulator")) return "simulator";
  if (pathname.startsWith("/crypto")) return "crypto";
  return "composer";
}

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const workspace = useWorkspace();
  const { pushToast } = useToast();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("checking");
  const healthRequest = useRef(0);
  const noticeShown = useRef(false);

  const mode = modeFromPathname(pathname ?? "/composer");
  const telemetryCircuit = mode === "crypto" ? null : mode === "simulator" ? workspace.labCircuit ?? workspace.circuit : workspace.circuit;
  const feasibility = useMemo(() => (telemetryCircuit ? analyzeLocally(telemetryCircuit) : null), [telemetryCircuit]);

  const checkBackend = useCallback(async (showChecking = true) => {
    const token = ++healthRequest.current;
    if (showChecking) setBackendStatus("checking");
    try {
      const response = await labApi.health();
      if (healthRequest.current === token) setBackendStatus(response.status === "ok" ? "online" : "offline");
    } catch {
      if (healthRequest.current === token) setBackendStatus("offline");
    }
  }, []);

  useEffect(() => {
    void checkBackend();
    const interval = window.setInterval(() => void checkBackend(false), 30_000);
    return () => {
      window.clearInterval(interval);
      healthRequest.current += 1;
    };
  }, [checkBackend]);

  // Surface storage recovery notices exactly once as a toast.
  useEffect(() => {
    if (workspace.storageNotice && !noticeShown.current) {
      noticeShown.current = true;
      pushToast(workspace.storageNotice, "error");
    }
  }, [workspace.storageNotice, pushToast]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      <a href="#main-content" className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-md bg-accent-cyan px-3 py-2 text-sm font-semibold text-lab-bg transition focus:translate-y-0">
        Skip to workspace
      </a>

      <div data-workspace-root className="min-h-screen overflow-x-clip pb-16 lg:pb-0 lg:pl-[76px]">
        <NavRail
          mode={mode}
          onModeChange={(next) => router.push(MODE_ROUTES[next])}
          onOpenProjects={() => setProjectsOpen(true)}
          onOpenPalette={() => setPaletteOpen(true)}
        />

        <ConsoleHeader
          mode={mode}
          backendStatus={backendStatus}
          onRetryBackend={() => void checkBackend(true)}
          feasibility={feasibility}
          saveState={workspace.saveState}
          activeProjectName={workspace.activeProjectName}
        />

        <main id="main-content" tabIndex={-1} className="outline-none">
          <div key={pathname} className="route-fade">
            {children}
          </div>
        </main>

        <footer className="border-t border-lab-border bg-lab-surface/65 px-5 py-6 text-center text-xs leading-5 text-lab-faint">
          <p>Educational simulator · Not affiliated with IBM · No real-hardware execution is configured.</p>
          <p className="mt-1">Arbitrary 100-qubit statevector simulation is infeasible. Larger circuits are supported only when stabilizer or low-entanglement MPS structure makes them tractable.</p>
        </footer>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenProjects={() => {
          setPaletteOpen(false);
          setProjectsOpen(true);
        }}
      />
      <ProjectsDrawer open={projectsOpen} onClose={() => setProjectsOpen(false)} />
    </>
  );
}
