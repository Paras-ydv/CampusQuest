/**
 * Layout for the skill constellation.
 *
 * Positions and edges are authored rather than force-simulated: the graph is
 * small, the composition matters, and a deterministic layout means the diagram
 * looks identical on every render and in every screenshot.
 *
 * In production the *edges* come from P2's `skill_graph` Delta table — this
 * file keeps the coordinates and reads relationships from that shape. Held
 * skills sit on the left, gaps on the right, so the picture itself reads as
 * "here is where you are, here is what you're missing".
 *
 * Coordinate space is the SVG viewBox: 320 × 200.
 */

export type ConstellationNode = {
  /** Matches a skill id in `lib/data/skills.ts`. */
  id: string;
  x: number;
  y: number;
  anchor?: "start" | "middle" | "end";
};

export const CONSTELLATION_NODES: ConstellationNode[] = [
  // Held — the cluster you've already built.
  { id: "git", x: 34, y: 52, anchor: "start" },
  { id: "sklearn", x: 86, y: 30 },
  { id: "pytorch", x: 146, y: 44 },
  { id: "python", x: 88, y: 96 },
  { id: "linux", x: 32, y: 124, anchor: "start" },
  { id: "sql", x: 152, y: 104 },
  { id: "fastapi", x: 98, y: 152 },
  { id: "dsa", x: 40, y: 178, anchor: "start" },
  { id: "rest", x: 162, y: 170 },

  // Gaps — the cluster the roles keep asking for.
  { id: "mlops", x: 232, y: 38 },
  { id: "docker", x: 228, y: 108 },
  { id: "kubernetes", x: 292, y: 72, anchor: "end" },
  { id: "systemdesign", x: 256, y: 172 },
];

/** Undirected skill-to-skill relationships. */
export const CONSTELLATION_EDGES: [string, string][] = [
  ["git", "python"],
  ["git", "linux"],
  ["python", "sklearn"],
  ["python", "pytorch"],
  ["python", "fastapi"],
  ["python", "dsa"],
  ["python", "linux"],
  ["fastapi", "rest"],
  ["fastapi", "sql"],
  // Bridges into the gap cluster — the edges worth crossing.
  ["pytorch", "mlops"],
  ["linux", "docker"],
  ["fastapi", "docker"],
  ["docker", "kubernetes"],
  ["docker", "mlops"],
  ["rest", "systemdesign"],
  ["sql", "systemdesign"],
];
