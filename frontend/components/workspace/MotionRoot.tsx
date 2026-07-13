"use client";

// Wires Framer Motion's global reduced-motion handling once, at the root:
// `reducedMotion="user"` makes every `motion.*` component and `AnimatePresence`
// transition in this app automatically respect the OS `prefers-reduced-motion`
// setting without each component re-implementing the check.
import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

export function MotionRoot({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
