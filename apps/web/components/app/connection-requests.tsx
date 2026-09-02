"use client";

import type { ConnectionRequestDetail } from "@campusquest/shared";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { clsx } from "clsx";
import { Avatar, Label } from "@/components/ui/primitives";

/**
 * Incoming and outgoing connection requests.
 *
 * A request used to be invisible to the person receiving it — it existed in the
 * database with nowhere to act on it. This is where it is accepted or declined,
 * and accepting is what unlocks messaging.
 */
export function ConnectionRequests({ requests }: { requests: ConnectionRequestDetail[] }) {
  const router = useRouter();
  const [items, setItems] = useState(requests);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const incoming = items.filter((r) => r.direction === "incoming");
  const outgoing = items.filter((r) => r.direction === "outgoing");

  async function respond(id: string, status: "accepted" | "rejected" | "cancelled") {
    setBusy(id);
    setError(null);
    const previous = items;
    setItems((prev) => prev.filter((r) => r.id !== id));
    try {
      const response = await fetch(`/api/people/connection-requests/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? `Could not update the request (${response.status}).`);
      }
      // Accepting changes who you can message, so the shell has to re-read.
      router.refresh();
    } catch (responseError) {
      setItems(previous);
      setError(responseError instanceof Error ? responseError.message : "Could not update the request.");
    } finally {
      setBusy(null);
    }
  }

  if (!items.length) return null;

  return (
    <section id="requests" className="scroll-mt-24 border-b-2 border-ink px-5 py-8">
      <div className="mb-5 flex items-baseline gap-3">
        <Label>Connection requests</Label>
        {incoming.length ? (
          <span className="bg-hot px-2 py-0.5 font-mono text-[0.625rem] font-bold text-on-hot tabular-nums">
            {incoming.length} waiting on you
          </span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mb-4 border-l-2 border-hot pl-3 font-mono text-[0.6875rem] text-hot">
          {error}
        </p>
      ) : null}

      <ul className="grid gap-3 lg:grid-cols-2">
        <AnimatePresence mode="popLayout">
          {[...incoming, ...outgoing].map((r) => (
            <motion.li
              key={r.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className={clsx(
                "flex flex-col gap-3 border-2 p-4",
                r.direction === "incoming" ? "border-ink" : "border-line-soft",
              )}
            >
              <div className="flex items-start gap-3">
                <Avatar initials={r.peerInitials} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.95rem] font-semibold">{r.peerName}</p>
                  <p className="truncate font-mono text-[0.625rem] tracking-[0.02em] text-muted lowercase">
                    {r.peerEmail}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-[0.5625rem] tracking-[0.12em] text-faint uppercase">
                  {r.direction === "incoming" ? "Wants to connect" : "Sent"}
                </span>
              </div>

              {r.message ? (
                <p className="border-l-2 border-line-soft pl-3 text-[0.82rem] leading-relaxed text-ink-2">
                  {r.message}
                </p>
              ) : null}

              <div className="flex gap-2">
                {r.direction === "incoming" ? (
                  <>
                    <button
                      type="button"
                      disabled={busy === r.id}
                      onClick={() => void respond(r.id, "accepted")}
                      className="border-2 border-ink bg-ink px-4 py-2 font-mono text-[0.6875rem] font-bold tracking-[0.12em] text-paper uppercase transition-colors duration-200 hover:border-hot hover:bg-hot hover:text-on-hot disabled:opacity-40"
                    >
                      {busy === r.id ? "Working" : "Accept"}
                    </button>
                    <button
                      type="button"
                      disabled={busy === r.id}
                      onClick={() => void respond(r.id, "rejected")}
                      className="border-2 border-line-soft px-4 py-2 font-mono text-[0.6875rem] tracking-[0.12em] text-muted uppercase transition-colors duration-200 hover:border-ink hover:text-ink disabled:opacity-40"
                    >
                      Decline
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => void respond(r.id, "cancelled")}
                    className="border-2 border-line-soft px-4 py-2 font-mono text-[0.6875rem] tracking-[0.12em] text-muted uppercase transition-colors duration-200 hover:border-hot hover:text-hot disabled:opacity-40"
                  >
                    Withdraw
                  </button>
                )}
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}
