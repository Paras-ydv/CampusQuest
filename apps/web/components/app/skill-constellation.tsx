"use client";

import { motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { CONSTELLATION_EDGES, CONSTELLATION_NODES } from "@/lib/data/skill-graph";
import { SKILLS } from "@/lib/data/skills";

/** Full skill names are too long for a 320-unit canvas. */
const SHORT: Record<string, string> = {
  dsa: "DSA",
  systemdesign: "SYS DESIGN",
  kubernetes: "K8S",
  sklearn: "SCIKIT",
  fastapi: "FASTAPI",
};

const NODE = 7; // square edge length in viewBox units

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

  const nodes = useMemo(
    () => CONSTELLATION_NODES.filter((n) => heldIds.includes(n.id) || gapIds.includes(n.id)),
    [heldIds, gapIds],
  );
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
        viewBox="0 0 320 200"
        className="h-auto w-full overflow-visible"
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
