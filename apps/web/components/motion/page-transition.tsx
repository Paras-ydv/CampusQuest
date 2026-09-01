"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/**
 * Entrance for a whole route. Used from `template.tsx`, which Next re-mounts on
 * every navigation — that remount is what re-triggers the animation.
 *
 * Enter-only by design: App Router unmounts the outgoing route before the new
 * one renders, so a genuine exit animation would need the old tree kept alive.
 * A fast, confident entrance reads better than a laggy cross-fade anyway.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();

  if (reduced) return <>{children}</>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
