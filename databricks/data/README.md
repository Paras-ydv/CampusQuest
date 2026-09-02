# Real placement records

Drop the placement cell's export here as **`placements.csv`** (gitignored) and
re-run `node scripts/load-campus-dataset.mjs`. The loader creates the
`placements` table, loads this file into it, and every dashboard view switches
from the synthetic campus set to these rows — `placement_fact` prefers real
records outright rather than blending the two, because union-ing them would
count the same campus twice.

Use `placements.example.csv` as the header template. The header row must list
exactly these columns, in any order:

| column | required | notes |
| --- | --- | --- |
| `student_ref` | no | Opaque per-graduate key, stable within the file. **Never** a roll number, name or email — it exists only so distinct students can be counted. Leave blank and the dashboard falls back to attempt-level figures for that row. |
| `company_name` | yes | As the placement cell records it. Spelling variants become separate companies, so normalise first. |
| `company_sector` | no | e.g. Fintech, SaaS. |
| `company_tier` | no | `product`, `growth` or `service`. |
| `role_family` | yes | Normalised, e.g. `Backend Engineer`. |
| `branch` | yes | Free text — it is not constrained to the six synthetic branches. |
| `location` | no | City or `Remote`. |
| `placement_year` | yes | Calendar year of the drive. |
| `outcome` | yes | `placed` or `not_placed`. Descriptive history, never a prediction. |
| `package_lpa` | no | Lakhs per annum. **Blank means undisclosed, not zero** — a zero would drag every median down. Only valid on a `placed` row. |
| `source` | no | Which file or drive the row came from, so a partial load can be corrected without guessing. |

One row per student per company process, not one per student: a student who
sat four companies contributes four rows. This is what lets the views separate
the placement rate (share of students with at least one offer) from the offer
conversion rate (share of processes that ended in an offer).

The one panel that cannot follow real records is **skills that paid off** — the
export carries no skills and `student_ref` is opaque, so there is nothing to
join on. That view returns no rows once real records are present, rather than
showing synthetic numbers beside real ones.
