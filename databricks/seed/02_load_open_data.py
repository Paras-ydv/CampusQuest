# Databricks notebook source
# MAGIC %md
# MAGIC # Load P4-provided open research and course data
# MAGIC Configure `research_source_path` and `course_source_path` as governed volumes or external locations.

# COMMAND ----------
research_source_path = dbutils.widgets.get("research_source_path")
course_source_path = dbutils.widgets.get("course_source_path")
catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")

if research_source_path:
    (spark.read.option("multiline", "true").json(research_source_path)
      .write.mode("overwrite").option("mergeSchema", "true")
      .saveAsTable(f"{catalog}.{schema}.p4_research_projects"))
if course_source_path:
    (spark.read.option("multiline", "true").json(course_source_path)
      .write.mode("append").option("mergeSchema", "true")
      .saveAsTable(f"{catalog}.{schema}.learning_resources"))
