"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { clsx } from "clsx";
import type {
  RoadmapTopicBody,
  RoadmapWithProgress,
  TopicProgressStatus,
} from "@campusquest/shared";
import { Chip, Label } from "@/components/ui/primitives";

/**
 * A roadmap.sh outline, drawn as a board of modules.
 *
 * Every module is closed until it is asked for. Closed, it is a title, a step
 * number and how far through it you are — so a fifteen-topic roadmap is one
 * screen you can read rather than a page you scroll. Opening one grows it in
 * place and staggers its subtopics in.
 *
 * The modules run in a serpentine — left to right, down, then right to left —
 * with each column sitting slightly lower than the last, so the board reads as
 * a path rather than a grid of boxes. Connectors are measured from where the
 * browser actually put the cards and re-measured while a module grows, so the
 * arrows track the animation instead of snapping to it afterwards.
 *
 * Nothing about a topic is loaded until it is opened — the body is a ~1.3KB
 * request against `/api/roadmap/:slug/topic/:nodeId`, and an unopened roadmap
 * costs zero. Bodies are held for the life of the page so re-opening is
 * instant.
 *
 * Ticks are optimistic: a checkbox that waits for a round trip feels broken,
 * and the failure mode (the tick reverts) is honest and cheap.
 */

type Props = {
  data: RoadmapWithProgress;
  /** Set when the roadmap is a broader match than the skill asked for. */
  note?: string;
};

/** Column count by container width. Three is as wide as a card stays readable. */
function columnsFor(width: number): number {
  if (width >= 1080) return 3;
  if (width >= 680) return 2;
  return 1;
}

/** How far each column is dropped below the last. Zero in a single column. */
const COLUMN_DROP = 30;

/**
 * Serpentine placement: even rows read left to right, odd rows right to left,
 * so the path never jumps back across the page between two steps.
 */
function cellFor(index: number, cols: number): { row: number; col: number } {
  const row = Math.floor(index / cols);
  const within = index % cols;
  return { row, col: row % 2 === 0 ? within : cols - 1 - within };
}

type Point = { x: number; y: number };

