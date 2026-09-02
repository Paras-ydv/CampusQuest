#!/usr/bin/env node
/**
 * Derives a reviewable learning outline from a roadmap.sh roadmap.
 *
 *   node scripts/roadmap/derive-outline.mjs [--slug docker] [--out <dir>] [--report]
 *
 * WHY THIS IS A SCRIPT AND NOT A REQUEST-TIME FUNCTION
 * ---------------------------------------------------
 * roadmap.sh has no semantic hierarchy. Its roadmap is a React Flow canvas:
 * nodes carry pixel positions, and a subtopic belongs to a topic because of
 * where it was dragged. Measured across seven roadmaps, only 23-51% of
 * subtopics have an edge recording that relationship — the rest are inferred
 * from geometry, and inference is wrong often enough to matter (~14% on the
 * Docker roadmap, which is the one this was calibrated against).
 *
 * A wrong grouping is silent: nothing downstream can tell that "Bind Mounts"
 * was filed under Running Containers instead of Data Persistence. So the
 * derivation runs once, a human reads the diff, and the corrected outline is
 * committed as data. `--report` prints the confidence of every assignment so a
 * reviewer knows where to look first.
 *
 * Output: one JSON file per roadmap under `apps/web/lib/roadmap/outlines/`,
 * matching the `RoadmapOutline` schema in @campusquest/shared.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const DEFAULT_OUT = join(REPO, "apps", "web", "lib", "roadmap", "outlines");
const API = "https://roadmap.sh/api/v1-official-roadmap";

const args = process.argv.slice(2);
const arg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const REPORT = args.includes("--report");
const FORCE = args.includes("--force");
const OUT = arg("--out", DEFAULT_OUT);

/* ----------------------------------------------------------- geometry -- */

