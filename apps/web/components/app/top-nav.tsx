"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { clsx } from "clsx";
import { ThemeToggle } from "./theme-toggle";
import { Avatar } from "@/components/ui/primitives";

const NAV = [
  { href: "/journey", label: "Journey" },
  { href: "/quests", label: "Quests" },
  { href: "/time-machine", label: "Machine" },
  { href: "/people", label: "People" },
  { href: "/messages", label: "Messages" },
  { href: "/radar", label: "Radar" },
  { href: "/research", label: "Research" },
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

  return (
    <header className="sticky top-0 z-50 border-b-2 border-ink bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-5 py-3.5">
        <Link
          href="/journey"
          className="k-display shrink-0 text-[0.95rem] tracking-[-0.045em]"
        >
          Campus<span className="text-hot">Quest</span>
        </Link>

        <nav className="-mx-1 flex flex-1 items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none]">
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

        <div className="hidden shrink-0 items-center gap-3 lg:flex">
          <span className="font-mono text-[0.6875rem] tracking-[0.1em] text-muted uppercase">
            Goal — <span className="text-ink">{goalRole}</span>
          </span>
        </div>

        <ThemeToggle className="shrink-0" />
        <Avatar initials={initials} size="sm" />

        {signedIn ? (
          // A form, not a link: /auth/sign-out is POST-only so a prefetch or a
          // third-party image tag cannot end the session.
          <form action="/auth/sign-out" method="post" className="shrink-0">
            <button
              type="submit"
              className="font-mono text-[0.6875rem] font-semibold tracking-[0.13em] text-muted uppercase transition-colors duration-200 hover:text-hot"
            >
              Sign out
            </button>
          </form>
        ) : null}
      </div>
    </header>
  );
}
