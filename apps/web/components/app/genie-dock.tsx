"use client";

import { AnimatePresence, motion } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { GeniePanel } from "./genie-panel";
import { genieScopeLabel, genieSuggestionsFor } from "@/lib/data/genie-context";

/**
 * Genie, available from every screen behind the app shell.
 *
 * It used to be a panel on the dashboard only, which made the product's
 * intelligence layer look like a single widget. Mounting it once in the layout
 * puts the same conversation one keystroke away everywhere, and the suggested
 * questions change to match whatever screen the student is on.
 *
 * The Journey page keeps its own inline panel — this dock hides there so the
 * two do not compete.
 */
export function GenieDock() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Closing on navigation avoids the panel following the user across screens
  // still showing the previous screen's suggestions.
  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Prevent the page behind the drawer from scrolling with it.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  if (pathname === "/journey") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-label="Ask Genie about this screen"
        className="fixed right-5 bottom-5 z-40 flex items-center gap-2.5 border-2 border-ink bg-ink px-5 py-3 font-mono text-[0.6875rem] font-bold tracking-[0.14em] text-paper uppercase shadow-[4px_4px_0_0_var(--hot)] transition-colors duration-300 hover:border-hot hover:bg-hot hover:text-on-hot"
      >
        <span className="size-1.5 bg-hot transition-colors group-hover:bg-on-hot" aria-hidden />
        Ask Genie
      </button>

      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-ink/35 backdrop-blur-[2px]"
            />
            <motion.aside
              role="dialog"
              aria-label="Ask Genie"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[min(34rem,100vw)] flex-col bg-paper"
            >
              <div className="flex items-center border-b-2 border-ink px-5 py-3">
                <span className="k-label">Genie</span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="ml-auto font-mono text-[0.6875rem] tracking-[0.12em] text-muted uppercase transition-colors hover:text-hot"
                >
                  Close
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <GeniePanel
                  suggestions={genieSuggestionsFor(pathname)}
                  scopeLabel={genieScopeLabel(pathname)}
                />
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