function box(node) {
  const p = node.position ?? {};
  const w = node.width ?? node.measured?.width ?? 0;
  const h = node.height ?? node.measured?.height ?? 0;
  const x = p.x ?? 0;
  const y = p.y ?? 0;
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

const contains = (outer, inner) =>
  inner.cx >= outer.x && inner.cx <= outer.x + outer.w &&
  inner.cy >= outer.y && inner.cy <= outer.y + outer.h;

/* ------------------------------------------------------------ derive --- */

/**
 * Assigns every subtopic to a group, in descending order of trust:
 *
 *   edge          an explicit topic → subtopic edge. Authoritative.
 *   section-group a section box containing no topic. roadmap.sh uses these for
 *                 prerequisite blocks; they become their own heading. Without
 *                 this the six Docker prerequisites land under "Introduction".
 *   section       a section box that does contain topics — nearest by y.
 *   proximity     nearest topic by vertical distance, with a horizontal
 *                 penalty. No sign constraint: roadmap.sh places a column's
 *                 subtopics above their topic as often as below.
 */
export function deriveOutline(doc) {
  const nodes = doc.nodes.filter((n) => n.type && n.data);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const topics = nodes.filter((n) => n.type === "topic");
  const subs = nodes.filter((n) => n.type === "subtopic");
  const sections = nodes
    .filter((n) => n.type === "section")
    .map((n) => ({ node: n, ...box(n) }));

  const parent = new Map();
  const how = new Map();
  const assign = (subId, groupId, via) => {
    if (parent.has(subId)) return;
    parent.set(subId, groupId);
    how.set(subId, via);
  };

  for (const e of doc.edges ?? []) {
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (s?.type === "topic" && t?.type === "subtopic") assign(t.id, s.id, "edge");
  }

  const sectionOf = (node) => {
    const b = box(node);
    return sections.find((s) => contains(s, b));
  };

  for (const sub of subs) {
    if (parent.has(sub.id)) continue;
    const sec = sectionOf(sub);
    if (!sec) continue;
    const inside = topics.filter((t) => sectionOf(t)?.node.id === sec.node.id);
    if (inside.length) {
      const b = box(sub);
      const near = inside
        .map((t) => ({ t, d: Math.abs(box(t).cy - b.cy) }))
        .sort((a, z) => a.d - z.d)[0];
      assign(sub.id, near.t.id, "section");
    } else {
      assign(sub.id, `section:${sec.node.id}`, "section-group");
    }
  }

  for (const sub of subs) {
    if (parent.has(sub.id)) continue;
    if (!topics.length) break;
    const b = box(sub);
    const ranked = topics
      .map((t) => {
        const tb = box(t);
        return { t, dy: Math.abs(tb.cy - b.cy), dx: Math.abs(tb.cx - b.cx) };
      })
      .sort((a, z) => a.dy + a.dx * 0.6 - (z.dy + z.dx * 0.6));
    assign(sub.id, ranked[0].t.id, "proximity");
  }

  const used = new Set(parent.values());
  const groups = [
    ...topics.map((t) => ({
      nodeId: t.id, label: t.data.label ?? "", hasBody: true, ...box(t),
    })),
    ...sections
      .filter((s) => used.has(`section:${s.node.id}`))
      .map((s) => ({
        nodeId: `section:${s.node.id}`,
        label: s.node.data.label?.trim() || "Prerequisites",
        hasBody: false,
        ...s,
      })),
  ].sort((a, z) => a.y - z.y || a.x - z.x);

  const byPosition = (a, z) => {
    const ab = box(a);
    const zb = box(z);
    return ab.y - zb.y || ab.x - zb.x;
  };

  return {
    slug: doc.slug,
    title: doc.title?.page ?? doc.title?.card ?? doc.slug,
    topics: groups.map((g) => ({
      nodeId: g.nodeId,
      label: g.label,
      hasBody: g.hasBody,
      subtopics: subs
        .filter((s) => parent.get(s.id) === g.nodeId)
        .sort(byPosition)
        .map((s) => ({ nodeId: s.id, label: s.data.label ?? "", via: how.get(s.id) })),
    })),
  };
}

/* --------------------------------------------------------------- main -- */

async function fetchRoadmap(slug) {
  const res = await fetch(`${API}/${encodeURIComponent(slug)}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${slug}: roadmap.sh answered ${res.status}`);
  return res.json();
}

async function main() {
  const only = arg("--slug", null);
  // Imported lazily so the script still runs if the TS module moves.
  const mapPath = join(REPO, "apps", "web", "lib", "roadmap", "skill-map.ts");
  const slugs = only
    ? [only]
    : [...new Set([...readFileSync(mapPath, "utf8").matchAll(/slug:\s*"([^"]+)"/g)].map((m) => m[1]))].sort();

  mkdirSync(OUT, { recursive: true });
  let lowConfidence = 0;
  let totalSubs = 0;

  for (const slug of slugs) {
    let doc;
    try {
      doc = await fetchRoadmap(slug);
    } catch (error) {
      console.error(`  !! ${error.message}`);
      continue;
    }
    const outline = deriveOutline(doc);
    const subs = outline.topics.flatMap((t) => t.subtopics);
    const weak = subs.filter((s) => s.via === "proximity").length;
    totalSubs += subs.length;
    lowConfidence += weak;

    const file = join(OUT, `${slug}.json`);
    const existed = existsSync(file);

    /*
     * A reviewed outline is hand-corrected data, not a build artifact.
     * Regenerating over it would silently throw away the corrections that are
     * the whole point of the review step, so it takes --force.
     */
    if (existed && !FORCE) {
      const current = JSON.parse(readFileSync(file, "utf8"));
      if (current.reviewed) {
        console.log(`skipped  ${slug.padEnd(32)} reviewed by hand — pass --force to regenerate`);
        continue;
      }
    }

    // `via` is review metadata, not part of the contract — stripped on write.
    const clean = {
      slug: outline.slug,
      title: outline.title,
      reviewed: false,
      topics: outline.topics.map((t) => ({
        nodeId: t.nodeId,
        label: t.label,
        hasBody: t.hasBody,
        subtopics: t.subtopics.map(({ nodeId, label }) => ({ nodeId, label })),
      })),
    };
    writeFileSync(file, `${JSON.stringify(clean, null, 2)}\n`);
    console.log(
      `${existed ? "updated" : "created"}  ${slug.padEnd(32)} ` +
        `${outline.topics.length} groups, ${subs.length} subtopics, ${weak} need review`,
    );

    if (REPORT) {
      for (const t of outline.topics) {
        console.log(`   ■ ${t.label}${t.hasBody ? "" : "  (heading only)"}`);
        for (const s of t.subtopics) {
          const mark = s.via === "proximity" ? "?" : " ";
          console.log(`     ${mark} ${s.label}   [${s.via}]`);
        }
      }
    }
  }

  console.log(
    `\n${totalSubs} subtopics across ${slugs.length} roadmaps; ` +
      `${lowConfidence} placed by proximity and worth a read ` +
      `(${totalSubs ? Math.round((100 * lowConfidence) / totalSubs) : 0}%).`,
  );
  console.log("Review the '?' rows, correct the JSON by hand, and commit.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