/** An orthogonal path with rounded corners, for connectors between modules. */
function orthPath(points: Point[], radius = 14): string {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
    // A zero-length leg means the corner is not a corner; skipping it keeps
    // the arithmetic below out of NaN territory.
    if (inLen === 0 || outLen === 0) continue;
    const r = Math.min(radius, inLen / 2, outLen / 2);
    if (r < 1) {
      d += ` L ${cur.x} ${cur.y}`;
      continue;
    }
    d += ` L ${cur.x - ((cur.x - prev.x) / inLen) * r} ${cur.y - ((cur.y - prev.y) / inLen) * r}`;
    d += ` Q ${cur.x} ${cur.y} ${cur.x + ((next.x - cur.x) / outLen) * r} ${cur.y + ((next.y - cur.y) / outLen) * r}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

export function RoadmapFlow({ data, note }: Props) {
  const { outline } = data;
  const canSave = data.progressAvailable;
  const reduced = useReducedMotion();

  const [progress, setProgress] = useState(() => {
    const initial = new Map<string, TopicProgressStatus>();
    for (const p of data.progress) initial.set(p.nodeId, p.status);
    return initial;
  });
  // Modules open independently — comparing two of them is a normal thing to
  // want, and an accordion that shuts the one you were reading is a nuisance.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [openSub, setOpenSub] = useState<string | null>(null);
  const [bodies, setBodies] = useState<Record<string, RoadmapTopicBody | "loading" | "error">>({});

  const leaves = useMemo(
    () => outline.topics.flatMap((t) => t.subtopics.map((s) => s.nodeId)),
    [outline],
  );
  const doneCount = leaves.filter((id) => progress.get(id) === "done").length;
  const pct = leaves.length ? Math.round((100 * doneCount) / leaves.length) : 0;

  const loadBody = useCallback(
    async (nodeId: string) => {
      if (nodeId.startsWith("section:")) return;
      if (bodies[nodeId] && bodies[nodeId] !== "error") return;
      setBodies((b) => ({ ...b, [nodeId]: "loading" }));
      try {
        const res = await fetch(
          `/api/roadmap/${encodeURIComponent(outline.slug)}/topic/${encodeURIComponent(nodeId)}`,
          { headers: { Accept: "application/json" } },
        );
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as RoadmapTopicBody;
        setBodies((b) => ({ ...b, [nodeId]: body }));
      } catch {
        setBodies((b) => ({ ...b, [nodeId]: "error" }));
      }
    },
    [bodies, outline.slug],
  );

  const toggleModule = useCallback(
    (topicId: string, hasBody: boolean) => {
      setExpanded((current) => {
        const next = new Set(current);
        if (next.has(topicId)) next.delete(topicId);
        else next.add(topicId);
        return next;
      });
      if (!expanded.has(topicId) && hasBody) void loadBody(topicId);
    },
    [expanded, loadBody],
  );

  const toggleSub = useCallback(
    (nodeId: string) => {
      setOpenSub((current) => (current === nodeId ? null : nodeId));
      if (openSub !== nodeId) void loadBody(nodeId);
    },
    [openSub, loadBody],
  );

  const tick = useCallback(
    async (nodeId: string) => {
      if (!canSave) return;
      const next: TopicProgressStatus = progress.get(nodeId) === "done" ? "unseen" : "done";
      const previous = new Map(progress);
      setProgress((p) => {
        const copy = new Map(p);
        if (next === "unseen") copy.delete(nodeId);
        else copy.set(nodeId, next);
        return copy;
      });
      try {
        const res = await fetch("/api/roadmap/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: outline.slug, nodeId, status: next }),
        });
        if (!res.ok) throw new Error(String(res.status));
      } catch {
        setProgress(previous);
      }
    },
    [progress, outline.slug, canSave],
  );

  /* ------------------------------------------------------------- layout -- */

  const boardRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<(HTMLLIElement | null)[]>([]);
  const headRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [cols, setCols] = useState(1);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [paths, setPaths] = useState<string[]>([]);

  // Column count and connector geometry both come from measurement rather than
  // media queries, because the arrows have to agree with where the browser
  // actually put the cards. The board's own height changes throughout an
  // expand, so this fires for every frame of it.
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setCols(columnsFor(width));
      setSize({ width, height });
    });
    observer.observe(board);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const board = boardRef.current;
    // One column is a plain vertical stack; arrows would only repeat what the
    // stacking already says.
    if (!board || cols <= 1) {
      setPaths([]);
      return;
    }

    const boardBox = board.getBoundingClientRect();
    const boxes = cardRefs.current.slice(0, outline.topics.length).map((el, i) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const head = headRefs.current[i]?.getBoundingClientRect();
      return {
        left: r.left - boardBox.left,
        right: r.right - boardBox.left,
        top: r.top - boardBox.top,
        bottom: r.bottom - boardBox.top,
        cx: r.left + r.width / 2 - boardBox.left,
        cy: r.top + r.height / 2 - boardBox.top,
        // Connectors join header to header. A header does not move when its
        // module opens, so the horizontal arrows stay put while the card grows
        // beneath them.
        headY: (head ? head.top + head.height / 2 : r.top + 24) - boardBox.top,
      };
    });

    const next: string[] = [];
    for (let i = 0; i < boxes.length - 1; i += 1) {
      const a = boxes[i];
      const b = boxes[i + 1];
      if (!a || !b) continue;
      if (Math.abs(b.cx - a.cx) > Math.abs(b.cy - a.cy)) {
        const forward = b.cx > a.cx;
        const ax = forward ? a.right : a.left;
        const bx = forward ? b.left : b.right;
        const mid = (ax + bx) / 2;
        next.push(
          orthPath([
            { x: ax, y: a.headY },
            { x: mid, y: a.headY },
            { x: mid, y: b.headY },
            { x: bx, y: b.headY },
          ]),
        );
      } else {
        const down = b.cy > a.cy;
        const ay = down ? a.bottom : a.top;
        const by = down ? b.top : b.bottom;
        const mid = (ay + by) / 2;
        next.push(
          orthPath([
            { x: a.cx, y: ay },
            { x: a.cx, y: mid },
            { x: b.cx, y: mid },
            { x: b.cx, y: by },
          ]),
        );
      }
    }
    setPaths(next);
  }, [cols, size.width, size.height, expanded, openSub, bodies, outline.topics.length]);

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-3">
          <Label>{outline.title}</Label>
          {note ? (
            <span className="font-mono text-[0.625rem] tracking-[0.06em] text-faint">{note}</span>
          ) : null}
          {!outline.reviewed ? (
            /* Grouping here was inferred from roadmap.sh's canvas and nobody
               has checked it. Saying so is cheaper than a student silently
               learning a wrong structure. */
            <span
              className="border-2 border-line-soft px-1.5 py-0.5 font-mono text-[0.5625rem] tracking-[0.12em] text-faint uppercase"
              title="Grouping was derived automatically and has not been reviewed"
            >
              Auto-grouped
            </span>
          ) : null}
        </div>
        <span className="font-mono text-[0.6875rem] tracking-[0.1em] text-muted uppercase tabular-nums">
          {doneCount} of {leaves.length} · {pct}%
        </span>
      </div>

      {!canSave ? (
        <p className="mb-5 border-2 border-line-soft px-3 py-2 font-mono text-[0.625rem] leading-relaxed tracking-[0.06em] text-muted">
          Progress cannot be saved — the roadmap migration has not been applied
          to this database, so the checkboxes are read-only.
        </p>
      ) : null}

      <div ref={boardRef} className="relative">
        {/* Behind the cards, and inert: the arrows are decoration for an order
            the numbered badges already state. */}
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 overflow-visible"
          width={size.width}
          height={size.height}
        >
          <defs>
            <marker
              id="roadmap-flow-arrow"
              markerWidth="7"
              markerHeight="7"
              refX="6"
              refY="3.5"
              orient="auto"
            >
              <path d="M0,0 L7,3.5 L0,7 Z" fill="var(--line-soft)" />
            </marker>
          </defs>
          {paths.map((d, i) => (
            <motion.path
              key={i}
              d={d}
              fill="none"
              stroke="var(--line-soft)"
              strokeWidth={2}
              markerEnd="url(#roadmap-flow-arrow)"
              initial={reduced ? false : { pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.5, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
            />
          ))}
        </svg>

        <ol
          className="relative z-10 grid items-start gap-x-10 gap-y-8"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {outline.topics.map((topic, index) => {
            const { row, col } = cellFor(index, cols);
            const done = topic.subtopics.filter((s) => progress.get(s.nodeId) === "done").length;
            const total = topic.subtopics.length;
            const complete = total > 0 && done === total;
            const isOpen = expanded.has(topic.nodeId);

            return (
              <motion.li
                key={topic.nodeId}
                ref={(el: HTMLLIElement | null) => {
                  cardRefs.current[index] = el;
                }}
                style={{
                  gridRow: row + 1,
                  gridColumn: col + 1,
                  // Each column rides a little lower than the last, so the
                  // board reads as a path rather than a table of boxes.
                  marginTop: cols > 1 ? col * COLUMN_DROP : 0,
                }}
                initial={reduced ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
                whileHover={reduced ? undefined : { y: -3 }}
                className={clsx(
                  "flex flex-col border-2 bg-paper transition-shadow duration-200",
                  complete ? "border-ink" : "border-line-soft",
                  isOpen ? "shadow-[var(--shadow-hard)]" : "hover:shadow-[var(--shadow-hard)]",
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleModule(topic.nodeId, topic.hasBody)}
                  aria-expanded={isOpen}
                  className="w-full cursor-pointer px-4 pt-3.5 pb-3.5 text-left"
                >
                  <div
                    ref={(el) => {
                      headRefs.current[index] = el;
                    }}
                    className="flex items-start gap-2.5"
                  >
                    <span
                      className={clsx(
                        "mt-0.5 shrink-0 border-2 px-1.5 py-0.5 font-mono text-[0.5625rem] tracking-[0.1em] tabular-nums",
                        complete ? "border-ink bg-ink text-paper" : "border-line-soft text-faint",
                      )}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1 font-display text-[1rem] leading-tight font-bold tracking-[-0.02em]">
                      {topic.label}
                    </span>
                    <motion.span
                      aria-hidden
                      animate={{ rotate: isOpen ? 180 : 0 }}
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      className="mt-0.5 shrink-0 font-mono text-[0.7rem] text-faint"
                    >
                      ↓
                    </motion.span>
                  </div>

                  {total ? (
                    <div className="mt-2.5 flex items-center gap-2">
                      <span className="h-1 flex-1 bg-sunk">
                        <motion.span
                          className="block h-full bg-hot"
                          initial={false}
                          animate={{ width: `${(100 * done) / total}%` }}
                          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                        />
                      </span>
                      <span className="font-mono text-[0.625rem] text-faint tabular-nums">
                        {done}/{total}
                      </span>
                    </div>
                  ) : (
                    <p className="mt-2.5 font-mono text-[0.625rem] tracking-[0.08em] text-faint uppercase">
                      Reading only
                    </p>
                  )}
                </button>

                <AnimatePresence initial={false}>
                  {isOpen ? (
                    <motion.div
                      key="body"
                      initial={reduced ? false : { height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={reduced ? undefined : { height: 0, opacity: 0 }}
                      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="border-t-2 border-line-soft px-4 pt-3 pb-4">
                        {topic.hasBody ? <Body state={bodies[topic.nodeId]} /> : null}

                        {total ? (
                          <ul className="mt-1 flex flex-col gap-1.5">
                            {topic.subtopics.map((sub, subIndex) => {
                              const subDone = progress.get(sub.nodeId) === "done";
                              return (
                                <motion.li
                                  key={sub.nodeId}
                                  initial={reduced ? false : { opacity: 0, x: -8 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{
                                    duration: 0.35,
                                    delay: 0.06 + subIndex * 0.035,
                                    ease: [0.16, 1, 0.3, 1],
                                  }}
                                >
                                  <div className="flex items-baseline gap-2.5">
                                    <input
                                      type="checkbox"
                                      checked={subDone}
                                      onChange={() => void tick(sub.nodeId)}
                                      disabled={!canSave}
                                      id={`t-${sub.nodeId}`}
                                      className="size-3.5 shrink-0 cursor-pointer accent-hot disabled:cursor-not-allowed disabled:opacity-40"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => toggleSub(sub.nodeId)}
                                      aria-expanded={openSub === sub.nodeId}
                                      className={clsx(
                                        "cursor-pointer text-left text-[0.82rem] leading-snug underline-offset-4 hover:underline",
                                        subDone ? "text-faint line-through" : "text-ink",
                                      )}
                                    >
                                      {sub.label}
                                    </button>
                                  </div>
                                  <AnimatePresence initial={false}>
                                    {openSub === sub.nodeId ? (
                                      <motion.div
                                        initial={reduced ? false : { height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={reduced ? undefined : { height: 0, opacity: 0 }}
                                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                                        className="overflow-hidden"
                                      >
                                        <Body state={bodies[sub.nodeId]} />
                                      </motion.div>
                                    ) : null}
                                  </AnimatePresence>
                                </motion.li>
                              );
                            })}
                          </ul>
                        ) : null}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/** The opened topic. Prose only appears when the deployment enables it. */
function Body({ state }: { state: RoadmapTopicBody | "loading" | "error" | undefined }) {
  if (!state || state === "loading") {
    return (
      <div
        className="mb-3 animate-pulse border-l-2 border-line-soft pl-3"
        role="status"
        aria-busy="true"
      >
        <span className="sr-only">Loading topic</span>
        <span className="block h-3 w-full max-w-[30ch] bg-line-soft" />
        <span className="mt-1.5 block h-3 w-full max-w-[22ch] bg-line-soft" />
      </div>
    );
  }
  if (state === "error") {
    return (
      <p className="mb-3 border-l-2 border-line-soft pl-3 font-mono text-[0.6875rem] text-muted">
        Could not load this topic.
      </p>
    );
  }

  const empty = !state.description && state.resources.length === 0;

  return (
    <div className="mt-2 mb-3 border-l-2 border-line-soft pl-3">
      {state.description ? (
        <p className="text-[0.82rem] leading-relaxed text-muted">
          {state.description.replace(/^#\s+.*\n+/, "")}
        </p>
      ) : null}

      {state.resources.length ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {state.resources.map((r) => (
            <li key={r.url}>
              <a href={r.url} target="_blank" rel="noreferrer noopener" className="inline-block">
                <Chip tone="soft" className="hover:border-ink hover:text-ink">
                  {r.type} · {r.title}
                </Chip>
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Without the link out, a topic with neither prose nor resources would
          open onto nothing at all. */}
      {empty ? (
        <p className="font-mono text-[0.6875rem] text-faint">No reading listed for this topic.</p>
      ) : null}
    </div>
  );
}
