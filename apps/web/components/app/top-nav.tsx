"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { NotificationBell } from "./notification-bell";
import { ThemeToggle } from "./theme-toggle";
import { Avatar } from "@/components/ui/primitives";

const NAV = [
  { href: "/journey", label: "Journey" },
  { href: "/quests", label: "Quests" },
  { href: "/time-machine", label: "Machine" },
  { href: "/ats", label: "ATS" },
  { href: "/people", label: "People" },
  { href: "/messages", label: "Messages" },
  { href: "/radar", label: "Radar" },
  { href: "/research", label: "Research" },
  { href: "/placements", label: "Placements" },
] as const;

export function TopNav({
  initials,
  goalRole,
  signedIn = false,
}: {
  initials: string;
  goalRole: string;
  /** True only for a real Supabase session — mock mode has nothing to sign out of. */
  signedIn?: boolean;
}) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);

  // Following a link inside the drawer has to close it, and the drawer is
  // still mounted while the new route renders.
  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Prevent the page behind the drawer from scrolling with it.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-50 border-b-2 border-ink bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3.5 lg:gap-6 lg:px-5">
          <Link
            href="/journey"
            className="k-display shrink-0 text-[0.95rem] tracking-[-0.045em]"
          >
            Campus<span className="text-hot">Quest</span>
          </Link>

          {/* The links only fit inline once the viewport is wide enough to
              lay them all out. Below that they shared a ~27px scroll window
              with no scrollbar to say so, which is what felt congested — so
              they move into the drawer instead. */}
          <nav className="-mx-1 hidden flex-1 items-center gap-1 overflow-x-auto px-1 lg:flex [scrollbar-width:none]">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "relative shrink-0 px-2.5 py-1.5 font-mono text-[0.6875rem] font-semibold tracking-[0.13em] uppercase transition-colors duration-200",
                    active ? "text-ink" : "text-muted hover:text-ink",
                  )}
                >
                  {item.label}
                  {active ? (
                    // Shared layout id makes the underline slide between links
                    // rather than cross-fading.
                    <motion.span
                      layoutId="nav-underline"
                      className="absolute inset-x-2 -bottom-0.5 h-[3px] bg-hot"
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    />
                  ) : null}
                </Link>
              );
            })}
          </nav>

          {/* With the inline nav gone there is nothing to push the controls to
              the right edge. */}
          <div className="flex-1 lg:hidden" />

          {/* At lg the links already need every pixel they have; the goal role
              only earns its place once there is slack. The drawer carries it
              on the sizes that drop it here. */}
          <div className="hidden shrink-0 items-center gap-3 xl:flex">
            <span className="font-mono text-[0.6875rem] tracking-[0.1em] text-muted uppercase">
              Goal — <span className="text-ink">{goalRole}</span>
            </span>
          </div>

          <NotificationBell />
          <ThemeToggle className="shrink-0" />

          {/* The avatar is the way into the profile — the one place a student can
              change the goal role everything else is measured against. */}
          <Link
            href="/profile"
            aria-label="Your profile"
            aria-current={pathname === "/profile" ? "page" : undefined}
            className={clsx(
              "shrink-0 rounded-full transition-opacity duration-200 hover:opacity-80",
              pathname === "/profile" && "ring-2 ring-hot ring-offset-2 ring-offset-paper",
            )}
          >
            <Avatar initials={initials} size="sm" />
          </Link>

          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="mobile-nav"
            className="flex size-8 shrink-0 items-center justify-center border-2 border-transparent text-muted transition-colors duration-200 hover:text-ink lg:hidden"
          >
            {/* Drawn rather than imported, to keep the icon set at zero. */}
            <svg viewBox="0 0 20 20" className="size-[1.05rem]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M3 6h14M3 10h14M3 14h14" />
            </svg>
          </button>
        </div>
      </header>

      {/* Deliberately a sibling of <header>, not a child: `backdrop-blur-md`
          makes the header a containing block for fixed descendants, which would
          trap a full-height drawer inside the header's own box. */}
      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[60] bg-ink/35 backdrop-blur-[2px] lg:hidden"
            />
            <motion.div
              id="mobile-nav"
              initial={reduceMotion ? { opacity: 0 } : { x: "100%" }}
              animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { x: "100%" }}
              transition={{ duration: reduceMotion ? 0.2 : 0.42, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-y-0 right-0 z-[70] flex w-[min(20rem,86vw)] flex-col border-l-2 border-ink bg-paper lg:hidden"
            >
              <div className="flex items-center border-b-2 border-ink px-5 py-3.5">
                <span className="k-label">Menu</span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="ml-auto font-mono text-[0.6875rem] tracking-[0.12em] text-muted uppercase transition-colors hover:text-hot"
                >
                  Close
                </button>
              </div>

              <nav aria-label="Main" className="flex flex-col overflow-y-auto">
                {NAV.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={clsx(
                        "flex items-center gap-3 border-b-2 border-line-soft px-5 py-4 font-mono text-[0.75rem] font-semibold tracking-[0.13em] uppercase transition-colors duration-200",
                        active ? "text-ink" : "text-muted hover:text-ink",
                      )}
                    >
                      <span className={clsx("size-1.5 shrink-0", active ? "bg-hot" : "bg-line-soft")} aria-hidden />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              <div className="mt-auto border-t-2 border-ink px-5 py-4">
                <span className="font-mono text-[0.6875rem] tracking-[0.1em] text-muted uppercase">
                  Goal — <span className="text-ink">{goalRole}</span>
                </span>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
}
