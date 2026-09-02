-- Placement insights — the aggregate views behind the AI/BI dashboard
-- ---------------------------------------------------------------------------
-- Audience: every signed-in CampusQuest user, through an embedded Databricks
-- AI/BI dashboard. That is the governing constraint on everything below.
--
-- Every view reads `placement_fact` (004), never the underlying tables, so
-- they are identical whether the live data is the placement cell's real
-- records or the synthetic set. Nothing here projects `student_ref` or any
-- name: a dashboard any classmate can open must never be one join away from
-- "who did Zoho reject". Adding an identifying column is not a small change.
--
-- Nothing here predicts. `outcome` is documented as descriptive history, and
-- the return outlook below is a recurrence count over past years, deliberately
-- labelled as such.

-- ------------------------------------------------------ the counting rule
-- Rows are ATTEMPTS, not people. A student sits several company processes in
-- a year: in the synthetic set 205 rows belong to 56 students.
--
-- This decides whether the headline number is right or wrong. Placed rows over
-- total rows is 59%, and that is an offer conversion rate. The placement rate
-- — the share of students who left the drive with at least one offer — is a
-- distinct-student count and runs far higher. Publishing the first under the
-- second's label understates the cohort to every student who reads it.
--
-- Both are exposed, separately named, everywhere they are computed. Where
-- `student_ref` is null the distinct-student figures degrade to attempt
-- counts, which is exactly why the column exists.

CREATE OR REPLACE VIEW {{catalog}}.{{schema}}.placement_year_summary AS
SELECT
  f.year,
  BOOL_OR(f.is_real) AS is_real,
  COUNT(DISTINCT f.student_ref) AS students_in_drive,
  COUNT(DISTINCT CASE WHEN f.outcome = 'placed' THEN f.student_ref END) AS students_placed,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN f.outcome = 'placed' THEN f.student_ref END)
        / GREATEST(COUNT(DISTINCT f.student_ref), 1), 0) AS placement_rate_pct,
  COUNT(*) AS attempts,
  count_if(f.outcome = 'placed') AS offers,
  ROUND(100.0 * count_if(f.outcome = 'placed') / GREATEST(COUNT(*), 1), 0) AS offer_conversion_pct,
  COUNT(DISTINCT f.company_name) AS companies_recruiting,
  ROUND(MAX(f.package_lpa), 2) AS highest_package_lpa,
  ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY f.package_lpa), 2) AS median_package_lpa,
  ROUND(AVG(f.package_lpa), 2) AS average_package_lpa
FROM {{catalog}}.{{schema}}.placement_fact f
GROUP BY f.year;

-- One row per company per year: who hired, how many, and for how much.
-- Package aggregates ignore nulls by construction, so they describe offers
-- actually made rather than everyone who interviewed.

CREATE OR REPLACE VIEW {{catalog}}.{{schema}}.placement_company_year AS
SELECT
  f.company_name,
  MAX(f.company_sector) AS sector,
  MAX(f.company_tier) AS tier,
  f.year,
  COUNT(DISTINCT f.student_ref) AS students_interviewed,
  count_if(f.outcome = 'placed') AS offers,
  ROUND(100.0 * count_if(f.outcome = 'placed') / GREATEST(COUNT(*), 1), 0) AS offer_conversion_pct,
  COUNT(DISTINCT f.role_family) AS roles_offered,
  ROUND(MAX(f.package_lpa), 2) AS highest_package_lpa,
  ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY f.package_lpa), 2) AS median_package_lpa,
  ROUND(AVG(f.package_lpa), 2) AS average_package_lpa
FROM {{catalog}}.{{schema}}.placement_fact f
GROUP BY f.company_name, f.year;

-- --------------------------------------------------- who is likely to return
-- "Likely to appear again" is answered from recurrence, not a model.
--
-- A company counts as present in a year if it ran a process that produced a
-- placement record that year, offer or not — for "will they be back", the
-- visit is the event, not the hire. `return_outlook` is a plain-language
-- reading of two counts: how many of the window's years they recruited in, and
-- whether they came in the most recent one. It describes the past. Do not
-- rename it to anything predictive without changing what it computes.

