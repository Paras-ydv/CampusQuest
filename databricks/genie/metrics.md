# CampusQuest Genie metrics

## Role-alignment score

For a student and a scoped set of historical postings, calculate the percentage
of each posting's **required** skills held by that student, then average those
posting percentages. `role_alignment` exposes the evidence. Preferred skills
must never be treated as required skills.

## Skill-gap set

The gap set is every required skill in the scoped postings that the student does
not hold. Its `frequency_pct` and `impact_pct` are the percentage of scoped
postings requiring that skill. `skill_gap_view` exposes this deterministic set.

## Reporting rules

- State the population (role and years) before interpreting a percentage.
- Do not infer a placement probability from alignment.
- Do not calculate a metric in prose when the corresponding view has no rows.
- Return SQL evidence for analytical answers when it is available.
