"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, PeerMatch, Thread } from "@campusquest/shared";
import { clsx } from "clsx";
import { Reveal } from "@/components/motion/reveal";
import { WordRise } from "@/components/motion/word-rise";
import { Button } from "@/components/ui/button";
import { Avatar, Label } from "@/components/ui/primitives";
import { createThread, getMessages, sendMessage } from "@/lib/data/client";
import { subscribeToThread } from "@/lib/supabase/realtime";

/**
 * The chat surface over P3's threads/messages routes. Realtime is additive: if
 * the subscription cannot start (mock mode has no Supabase to connect to), the
 * pane still works, it just only shows what this tab sends and loads.
 */
export function MessagesView({
  userId,
  initialThreads,
  initialMessages,
  peers,
}: {
  userId: string;
  initialThreads: Thread[];
  initialMessages: ChatMessage[];
  peers: PeerMatch[];
}) {
  const [threads, setThreads] = useState(initialThreads);
  const [activeId, setActiveId] = useState<string | null>(initialThreads[0]?.id ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  const peerById = useMemo(
    () => new Map(peers.map((p) => [p.id, p])),
    [peers],
  );

  /** A thread is named after whoever in it is not you. */
  const nameOf = useCallback(
    (thread: Thread) => {
      const others = thread.memberIds.filter((id) => id !== userId);
      const names = others.map((id) => peerById.get(id)?.name ?? "Unknown student");
      return names.length ? names.join(", ") : "Just you";
    },
    [peerById, userId],
  );

  const initialsOf = useCallback(
    (thread: Thread) => {
      const other = thread.memberIds.find((id) => id !== userId);
      return peerById.get(other ?? "")?.initials ?? "??";
    },
    [peerById, userId],
  );

  // Keep the newest message in view as the list grows.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // Swap the loaded conversation when the selection changes.
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    setError(null);
    getMessages(activeId)
      .then((page) => {
        if (!cancelled) setMessages(page.items);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load messages.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  // Realtime delivery for the open thread. Deduplication happens inside
  // subscribeToThread, but the optimistic echo of our own send is local, so we
  // also guard on id here.
  useEffect(() => {
    if (!activeId) return;
    let subscription: { unsubscribe: () => Promise<string> } | null = null;
    try {
      subscription = subscribeToThread({
        threadId: activeId,
        userId,
        onMessage: (message) =>
          setMessages((prev) =>
            prev.some((m) => m.id === message.id) ? prev : [...prev, message],
          ),
      });
      setLive(true);
    } catch {
      // No Supabase configured — polling is not worth it for a demo surface.
      setLive(false);
    }
    return () => {
      void subscription?.unsubscribe();
      setLive(false);
    };
  }, [activeId, userId]);

  async function send() {
    const body = draft.trim();
    if (!body || !activeId || pending) return;
    setPending(true);
    setError(null);
    try {
      const saved = await sendMessage(activeId, body);
      setDraft("");
      setMessages((prev) => (prev.some((m) => m.id === saved.id) ? prev : [...prev, saved]));
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Could not send that message.");
    } finally {
      setPending(false);
    }
  }

  /** Start a conversation with a matched peer who has no thread yet. */
  async function startThreadWith(peerId: string) {
    setError(null);
    try {
      const thread = await createThread([peerId]);
      setThreads((prev) => (prev.some((t) => t.id === thread.id) ? prev : [thread, ...prev]));
      setActiveId(thread.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not start that conversation.");
    }
  }

  const peersWithoutThread = peers.filter(
    (peer) => !threads.some((t) => t.memberIds.includes(peer.id)),
  );

  const active = threads.find((t) => t.id === activeId) ?? null;

  return (
    <div className="mx-auto max-w-[1400px]">
      <section className="border-b-2 border-ink px-5 py-12">
        <Label className="mb-4">Messages</Label>
        <WordRise
          as="h1"
          text="Talk to the people who complete your team."
          className="k-display max-w-[18ch] text-[clamp(2rem,6vw,4rem)]"
        />
        <Reveal index={5} className="mt-6 max-w-[56ch]">
          <p className="text-[0.98rem] leading-relaxed text-muted">
            Every conversation here started from a match. Messages are stored
            per-thread and only members can read them.
          </p>
        </Reveal>
      </section>

      <div className="grid lg:grid-cols-[20rem_1fr]">
        {/* ------------------------------------------------- thread list -- */}
        <aside className="border-b-2 border-ink lg:border-r-2 lg:border-b-0">
          <p className="k-label border-b-2 border-line-soft px-5 py-4">
            Conversations
          </p>

          {threads.length === 0 ? (
            <p className="px-5 py-6 font-mono text-[0.75rem] leading-relaxed text-muted">
              No conversations yet. Start one from a match below.
            </p>
          ) : (
            <ul>
              {threads.map((thread) => (
                <li key={thread.id}>
                  <button
                    onClick={() => setActiveId(thread.id)}
                    aria-current={thread.id === activeId ? "true" : undefined}
                    className={clsx(
                      "flex w-full items-center gap-3 border-b-2 border-line-soft px-5 py-4 text-left transition-colors duration-200",
                      thread.id === activeId
                        ? "bg-ink text-paper"
                        : "hover:bg-line-soft/40",
                    )}
                  >
                    <Avatar initials={initialsOf(thread)} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.9rem] font-semibold">
                        {nameOf(thread)}
                      </span>
                      <span
                        className={clsx(
                          "block font-mono text-[0.625rem] tracking-[0.1em] uppercase",
                          thread.id === activeId ? "text-paper/60" : "text-faint",
                        )}
                      >
                        {thread.kind}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {peersWithoutThread.length > 0 ? (
            <div className="px-5 py-5">
              <p className="k-label mb-3">Start a conversation</p>
              <ul className="flex flex-col gap-2">
                {peersWithoutThread.slice(0, 6).map((peer) => (
                  <li key={peer.id}>
                    <button
                      onClick={() => startThreadWith(peer.id)}
                      className="w-full border-2 border-line-soft px-3 py-2 text-left font-mono text-[0.6875rem] tracking-[0.08em] text-muted uppercase transition-colors duration-200 hover:border-ink hover:text-ink"
                    >
                      {peer.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>

        {/* ---------------------------------------------------- messages -- */}
        <section className="flex min-h-[32rem] flex-col">
          {active ? (
            <>
              <header className="flex items-center gap-3 border-b-2 border-line-soft px-5 py-4">
                <Avatar initials={initialsOf(active)} size="sm" />
                <span className="text-[0.95rem] font-semibold">{nameOf(active)}</span>
                {live ? (
                  <span className="ml-auto flex items-center gap-2 font-mono text-[0.625rem] tracking-[0.12em] text-muted uppercase">
                    <span className="size-1.5 bg-volt" />
                    Live
                  </span>
                ) : null}
              </header>

              <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6">
                {messages.length === 0 ? (
                  <p className="py-12 text-center font-mono text-[0.8rem] text-muted">
                    No messages yet. Say something.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {messages.map((message) => {
                      const mine = message.senderId === userId;
                      return (
                        <li
                          key={message.id}
                          className={clsx("flex", mine ? "justify-end" : "justify-start")}
                        >
                          <div
                            className={clsx(
                              "max-w-[min(34rem,80%)] border-2 px-3.5 py-2.5",
                              mine
                                ? "border-ink bg-ink text-paper"
                                : "border-line-soft",
                            )}
                          >
                            <p className="text-[0.9rem] leading-relaxed break-words">
                              {message.body}
                            </p>
                            <time
                              dateTime={message.createdAt}
                              className={clsx(
                                "mt-1.5 block font-mono text-[0.625rem] tracking-[0.08em] tabular-nums",
                                mine ? "text-paper/55" : "text-faint",
                              )}
                            >
                              {new Date(message.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </time>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {error ? (
                <p
                  role="alert"
                  className="border-t-2 border-hot px-5 py-3 font-mono text-[0.6875rem] tracking-[0.04em] text-hot"
                >
                  {error}
                </p>
              ) : null}

              <form
                className="flex items-center gap-3 border-t-2 border-ink px-5 py-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void send();
                }}
              >
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Write a message"
                  maxLength={4000}
                  aria-label="Message"
                  className="min-w-0 flex-1 border-2 border-line-soft bg-transparent px-3 py-2.5 text-[0.9rem] outline-none focus:border-volt"
                />
                <Button type="submit" disabled={pending || !draft.trim()}>
                  {pending ? "Sending…" : "Send"}
                </Button>
              </form>
            </>
          ) : (
            <p className="flex flex-1 items-center justify-center px-5 py-20 text-center font-mono text-[0.8rem] text-muted">
              Pick a conversation, or start one from a match.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
