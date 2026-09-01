"use client";

import { motion } from "motion/react";
import { useTheme } from "@/components/theme-provider";

/**
 * Two-state switch with a sliding knob. Reflects the *resolved* theme, so a
 * "system" user still sees which mode they are actually looking at.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolved, toggle } = useTheme();
  const isDark = resolved === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      aria-pressed={isDark}
      className={`relative flex h-7 w-13 shrink-0 items-center border-2 border-ink px-0.5 ${className ?? ""}`}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 34 }}
        className="grid size-5 place-items-center bg-ink text-[0.5rem] text-paper"
        style={{ marginLeft: isDark ? "auto" : 0 }}
      >
        {isDark ? "D" : "L"}
      </motion.span>
    </button>
  );
}