CREATE OR REPLACE VIEW {{catalog}}.{{schema}}.placement_company_recurrence AS
WITH window_span AS (
  SELECT MIN(year) AS first_year, MAX(year) AS latest_year
  FROM {{catalog}}.{{schema}}.placement_fact
),
per_company AS (
  SELECT
    f.company_name,
    MAX(f.company_sector) AS sector,
    MAX(f.company_tier) AS tier,
    COUNT(DISTINCT f.year) AS years_recruited,
    MIN(f.year) AS first_seen_year,
    MAX(f.year) AS last_seen_year,
    COUNT(DISTINCT CASE WHEN f.year > w.latest_year - 3 THEN f.year END) AS years_in_last_three,
    COUNT(*) AS processes_run,
    count_if(f.outcome = 'placed') AS total_offers,
    ROUND(MAX(f.package_lpa), 2) AS best_package_lpa
  FROM {{catalog}}.{{schema}}.placement_fact f
  CROSS JOIN window_span w
  GROUP BY f.company_name
)
SELECT
  pc.company_name,
  pc.sector,
  pc.tier,
  pc.years_recruited,
  w.latest_year - w.first_year + 1 AS years_in_window,
  ROUND(100.0 * pc.years_recruited / GREATEST(w.latest_year - w.first_year + 1, 1), 0) AS presence_pct,
  pc.first_seen_year,
  pc.last_seen_year,
  pc.years_in_last_three,
  pc.processes_run,
  pc.total_offers,
  pc.best_package_lpa,
  (pc.last_seen_year = w.latest_year) AS recruited_latest_year,
  CASE
    WHEN pc.years_recruited = w.latest_year - w.first_year + 1 THEN 'Every year'
    WHEN pc.last_seen_year < w.latest_year - 1 THEN 'Lapsed'
    WHEN pc.last_seen_year = w.latest_year AND pc.years_in_last_three >= 2 THEN 'Consistent'
    WHEN pc.last_seen_year = w.latest_year THEN 'Returned recently'
    ELSE 'Occasional'
  END AS return_outlook
FROM per_company pc
CROSS JOIN window_span w;

-- The package leaderboard. Ranked per year so the dashboard's year filter
-- gives a real "top offers of that year" rather than an all-time list that
-- never changes.

CREATE OR REPLACE VIEW {{catalog}}.{{schema}}.placement_top_offers AS
SELECT
  cy.year,
  cy.company_name,
  cy.sector,
  cy.tier,
  cy.offers,
  cy.highest_package_lpa,
  cy.median_package_lpa,
  RANK() OVER (PARTITION BY cy.year ORDER BY cy.highest_package_lpa DESC) AS package_rank_in_year
FROM {{catalog}}.{{schema}}.placement_company_year cy
WHERE cy.highest_package_lpa IS NOT NULL;

-- Which role families campus actually hired for, and what they paid.

CREATE OR REPLACE VIEW {{catalog}}.{{schema}}.placement_role_family_year AS
SELECT
  f.year,
  f.role_family,
  COUNT(DISTINCT f.company_name) AS companies_hiring,
  COUNT(DISTINCT f.student_ref) AS students_interviewed,
  count_if(f.outcome = 'placed') AS offers,
  ROUND(100.0 * count_if(f.outcome = 'placed') / GREATEST(COUNT(*), 1), 0) AS offer_conversion_pct,
  ROUND(MAX(f.package_lpa), 2) AS highest_package_lpa,
  ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY f.package_lpa), 2) AS median_package_lpa
FROM {{catalog}}.{{schema}}.placement_fact f
GROUP BY f.year, f.role_family;

