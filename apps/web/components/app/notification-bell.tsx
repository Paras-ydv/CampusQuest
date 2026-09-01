"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import type { Notification } from "@/lib/notifications";

const SEEN_KEY = "campusquest:notifications-seen-at";
const POLL_MS = 45_000;

const KIND_LABEL: Record<Notification["kind"], string> = {
  connection_request: "Request",
  connection_accepted: "Connected",
  message: "Message",
  badge: "Badge",
};

/** "3m", "2h", "4d" — enough to place an event without a date library. */
function ago(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

export function NotificationBell() {
  const pathname = usePathname();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState<string>("");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSeenAt(window.localStorage.getItem(SEEN_KEY) ?? "");
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (!response.ok) return;
      setItems((await response.json()) as Notification[]);
    } catch {
      // A failed poll is not worth surfacing; the next one will retry.
    }
  }, []);

  // Poll rather than subscribe: notifications span four different tables, and
  // a Realtime channel per table is far more machinery than a bell needs.
  useEffect(() => {
    void load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load, pathname]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unread = items.filter((item) => !seenAt || item.createdAt > seenAt);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && items.length) {
      // Opening the panel is the acknowledgement.
      const newest = items[0].createdAt;
      window.localStorage.setItem(SEEN_KEY, newest);
      setSeenAt(newest);
    }
  }

  return (
    <div className="relative shrink-0" ref={panelRef}>
      <button
        type="button"
        onClick={toggle}
        aria-label={unread.length ? `Notifications, ${unread.length} new` : "Notifications"}
        aria-expanded={open}
        className="relative flex size-8 items-center justify-center border-2 border-transparent text-muted transition-colors duration-200 hover:text-ink"
      >
        {/* A bell, drawn rather than imported, to keep the icon set at zero. */}
        <svg viewBox="0 0 20 20" className="size-[1.05rem]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M5 8a5 5 0 0 1 10 0c0 3 .8 4.4 1.5 5.2.3.4 0 .8-.5.8h-12c-.5 0-.8-.4-.5-.8C4.2 12.4 5 11 5 8Z" />
          <path d="M8 16.5a2 2 0 0 0 4 0" />
        </svg>
        {unread.length ? (
          <span className="absolute -top-0.5 -right-0.5 flex min-w-[1.05rem] items-center justify-center bg-hot px-1 font-mono text-[0.5625rem] font-bold text-on-hot tabular-nums">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        ) : null}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] border-2 border-ink bg-paper shadow-[4px_4px_0_0_var(--ink)]"
          >
            <p className="k-label border-b-2 border-ink px-4 py-3">
              Notifications
              {items.length ? <span className="ml-2 text-faint">{items.length}</span> : null}
            </p>

            {items.length === 0 ? (
              <p className="px-4 py-8 text-center font-mono text-[0.75rem] text-muted">
                Nothing yet. Connection requests, messages and badges appear here.
              </p>
            ) : (
              <ul className="max-h-[24rem] overflow-y-auto">
                {items.map((item) => {
                  const isNew = !seenAt || item.createdAt > seenAt;
                  return (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={clsx(
                          "flex gap-3 border-b-2 border-line-soft px-4 py-3 transition-colors duration-200 last:border-b-0 hover:bg-sunk/60",
                          isNew && "bg-sunk/30",
                        )}
                      >
                        <span className={clsx("mt-1.5 size-1.5 shrink-0", isNew ? "bg-hot" : "bg-line-soft")} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-2">
                            <span className="truncate text-[0.85rem] font-semibold">{item.title}</span>
                            <span className="ml-auto shrink-0 font-mono text-[0.5625rem] tracking-[0.1em] text-faint uppercase tabular-nums">
                              {ago(item.createdAt)}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-[0.78rem] text-muted">{item.body}</span>
                          <span className="mt-1 inline-block font-mono text-[0.5625rem] tracking-[0.12em] text-faint uppercase">
                            {KIND_LABEL[item.kind]}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
