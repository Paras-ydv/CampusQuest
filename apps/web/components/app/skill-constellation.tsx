"use client";

import { motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { CONSTELLATION_EDGES, CONSTELLATION_NODES } from "@/lib/data/skill-graph";
import { SKILLS } from "@/lib/data/skills";

/**
 * Labels are drawn beside their node, so a long name crosses the diagram and
 * lands on top of whatever is next to it — "Retrieval-augmented generation"
 * reached from one edge of the graph to the other. Anything that does not fit
 * in roughly a dozen characters gets a short form here.
 */
const SHORT: Record<string, string> = {
  dsa: "DSA",
  systemdesign: "SYS DESIGN",
  kubernetes: "K8S",
  sklearn: "SCIKIT",
  fastapi: "FASTAPI",
  rag: "RAG",
  llmapps: "LLM APPS",
  observability: "OBSERV.",
  testautomation: "TEST AUTO",
  os: "OS",
  networks: "NETWORKS",
  dbms: "DBMS",
  javascript: "JS",
  typescript: "TS",
  postgres: "POSTGRES",
  cv: "VISION",
  nlp: "NLP",
  aievals: "AI EVALS",
  appsec: "APPSEC",
  dataviz: "DATA VIZ",
  springboot: "SPRING",
  tensorflow: "TF",
  transformers: "TRANSFORM.",
  distributed: "DISTRIB.",
  embedded: "EMBEDDED",
  cicd: "CI/CD",
  mongodb: "MONGO",
  graphql: "GRAPHQL",
  terraform: "TERRAFORM",
  android: "ANDROID",
};

const NODE = 7; // square edge length in viewBox units

/**
 * The canvas the diagram is drawn on.
 *
 * Wider and taller than the authored 320x200 because that box was sized for
 * thirteen nodes: a student holding two dozen skills needs room for every one
 * of them plus its label, and squeezing them into the old box is what left the
 * text piled on top of itself. The svg scales to its container, so the larger
 * canvas costs nothing on a small screen.
 */
const VIEW_WIDTH = 560;
const VIEW_HEIGHT = 320;
/** The coordinate space `CONSTELLATION_NODES` was authored in. */
const AUTHORED_WIDTH = 320;
const AUTHORED_HEIGHT = 200;
/** Wide enough for a label of about ten characters at this font size. */
const COLUMN_WIDTH = 86;
/** Rows per stacked column before it wraps into another. */
const PER_COLUMN = 8;

type Props = {
  heldIds: string[];
  gapIds: string[];
  /** Gaps the what-if simulator is currently pretending you hold. */
  selectedIds?: string[];
  onToggle?: (skillId: string) => void;
  className?: string;
};

/**
 * The skill constellation: what you hold, what the roles keep asking for, and
 * the edges between them.
 *
 * Kinetic's version of the idea — squares and straight 2px rules rather than
 * dots and arcs. Held skills are solid ink; gaps are hollow and dashed in
 * vermilion, so the picture reads at a glance before any label does.
 *
 * Hovering a node isolates its edges. Clicking a gap toggles it into the
 * simulator, which is why the diagram and the alignment figure move together.
 */
export function SkillConstellation({
  heldIds,
  gapIds,
  selectedIds = [],
  onToggle,
  className,
}: Props) {
  const reduced = useReducedMotion();
  const [hovered, setHovered] = useState<string | null>(null);

  /**
   * Every skill the student holds or lacks, whether or not the layout has
   * coordinates for it.
   *
   * The authored positions cover thirteen skills and the catalogue has sixty,
   * so filtering to the authored set silently dropped most of the picture — a
   * student saw "19 missing" above a diagram showing ten. Skills without a
   * position are placed on the side they belong to, held on the left and gaps
   * on the right, keeping the composition the authored nodes establish.
   */
  const nodes = useMemo(() => {
    const authored = new Set(CONSTELLATION_NODES.map((node) => node.id));
    const heldLoose = heldIds.filter((id) => !authored.has(id));
    const gapLoose = gapIds.filter((id) => !authored.has(id));

    // Each side needs a column's worth of room, and a column is as wide as its
    // labels rather than its markers — a label sits beside its node, so
    // spacing the markers alone left the text overlapping everything.
    const columns = (count: number) => Math.ceil(count / PER_COLUMN);
    const leftColumns = columns(heldLoose.length);
    const rightColumns = columns(gapLoose.length);
    const left = leftColumns * COLUMN_WIDTH;
    const right = rightColumns * COLUMN_WIDTH;

    // The authored composition is preserved but compressed into whatever is
    // left between the two margins.
    const span = VIEW_WIDTH - left - right;
    const squeeze = (x: number) => left + (x / AUTHORED_WIDTH) * span;
    const placed = CONSTELLATION_NODES
      .filter((node) => heldIds.includes(node.id) || gapIds.includes(node.id))
      .map((node) => ({ ...node, x: squeeze(node.x), y: (node.y / AUTHORED_HEIGHT) * VIEW_HEIGHT }));

    const stack = (ids: string[], side: "held" | "gap") =>
      ids.map((id, index) => {
        const column = Math.floor(index / PER_COLUMN);
        const row = index % PER_COLUMN;
        const rows = Math.min(ids.length - column * PER_COLUMN, PER_COLUMN);
        const step = (VIEW_HEIGHT - 24) / Math.max(rows, 1);
        const total = side === "held" ? leftColumns : rightColumns;
        return {
          id,
          // Columns fill from the outside in, so the innermost sits nearest the
          // diagram and the whole thing still reads as one picture.
          x: side === "held"
            ? 14 + (total - 1 - column) * COLUMN_WIDTH
            : VIEW_WIDTH - 14 - (total - 1 - column) * COLUMN_WIDTH,
          y: 16 + row * step + step / 2,
          anchor: (side === "held" ? "start" : "end") as "start" | "end",
        };
      });

    return [...placed, ...stack(heldLoose, "held"), ...stack(gapLoose, "gap")];
  }, [heldIds, gapIds]);
  const present = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const byId = useMemo(
    () => new Map(nodes.map((n) => [n.id, n] as const)),
    [nodes],
  );

  const edges = useMemo(
    () => CONSTELLATION_EDGES.filter(([a, b]) => present.has(a) && present.has(b)),
    [present],
  );

  /** Neighbours of the hovered node, plus itself. */
  const lit = useMemo(() => {
    if (!hovered) return null;
    const set = new Set<string>([hovered]);
    for (const [a, b] of edges) {
      if (a === hovered) set.add(b);
      if (b === hovered) set.add(a);
    }
    return set;
  }, [hovered, edges]);

  const label = (id: string) => SHORT[id] ?? SKILLS[id as keyof typeof SKILLS]?.name ?? id;

  return (
    <div className={clsx("relative", className)}>
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="h-auto w-full select-none"
        role="img"
        aria-label={`Skill constellation. Held: ${heldIds.map(label).join(", ")}. Missing: ${gapIds.map(label).join(", ")}.`}
      >
        {/* ---------------------------------------------------------- edges */}
        <g>
          {edges.map(([a, b], i) => {
            const na = byId.get(a)!;
            const nb = byId.get(b)!;
            const len = Math.hypot(nb.x - na.x, nb.y - na.y);
            const bridge = gapIds.includes(a) || gapIds.includes(b);
            const dim = lit ? !(lit.has(a) && lit.has(b)) : false;

            return (
              <motion.line
                key={`${a}-${b}`}
                x1={na.x}
                y1={na.y}
                x2={nb.x}
                y2={nb.y}
                strokeWidth={1.6}
                strokeDasharray={bridge ? "4 3" : len}
                className={clsx(
                  "transition-opacity duration-300",
                  bridge ? "stroke-hot" : "stroke-ink",
                )}
                initial={reduced || bridge ? false : { strokeDashoffset: len }}
                animate={{ strokeDashoffset: 0 }}
                transition={{
                  duration: 0.9,
                  delay: 0.1 + i * 0.05,
                  ease: [0.4, 0, 0.2, 1],
                }}
                style={{ opacity: dim ? 0.12 : bridge ? 0.5 : 0.28 }}
              />
            );
          })}
        </g>

        {/* ---------------------------------------------------------- nodes */}
        <g>
          {nodes.map((n, i) => {
            const isGap = gapIds.includes(n.id);
            const isSelected = selectedIds.includes(n.id);
            const dim = lit ? !lit.has(n.id) : false;
            const clickable = isGap && !!onToggle;
            const size = isGap ? NODE : NODE - 1;

            return (
              <motion.g
                key={n.id}
                initial={reduced ? false : { opacity: 0, scale: 0.3 }}
                animate={{ opacity: dim ? 0.25 : 1, scale: 1 }}
                transition={{
                  duration: 0.5,
                  delay: 0.45 + i * 0.055,
                  ease: [0.34, 1.4, 0.64, 1],
                  opacity: { duration: 0.2, delay: hovered ? 0 : 0.45 + i * 0.055 },
                }}
                style={{
                  originX: `${n.x}px`,
                  originY: `${n.y}px`,
                }}
                className={clsx(
                  "transition-opacity duration-300",
                  clickable && "cursor-pointer",
                )}
                onMouseEnter={() => setHovered(n.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={clickable ? () => onToggle!(n.id) : undefined}
              >
                <rect
                  x={n.x - size / 2}
                  y={n.y - size / 2}
                  width={size}
                  height={size}
                  strokeWidth={1.8}
                  strokeDasharray={isGap && !isSelected ? "2.5 2" : undefined}
                  className={clsx(
                    "transition-[fill,stroke] duration-300",
                    isSelected
                      ? "fill-hot stroke-hot"
                      : isGap
                        ? "fill-paper stroke-hot"
                        : "fill-ink stroke-ink",
                  )}
                />
                <text
                  x={n.x + (n.anchor === "start" ? -size / 2 : n.anchor === "end" ? size / 2 : 0)}
                  y={n.y + size / 2 + 9}
                  textAnchor={n.anchor ?? "middle"}
                  className={clsx(
                    "font-mono transition-[fill] duration-300 select-none",
                    isGap ? "fill-hot" : "fill-muted",
                  )}
                  style={{ fontSize: 6.6, letterSpacing: "0.06em" }}
                >
                  {label(n.id).toUpperCase()}
                </text>
              </motion.g>
            );
          })}
        </g>
      </svg>

      {/* --------------------------------------------------------- legend */}
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[0.6875rem] tracking-[0.08em] text-muted uppercase">
        <span className="flex items-center gap-2">
          <span className="size-2.5 bg-ink" /> Held ({heldIds.length})
        </span>
        <span className="flex items-center gap-2">
          <span className="size-2.5 border-2 border-dashed border-hot" /> Missing (
          {gapIds.length})
        </span>
        {onToggle ? (
          <span className="text-faint">Click a missing skill to simulate it</span>
        ) : null}
      </div>
    </div>
  );
}
