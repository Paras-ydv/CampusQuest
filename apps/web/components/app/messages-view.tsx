"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ChatMessage, PeerMatch, Thread } from "@campusquest/shared";
import type { ThreadMember } from "@/lib/chat";
import { clsx } from "clsx";
import { Reveal } from "@/components/motion/reveal";
import { WordRise } from "@/components/motion/word-rise";
import { Button } from "@/components/ui/button";
import { Avatar, Label } from "@/components/ui/primitives";
import { createThread, getMessages, sendMessage } from "@/lib/data/client";
import { subscribeToThread } from "@/lib/supabase/realtime";
import { useConnectionsChanged } from "@/lib/live-refresh";

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
  members,
}: {
  userId: string;
  initialThreads: Thread[];
  initialMessages: ChatMessage[];
  peers: PeerMatch[];
  /** Everyone in the caller's threads, including non-matches. */
  members: ThreadMember[];
}) {
  const searchParams = useSearchParams();
  const [threads, setThreads] = useState(initialThreads);
  // A notification links to ?thread=<id>, so arriving from one opens it.
  const [activeId, setActiveId] = useState<string | null>(
    searchParams.get("thread") ?? initialThreads[0]?.id ?? null,
  );
  const [threadSearch, setThreadSearch] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [presentIds, setPresentIds] = useState<string[]>([]);
  /*
   * Who you may message, kept current after first paint. Accepting a request
   * happens on People, so this pane was rendered before the connection existed
   * and the new person only appeared after a manual reload. The plain
   * connections route is cheap enough to poll, unlike the match list.
   */
  const [connectedPeers, setConnectedPeers] = useState<
    { id: string; name: string; email: string; initials: string }[]
  >(() => peers.filter((p) => p.connection === "connected"));

  const loadConnections = useCallback(async () => {
    try {
      const response = await fetch("/api/people/connections", { cache: "no-store" });
      if (!response.ok) return;
      setConnectedPeers(await response.json());
    } catch {
      // A failed poll is not worth surfacing; the next one will retry.
    }
  }, []);
  useConnectionsChanged(loadConnections);

  const scrollRef = useRef<HTMLDivElement>(null);

  /**
   * Identity for anyone who appears in a thread. The thread directory is
   * authoritative because it covers every member; the match list only fills in
   * people the matcher happened to return.
   */
  const peerById = useMemo(() => {
    const map = new Map<string, { name: string; email: string; initials: string }>();
    for (const peer of peers) map.set(peer.id, { name: peer.name, email: peer.email, initials: peer.initials });
    // A thread started this session is with someone the polled connection list
    // knows about but the server-rendered directory does not yet.
    for (const peer of connectedPeers) map.set(peer.id, { name: peer.name, email: peer.email, initials: peer.initials });
    for (const member of members) map.set(member.id, { name: member.name, email: member.email, initials: member.initials });
    return map;
  }, [peers, connectedPeers, members]);

  /** A thread is named after whoever in it is not you. */
  const nameOf = useCallback(
    (thread: Thread) => {
      const others = thread.memberIds.filter((id) => id !== userId);
      const names = others.map((id) => peerById.get(id)?.name ?? "Unknown student");
      return names.length ? names.join(", ") : "Just you";
    },
    [peerById, userId],
  );

  /** The other member's email, for telling identical display names apart. */
  const emailOf = useCallback(
    (thread: Thread) => {
      const others = thread.memberIds.filter((id) => id !== userId);
      const emails = others.map((id) => peerById.get(id)?.email).filter(Boolean);
      return emails.join(", ");
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

  /**
   * Follow the conversation without hijacking it.
   *
   * Scrolling to the bottom on every change yanked the view away from anyone
   * reading back through the thread, and made the list visibly jump each time
   * a message arrived. We only follow when the reader is already at the
   * bottom — and jump instantly rather than smoothly when the thread changes,
   * because animating a fresh thread from the top is the "up and down" motion.
   */
  const atBottomRef = useRef(true);
  const lastThreadRef = useRef<string | null>(null);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threadChanged = lastThreadRef.current !== activeId;
    lastThreadRef.current = activeId;
    if (threadChanged) {
      el.scrollTop = el.scrollHeight;      // no animation on arrival
      atBottomRef.current = true;
      return;
    }
    if (atBottomRef.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages, activeId]);

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
          setMessages((prev) => {
            if (prev.some((m) => m.id === message.id)) return prev;
            // Our own optimistic copy may still be in the list under a
            // temporary id; drop it rather than showing the message twice.
            const withoutOptimistic = message.senderId === userId
              ? prev.filter((m) => !(m.id.startsWith("pending-") && m.body === message.body))
              : prev;
            return [...withoutOptimistic, message];
          }),
        // Presence tells us who else is actually in this thread right now.
        onPresence: (ids) => setPresentIds(ids),
        onStatus: (status) => setConnected(status === "connected"),
      });
    } catch {
      // No Supabase configured — polling is not worth it for a demo surface.
      setConnected(false);
    }
    return () => {
      void subscription?.unsubscribe();
      setConnected(false);
      setPresentIds([]);
    };
  }, [activeId, userId]);

  /**
   * Optimistic send. The message appears the instant you hit enter and the
   * input clears immediately; waiting for the round trip before showing your
   * own words is what made the thread feel laggy.
   *
   * The temporary row is replaced by the persisted one when it returns, and
   * removed if the send fails, so the transcript never keeps a message the
   * server rejected.
   */
  async function send() {
    const body = draft.trim();
    if (!body || !activeId) return;

    const tempId = `pending-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId, threadId: activeId, senderId: userId, body,
      createdAt: new Date().toISOString(), editedAt: null,
    };

    setDraft("");
    setError(null);
    setPendingIds((prev) => new Set(prev).add(tempId));
    setMessages((prev) => [...prev, optimistic]);

    try {
      const saved = await sendMessage(activeId, body);
      setMessages((prev) => {
        // Realtime may have delivered the persisted copy already.
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        return withoutTemp.some((m) => m.id === saved.id) ? withoutTemp : [...withoutTemp, saved];
      });
    } catch (sendError) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(body);
      setError(sendError instanceof Error ? sendError.message : "Could not send that message.");
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(tempId);
        return next;
      });
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
      const raw = createError instanceof Error ? createError.message : "";
      setError(
        /not connected/i.test(raw)
          ? "You need to be connected before messaging. Send a connection request from People."
          : raw || "Could not start that conversation.",
      );
    }
  }

  const query = threadSearch.trim().toLowerCase();
  const matchesQuery = (name: string, email: string) =>
    !query || name.toLowerCase().includes(query) || email.toLowerCase().includes(query);

  const visibleThreads = threads.filter((t) => matchesQuery(nameOf(t), emailOf(t)));
  // Only connected peers: a direct thread now requires an accepted connection,
  // so offering anyone else would be a button that always fails.
  const peersWithoutThread = connectedPeers
    .filter((peer) => !threads.some((t) => t.memberIds.includes(peer.id)))
    .filter((peer) => matchesQuery(peer.name, peer.email));

  const active = threads.find((t) => t.id === activeId) ?? null;
  const peerPresent = Boolean(
    active && active.memberIds.some((id) => id !== userId && presentIds.includes(id)),
  );

  return (
    <div className="mx-auto max-w-[1400px]">
      {/* A compact header, unlike the other screens. Messaging is a tool you
          sit inside, and a full-height hero pushed the composer below the fold
          — you had to scroll the page every time just to type. */}
      <section className="flex flex-wrap items-baseline gap-x-5 gap-y-2 border-b-2 border-ink px-5 py-6">
        <Label>Messages</Label>
        <WordRise
          as="h1"
          text="Talk to the people who complete your team."
          className="k-display text-[clamp(1.15rem,2.4vw,1.7rem)]"
        />
        <p className="ml-auto hidden font-mono text-[0.6875rem] tracking-[0.06em] text-faint lg:block">
          Only thread members can read these messages.
        </p>
      </section>

      {/* A fixed-height chat surface. Without a bounded height the transcript
          simply grew and pushed the page down, so the whole document scrolled
          instead of the message list. */}
      <div className="grid lg:h-[calc(100dvh-13.5rem)] lg:min-h-[30rem] lg:grid-cols-[20rem_1fr]">
        {/* ------------------------------------------------- thread list -- */}
        <aside className="flex min-h-0 flex-col overflow-y-auto border-b-2 border-ink lg:border-r-2 lg:border-b-0">
          <div className="border-b-2 border-line-soft px-5 py-4">
            <p className="k-label mb-3">Conversations</p>
            {/* Display names collide, so searching has to reach the address too. */}
            <input
              value={threadSearch}
              onChange={(e) => setThreadSearch(e.target.value)}
              placeholder="Search by name or email"
              aria-label="Search conversations"
              className="w-full border-2 border-line-soft bg-transparent px-3 py-2 font-mono text-[0.6875rem] placeholder:text-faint focus:border-ink focus:outline-none"
            />
          </div>

          {visibleThreads.length === 0 ? (
            <p className="px-5 py-6 font-mono text-[0.75rem] leading-relaxed text-muted">
              {query ? "No conversations match that search." : "No conversations yet. Connect with someone to start one."}
            </p>
          ) : (
            <ul>
              {visibleThreads.map((thread) => (
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
                          "block truncate font-mono text-[0.625rem] tracking-[0.02em] lowercase",
                          thread.id === activeId ? "text-paper/70" : "text-faint",
                        )}
                      >
                        {emailOf(thread) || thread.kind}
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
                      className="flex w-full flex-col gap-0.5 border-2 border-line-soft px-3 py-2 text-left transition-colors duration-200 hover:border-ink"
                    >
                      <span className="font-mono text-[0.6875rem] tracking-[0.08em] text-muted uppercase">
                        {peer.name}
                      </span>
                      <span className="truncate font-mono text-[0.625rem] tracking-[0.02em] text-faint lowercase">
                        {peer.email}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>

        {/* ---------------------------------------------------- messages -- */}
        <section className="flex min-h-[28rem] flex-col lg:min-h-0">
          {active ? (
            <>
              <header className="flex shrink-0 items-center gap-3 border-b-2 border-line-soft px-5 py-4">
                <Avatar initials={initialsOf(active)} size="sm" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[0.95rem] font-semibold">{nameOf(active)}</span>
                  {emailOf(active) ? (
                    <span className="truncate font-mono text-[0.625rem] tracking-[0.02em] text-muted lowercase">
                      {emailOf(active)}
                    </span>
                  ) : null}
                </span>
                {/* "Live" previously meant "our own websocket connected", which
                    is true for every thread the moment the page loads — so it
                    read as though everyone was always online. It now reflects
                    presence: the other member is genuinely in this thread. */}
                {peerPresent ? (
                  <span className="ml-auto flex items-center gap-2 font-mono text-[0.625rem] tracking-[0.12em] text-volt uppercase">
                    <span className="size-1.5 animate-pulse bg-volt" />
                    Online now
                  </span>
                ) : connected ? (
                  <span className="ml-auto font-mono text-[0.625rem] tracking-[0.12em] text-faint uppercase">
                    Offline
                  </span>
                ) : null}
              </header>

              <div
                ref={scrollRef}
                onScroll={handleScroll}
                /* min-h-0 is what actually enables scrolling here: a flex item
                   defaults to min-height:auto and will not shrink below its
                   content, so overflow-y never engages without it. */
                className="min-h-0 flex-1 overflow-y-auto px-5 py-6"
              >
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
                              {pendingIds.has(message.id)
                                ? "Sending…"
                                : new Date(message.createdAt).toLocaleTimeString([], {
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
                {/* Never disabled while sending: the message is already on
                    screen, so the composer stays ready for the next one. */}
                <Button type="submit" disabled={!draft.trim()}>
                  Send
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