-- Outcomes by branch, pooled across every year in the dataset.
--
-- Pooled, not per-year, and floored at five students. Splitting a cohort six
-- ways by branch and then again by year leaves three-person groups, where one
-- person moves the rate by 33 points and a reader who knows the cohort can
-- work out who.
--
-- Package leads rather than placement rate. In the synthetic set 52 of 56
-- students were placed, so the rate sits near 100% for most branches and
-- separates nothing, while median package spans 15.35 to 21.45 LPA.

CREATE OR REPLACE VIEW {{catalog}}.{{schema}}.placement_branch_summary AS
SELECT
  f.branch,
  COUNT(DISTINCT f.student_ref) AS students_in_drive,
  COUNT(DISTINCT CASE WHEN f.outcome = 'placed' THEN f.student_ref END) AS students_placed,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN f.outcome = 'placed' THEN f.student_ref END)
        / GREATEST(COUNT(DISTINCT f.student_ref), 1), 0) AS placement_rate_pct,
  count_if(f.outcome = 'placed') AS offers,
  ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY f.package_lpa), 2) AS median_package_lpa,
  ROUND(MAX(f.package_lpa), 2) AS highest_package_lpa
FROM {{catalog}}.{{schema}}.placement_fact f
GROUP BY f.branch
HAVING COUNT(DISTINCT f.student_ref) >= 5;

-- ------------------------------------------------------------- skill payoff
-- Which skills separate the students who got offers from campus generally.
--
-- The only view here that cannot run on real records: the placement cell's
-- file has no skills in it, and `student_ref` is opaque by design, so there is
-- nothing to join to `student_skills`. It therefore returns rows only while
-- the synthetic set is live, rather than sitting next to real placement
-- figures showing numbers from a different population.
--
-- The obvious version of this does not work even on synthetic data. Comparing
-- placed against not-placed inside the cohort is useless because 52 of those
-- 56 students were placed: every skill scores 90-100% and the panel ranks
-- noise. The comparison that carries signal is prevalence among placed
-- students against the campus baseline of all 221 students, which spreads from
-- Docker at +16 points down to AWS at -1.
--
-- Correlational, not causal, and the dashboard panel says so.

CREATE OR REPLACE VIEW {{catalog}}.{{schema}}.placement_skill_edge AS
WITH real_present AS (
  SELECT COUNT(*) > 0 AS yes FROM {{catalog}}.{{schema}}.placements
),
placed_students AS (
  SELECT DISTINCT student_id
  FROM {{catalog}}.{{schema}}.placement_history
  WHERE outcome = 'placed'
),
totals AS (
  SELECT
    (SELECT COUNT(*) FROM placed_students) AS placed_total,
    (SELECT COUNT(*) FROM {{catalog}}.{{schema}}.students) AS campus_total
),
per_skill AS (
  SELECT
    ss.skill_id,
    COUNT(DISTINCT ss.student_id) AS campus_holders,
    COUNT(DISTINCT CASE WHEN ps.student_id IS NOT NULL THEN ss.student_id END) AS placed_holders
  FROM {{catalog}}.{{schema}}.student_skills ss
  LEFT JOIN placed_students ps ON ps.student_id = ss.student_id
  GROUP BY ss.skill_id
)
SELECT
  sk.name AS skill_name,
  sk.category,
  k.placed_holders,
  k.campus_holders,
  ROUND(100.0 * k.placed_holders / GREATEST(t.placed_total, 1), 0) AS placed_holding_pct,
  ROUND(100.0 * k.campus_holders / GREATEST(t.campus_total, 1), 0) AS campus_holding_pct,
  ROUND(100.0 * k.placed_holders / GREATEST(t.placed_total, 1)
        - 100.0 * k.campus_holders / GREATEST(t.campus_total, 1), 0) AS lift_pct_points
FROM per_skill k
JOIN {{catalog}}.{{schema}}.skills sk ON sk.skill_id = k.skill_id
CROSS JOIN totals t
WHERE k.placed_holders >= 5
  AND NOT (SELECT yes FROM real_present);
