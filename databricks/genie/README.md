# Genie Agent setup

Create a Genie Agent (formerly Genie Space) with a pro or serverless SQL
warehouse and add the analytical Delta tables plus `role_alignment` and
`skill_gap_view`. Paste `instructions.md`, add the metric definitions in
`metrics.md`, add the parameterized examples in
`example_queries.sql`, and set common questions from the app's Genie suggestions.

Grant the P2 service principal `CAN USE` on the warehouse, `SELECT` on these
assets, and `CAN RUN` on the Genie Agent. Set the resulting identifier as
`DATABRICKS_GENIE_SPACE_ID`. Test the Docker, skill-gap, peer, and research demo
questions before sharing the Agent. Keep user data limited by Unity Catalog row
filters where a shared workspace requires it.
