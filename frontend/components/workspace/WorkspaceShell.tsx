"use client";

// Workbench frame: slim top bar (mode switch + global actions), animated
// route content, and global surfaces (command palette, projects drawer).
// Routes stay thin; this shell derives the active mode from the URL. Circuit
// telemetry is no longer global chrome — it lives as a contextual on-canvas
// chip inside Composer itself (see components/composer/CanvasControls.tsx).
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { TopBar } from "@/components/shell/TopBar";
import type { BackendStatus, Mode } from "@/components/shell/types";
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
      <a href="#main-content" className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-md bg-accent-600 px-3 py-2 text-sm font-semibold text-white transition focus:translate-y-0">
        Skip to workspace
      </a>

      <div data-workspace-root className="flex min-h-screen flex-col overflow-x-clip">
        <TopBar
          mode={mode}
          onModeChange={(next) => router.push(MODE_ROUTES[next])}
          backendStatus={backendStatus}
          onRetryBackend={() => void checkBackend(true)}
          onOpenPalette={() => setPaletteOpen(true)}
          onOpenProjects={() => setProjectsOpen(true)}
          activeProjectName={workspace.activeProjectName}
          saveState={workspace.saveState}
        />

        <main id="main-content" tabIndex={-1} className="min-h-0 flex-1 outline-none">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className="min-h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

        <footer className="border-t border-line-hairline bg-surface px-5 py-4 text-center text-[11px] leading-5 text-ink-500">
          <p>Educational simulator · Not affiliated with IBM · No real-hardware execution is configured.</p>
          <p className="mt-0.5">Arbitrary 100-qubit statevector simulation is infeasible. Larger circuits are supported only when stabilizer or low-entanglement MPS structure makes them tractable.</p>
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
