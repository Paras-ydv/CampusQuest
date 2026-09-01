export type ProfileSyncResult = { accepted: boolean; mode: "job" | "local-fallback"; runId?: number };

/** Starts the Databricks job that reads the P3 profile/skill schema and MERGEs students_analytical. */
export async function enqueueProfileSync(userId: string, reason: string): Promise<ProfileSyncResult> {
  const host = process.env.DATABRICKS_HOST?.replace(/\/$/, "");
  const token = process.env.DATABRICKS_TOKEN;
  const jobId = process.env.DATABRICKS_PROFILE_SYNC_JOB_ID;
  if (!host || !token || !jobId) {
    if (process.env.NODE_ENV !== "production" || process.env.CAMPUSQUEST_LOCAL_FALLBACK === "true") return { accepted: true, mode: "local-fallback" };
    throw new Error("Databricks profile sync job configuration is required in production");
  }
  const response = await fetch(`${host}/api/2.1/jobs/run-now`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ job_id: Number(jobId), job_parameters: { student_id: userId, reason } }),
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({})) as { run_id?: number };
  if (!response.ok || !body.run_id) throw new Error(`Databricks profile sync job failed (${response.status})`);
  return { accepted: true, mode: "job", runId: body.run_id };
}
