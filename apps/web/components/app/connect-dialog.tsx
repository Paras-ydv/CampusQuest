"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, Label } from "@/components/ui/primitives";

/**
 * The note that travels with a connection request.
 *
 * This was a `window.prompt`, which ignores the theme entirely and renders as
 * a system alert on top of the page. Since a request is now the only way to
 * reach someone the first time, the note is worth composing properly.
 */
export function ConnectDialog({
  peer,
  onCancel,
  onSend,
  /**
   * Wording, so the same dialog can compose an email to a researcher as well
   * as a connection request to a peer. A professor has no account to receive a
   * request, and telling a student they have "sent" one would be false.
   */
  copy,
}: {
  peer: { name: string; email: string; initials: string; lookingFor?: string } | null;
  onCancel: () => void;
  onSend: (note: string) => void;
  copy?: { heading: string; action: string; placeholder: string; context?: string };
}) {
  const wording = copy ?? {
    heading: "Send a connection request",
    action: "Send request",
    placeholder: "Say what you'd like to build together.",
    context: "Looking for",
  };
  const [note, setNote] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!peer) return;
    setNote("");
    // Focus after the entrance animation starts, so it does not fight it.
    const timer = setTimeout(() => inputRef.current?.focus(), 80);
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
    };
  }, [peer, onCancel]);

  return (
    <AnimatePresence>
      {peer ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onCancel}
            className="fixed inset-0 z-50 bg-ink/35 backdrop-blur-[2px]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`Connect with ${peer.name}`}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-1/2 left-1/2 z-50 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 border-2 border-ink bg-paper shadow-[var(--shadow-hard)]"
          >
            <div className="border-b-2 border-ink px-5 py-4">
              <Label>{wording.heading}</Label>
            </div>

            <div className="p-5">
              <div className="flex items-center gap-3">
                <Avatar initials={peer.initials} size="md" />
                <div className="min-w-0">
                  <p className="truncate font-display text-[1.05rem] font-bold tracking-[-0.02em]">
                    {peer.name}
                  </p>
                  <p className="truncate font-mono text-[0.625rem] tracking-[0.02em] text-muted lowercase">
                    {peer.email}
                  </p>
                </div>
              </div>

              {peer.lookingFor ? (
                <p className="mt-4 border-l-2 border-line-soft pl-3 text-[0.82rem] leading-relaxed text-muted">
                  {wording.context ?? "Looking for"}: {peer.lookingFor}
                </p>
              ) : null}

              <label htmlFor="connect-note" className="k-label mt-6 mb-2 block">
                Add a note (optional)
              </label>
              <textarea
                id="connect-note"
                ref={inputRef}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => {
                  // Enter sends; Shift+Enter is a newline, as in the composer.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSend(note);
                  }
                }}
                rows={3}
                maxLength={400}
                placeholder={wording.placeholder}
                className="w-full resize-none border-2 border-ink bg-surface px-3 py-2.5 text-[0.9rem] outline-none focus-visible:border-volt"
              />
              <p className="mt-1.5 text-right font-mono text-[0.625rem] text-faint tabular-nums">
                {note.length}/400
              </p>
            </div>

            <div className="flex items-center gap-3 border-t-2 border-ink px-5 py-4">
              <Button onClick={() => onSend(note)} arrow>
                {wording.action}
              </Button>
              <button
                type="button"
                onClick={onCancel}
                className="font-mono text-[0.6875rem] tracking-[0.12em] text-muted uppercase transition-colors hover:text-hot"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
