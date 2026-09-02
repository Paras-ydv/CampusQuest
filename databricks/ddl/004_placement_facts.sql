-- Real placement records, and the single fact source the insight views read
-- ---------------------------------------------------------------------------
-- The fourteen-table dataset is synthetic. `placements` below is where the
-- placement cell's actual records go, in one flat table that mirrors
-- public.placements in Supabase column for column, so the operational and
-- analytical planes describe a placement the same way.
--
-- Flat on purpose. Real records arrive as one row per student per company —
-- a name, a branch, a package. Making the placement cell invent role_ids and
-- company_ids to fit the synthetic schema's joins would be busywork that
-- introduces errors, so the shape follows the source data instead.

CREATE TABLE IF NOT EXISTS {{catalog}}.{{schema}}.placements (
  student_ref STRING COMMENT 'Opaque per-graduate key, used only to count distinct students. Never a roll number, name or email. Null means only attempt-level figures are trustworthy for this row.',
  company_name STRING NOT NULL COMMENT 'Recruiting company, as the placement cell records it.',
  company_sector STRING COMMENT 'Sector, e.g. Fintech or SaaS. Optional.',
  company_tier STRING COMMENT 'product, growth or service. Optional.',
  role_family STRING NOT NULL COMMENT 'Normalised role family, e.g. Backend Engineer.',
  branch STRING NOT NULL COMMENT 'Engineering branch exactly as the records state it. Deliberately not constrained to the six synthetic branches.',
  location STRING COMMENT 'City or Remote. Optional.',
  placement_year INT NOT NULL COMMENT 'Calendar year of the drive.',
  outcome STRING NOT NULL COMMENT 'placed or not_placed. Descriptive history, never a prediction.',
  package_lpa DOUBLE COMMENT 'Offered package in lakhs per annum. Null means undisclosed, not zero, and is only valid when outcome is placed.',
  source STRING COMMENT 'Where the row came from, so a partial load can be corrected without guessing.'
) USING DELTA COMMENT 'Real campus placement records. Aggregate-safe: no graduate is identifiable from any column.';

-- ------------------------------------------------------- one source of truth
-- Everything the dashboard reports comes through this view, so the insight
-- views never need to know which dataset is live.
--
-- Real records win outright when any exist; the synthetic set is not blended
-- with them. Union-ing the two would double-count the same campus and produce
-- placement rates that describe neither. `is_real` is projected so a panel can
-- say which it is showing rather than leaving a student to assume.

CREATE OR REPLACE VIEW {{catalog}}.{{schema}}.placement_fact AS
WITH real_present AS (
  SELECT COUNT(*) > 0 AS yes FROM {{catalog}}.{{schema}}.placements
)
SELECT
  TRUE AS is_real,
  r.student_ref,
  r.company_name,
  r.company_sector,
  r.company_tier,
  r.role_family,
  COALESCE(r.branch, 'Unknown') AS branch,
  r.placement_year AS year,
  r.outcome,
  r.package_lpa
FROM {{catalog}}.{{schema}}.placements r
WHERE (SELECT yes FROM real_present)

UNION ALL

SELECT
  FALSE AS is_real,
  p.student_id AS student_ref,
  c.name AS company_name,
  c.sector AS company_sector,
  c.tier AS company_tier,
  j.role_family,
  COALESCE(s.branch, 'Unknown') AS branch,
  p.year,
  p.outcome,
  p.package_lpa
FROM {{catalog}}.{{schema}}.placement_history p
JOIN {{catalog}}.{{schema}}.job_roles j ON j.role_id = p.role_id
JOIN {{catalog}}.{{schema}}.companies c ON c.company_id = p.company_id
-- Left, not inner: placement_history.student_id is nullable, and an attempt
-- with no student attached is still an attempt.
LEFT JOIN {{catalog}}.{{schema}}.students s ON s.student_id = p.student_id
WHERE NOT (SELECT yes FROM real_present);
