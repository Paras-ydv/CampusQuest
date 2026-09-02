/**
 * Must be the first import in the test suite.
 *
 * The tests exercise the deterministic fallback paths. If real Supabase or
 * Databricks credentials are exported in the shell — which is normal once .env
 * is sourced — those paths take the live branch instead and the suite fails for
 * reasons unrelated to the code.
 *
 * Clearing the configuration inside the test file itself is too late: ES module
 * imports are evaluated before the importing module's body runs, and the
 * modules under test read process.env at import time. Doing it in its own
 * module, imported first, runs it before they are evaluated.
 */
for (const name of [
  "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
  "DATABRICKS_HOST", "DATABRICKS_TOKEN", "DATABRICKS_GENIE_SPACE_ID",
  "DATABRICKS_SQL_WAREHOUSE_ID", "DATABRICKS_EMBEDDING_ENDPOINT", "EMBEDDING_MODEL",
  "DATABRICKS_AI_SEARCH_ENDPOINT", "DATABRICKS_RESEARCH_SEARCH_INDEX",
  "P2_GENIE_RATIONALE_URL", "P2_SKILL_GAP_URL", "P4_RESEARCH_PROJECTS_TABLE",
  "PROFILE_SYNC_WEBHOOK_URL", "PROFILE_SYNC_WEBHOOK_SECRET",
]) delete process.env[name];

process.env.CAMPUSQUEST_LOCAL_FALLBACK = "true";
