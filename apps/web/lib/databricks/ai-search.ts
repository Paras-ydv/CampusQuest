import type { BackendProfile } from "@/lib/backend/profile";

export type ResearchSearchCandidate = { projectId: string; rank: number };
export type ResearchSearchProfile = Pick<BackendProfile, "interests" | "skills"> & Partial<Pick<BackendProfile, "goalRole">>;

type QueryResponse = {
  manifest?: { columns?: { name?: string }[] };
  result?: { data_array?: unknown[][] };
};

function configuredValue(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

/** AI Search is optional: SQL/catalog matching remains the reliable baseline. */
export function researchAiSearchConfigured(): boolean {
  return Boolean(
    configuredValue("DATABRICKS_HOST") &&
    configuredValue("DATABRICKS_TOKEN") &&
    configuredValue("DATABRICKS_RESEARCH_SEARCH_INDEX"),
  );
}

/** Stable wording makes the same student profile issue the same retrieval query. */
export function researchProfileQuery(profile: ResearchSearchProfile): string {
  const interests = [...new Set(profile.interests.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const skills = [...new Set(profile.skills.map((skill) => skill.name.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return [
    `Student goal role: ${profile.goalRole || "not specified"}.`,
    `Research interests: ${interests.join(", ") || "not specified"}.`,
    `Current skills: ${skills.join(", ") || "not specified"}.`,
    "Find research opportunities where this student can contribute and grow.",
  ].join(" ");
}

function candidatesFromResponse(payload: QueryResponse): ResearchSearchCandidate[] {
  const columns = payload.manifest?.columns?.map((column) => column.name) ?? [];
  const projectIdIndex = columns.indexOf("project_id");
  if (projectIdIndex < 0 || !Array.isArray(payload.result?.data_array)) return [];
  const seen = new Set<string>();
  return payload.result.data_array.flatMap((row, rank) => {
    const projectId = row?.[projectIdIndex];
    if (typeof projectId !== "string" || !projectId || seen.has(projectId)) return [];
    seen.add(projectId);
    return [{ projectId, rank }];
  });
}

/** Retrieves candidate IDs only. AI Search scores are intentionally never exposed. */
export async function searchResearchCandidates(
  profile: ResearchSearchProfile,
  fetcher: typeof fetch = fetch,
): Promise<ResearchSearchCandidate[] | null> {
  if (!researchAiSearchConfigured()) return null;
  const host = configuredValue("DATABRICKS_HOST")!.replace(/\/$/, "");
  const token = configuredValue("DATABRICKS_TOKEN")!;
  const index = configuredValue("DATABRICKS_RESEARCH_SEARCH_INDEX")!;
  try {
    const response = await fetcher(`${host}/api/2.0/vector-search/indexes/${encodeURIComponent(index)}/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({
        query_text: researchProfileQuery(profile),
        query_type: "HYBRID",
        columns: ["project_id"],
        num_results: 30,
        // Candidate selection is limited to actionable openings. The app's
        // deterministic score still considers the same availability facts.
        filters_json: JSON.stringify({ "open_positions >": 0 }),
      }),
    });
    if (!response.ok) return null;
    return candidatesFromResponse(await response.json().catch(() => ({})) as QueryResponse);
  } catch {
    return null;
  }
}
