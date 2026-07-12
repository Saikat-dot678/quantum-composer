"use client";

// Registered-actions architecture for the command palette: any mounted view can
// contribute commands (e.g. the Composer registers Run/Analyze while mounted),
// and the palette consumes the merged set. This keeps the palette decoupled
// from page internals — actions appear and disappear with their owners.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export interface RegisteredAction {
  id: string;
  group: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  run: () => void;
}

interface RegistryValue {
  actions: RegisteredAction[];
  register: (ownerId: string, actions: RegisteredAction[]) => () => void;
}

const ActionRegistryContext = createContext<RegistryValue | null>(null);

export function useActionRegistry(): RegistryValue {
  const value = useContext(ActionRegistryContext);
  if (!value) throw new Error("useActionRegistry must be used inside ActionRegistryProvider");
  return value;
}

/** Register a set of palette actions for the lifetime of the calling component. */
export function useRegisterActions(ownerId: string, actions: RegisteredAction[]): void {
  const { register } = useActionRegistry();
  // The actions array identity changes every render; serialize the parts that matter.
  const signature = JSON.stringify(actions.map(({ id, label, hint, disabled, group }) => ({ id, label, hint, disabled, group })));
  const latest = useRef(actions);
  latest.current = actions;
  useEffect(() => {
    // Register stable wrappers that always call the latest handler.
    const wrapped = latest.current.map((action) => ({ ...action, run: () => latest.current.find((a) => a.id === action.id)?.run() }));
    return register(ownerId, wrapped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, signature, register]);
}

export function ActionRegistryProvider({ children }: { children: ReactNode }) {
  const [owners, setOwners] = useState<Map<string, RegisteredAction[]>>(new Map());

  const register = useCallback((ownerId: string, actions: RegisteredAction[]) => {
    setOwners((current) => {
      const next = new Map(current);
      next.set(ownerId, actions);
      return next;
    });
    return () => {
      setOwners((current) => {
        const next = new Map(current);
        next.delete(ownerId);
        return next;
      });
    };
  }, []);

  const actions = useMemo(() => Array.from(owners.values()).flat(), [owners]);

  return <ActionRegistryContext.Provider value={{ actions, register }}>{children}</ActionRegistryContext.Provider>;
}
