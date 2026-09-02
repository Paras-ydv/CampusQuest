# Placement insights dashboard

The AI/BI dashboard behind `/placements`. Every signed-in student sees it, so
it is embedded with Databricks' **embedding for external users** — students do
not have Databricks accounts and the basic embed would prompt them to sign in
to the workspace.

## What backs it

`databricks/ddl/005_placement_insights.sql` creates seven aggregate views, six
of which the dashboard reads — `placement_skill_edge` is only meaningful on the
synthetic set, so no panel uses it. They
all read one source — `placement_fact`, from
`databricks/ddl/004_placement_facts.sql` — so they are identical whether the
live data is the placement cell's real records or the synthetic campus set.

None of them projects a student key or a name; the branch view suppresses
groups below five students. That is what makes the page safe to show
to the whole campus rather than to a placement cell.

**Real records.** Drop the placement cell's export at
`databricks/data/placements.csv` (gitignored — see the README there for the
header) and re-run the loader. `placement_fact` then serves those rows and
hides the synthetic set entirely; it never blends the two, because union-ing
them would count the same campus twice. With no file present the synthetic set
stays live and the page still works.

Apply everything with the loader, which runs `004`, then the real CSV if there
is one, then `005`:

```
node scripts/load-campus-dataset.mjs
```

## Workspace setup, once

1. **Service principal** — Settings → Identity and access → Service principals.
   Create one for the app and generate an OAuth secret. Copy the secret
   immediately; it is not shown again.
2. **Grants** — `SELECT` on `{catalog}.{schema}` (the views and the tables they
   read), and `CAN RUN` on the published dashboard.
3. **Approved domains** — Settings → Security → Embed dashboards → *Allow
   approved domains*, listing the Vercel production domain and any preview
   domain the app is demoed from. Without this the iframe loads empty.
4. **Workspace ID** — the numeric id in the workspace URL.

## Deploy

```
node scripts/deploy-placement-dashboard.mjs
```

Imports `placement_insights.lvdash.json`, sets the warehouse, and publishes it
with `embed_credentials: false` so queries run as the service principal rather
than as whoever last published. The script prints the `DATABRICKS_DASHBOARD_ID`
to configure.

## Environment

| Key | Where it is read |
| --- | --- |
| `DATABRICKS_WORKSPACE_ID` | server + sent to the browser |
| `DATABRICKS_DASHBOARD_ID` | server + sent to the browser |
| `DATABRICKS_DASHBOARD_CLIENT_ID` | server only |
| `DATABRICKS_DASHBOARD_CLIENT_SECRET` | server only |

`DATABRICKS_HOST` doubles as the embed instance URL. The client secret is never
sent to the browser: `POST /api/placements/dashboard-token` exchanges it for a
token scoped to this one dashboard, valid for an hour, and the SDK refreshes
through the same route.

## Editing panels

The `.lvdash.json` widget schema is not publicly specified, so treat the AI/BI
editor as the layout tool and this file as the source of truth:

```
node scripts/deploy-placement-dashboard.mjs --export
```

pulls the workspace copy back and re-templates the catalogue and schema. Commit
the result. Re-deploying without exporting first will overwrite UI edits.
