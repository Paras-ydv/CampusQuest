export type SqlParameter = { name: string; value: string; type?: string };
export type SqlResult = { columns: string[]; rows: unknown[][]; truncated: boolean; statementId: string };

type StatementPayload = {
  statement_id?: string;
  status?: { state?: string; error?: { message?: string } };
  manifest?: { schema?: { columns?: { name?: string }[] } };
  result?: { data_array?: unknown[][]; truncated?: boolean };
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for Databricks SQL`);
  return value;
}

export function databricksSqlConfigured(): boolean {
  return Boolean(process.env.DATABRICKS_HOST && process.env.DATABRICKS_TOKEN && process.env.DATABRICKS_SQL_WAREHOUSE_ID);
}

/** Executes fixed, parameterized SQL only. Identifiers are never accepted from callers. */
export async function executeDatabricksSql(statement: string, parameters: SqlParameter[] = [], rowLimit = 500): Promise<SqlResult> {
  const host = required("DATABRICKS_HOST").replace(/\/$/, "");
  const token = required("DATABRICKS_TOKEN");
  const warehouseId = required("DATABRICKS_SQL_WAREHOUSE_ID");
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const create = await fetch(`${host}/api/2.0/sql/statements`, {
    method: "POST",
    headers,
    cache: "no-store",
    body: JSON.stringify({
      warehouse_id: warehouseId,
      statement,
      parameters,
      wait_timeout: "10s",
      on_wait_timeout: "CANCEL",
      disposition: "INLINE",
      format: "JSON_ARRAY",
      row_limit: rowLimit,
    }),
  });
  let payload = await create.json().catch(() => ({})) as StatementPayload;
  if (!create.ok) throw new Error(`Databricks SQL request failed (${create.status})`);
  if (!payload.statement_id) throw new Error("Databricks SQL returned no statement ID");
  const statementId = payload.statement_id;
  for (let attempt = 0; payload.status?.state === "PENDING" || payload.status?.state === "RUNNING"; attempt += 1) {
    if (attempt >= 24) throw new Error("Databricks SQL timed out");
    await new Promise((resolve) => setTimeout(resolve, 250));
    const poll = await fetch(`${host}/api/2.0/sql/statements/${encodeURIComponent(statementId)}`, { headers, cache: "no-store" });
    payload = await poll.json().catch(() => ({})) as StatementPayload;
    if (!poll.ok) throw new Error(`Databricks SQL poll failed (${poll.status})`);
  }
  if (payload.status?.state !== "SUCCEEDED") throw new Error(payload.status?.error?.message ?? `Databricks SQL did not succeed (${payload.status?.state ?? "unknown"})`);
  return {
    statementId,
    columns: payload.manifest?.schema?.columns?.map((column) => column.name ?? "value") ?? [],
    rows: payload.result?.data_array ?? [],
    truncated: Boolean(payload.result?.truncated),
  };
}
