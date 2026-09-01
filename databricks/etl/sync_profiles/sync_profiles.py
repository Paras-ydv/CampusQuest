# Databricks notebook source
# MAGIC %md
# MAGIC # Supabase profile to `students_analytical` sync
# MAGIC Run nightly for all changed profiles or on demand with the optional `student_id` job parameter.

# COMMAND ----------
import os
import requests
from datetime import datetime, timezone
from pyspark.sql import Row

supabase_url = dbutils.secrets.get("campusquest", "supabase-url")
supabase_key = dbutils.secrets.get("campusquest", "supabase-service-role-key")
catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
student_id = dbutils.widgets.get("student_id")
headers = {"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"}

params = {"select": "id,goal_role,academic_year,interests,xp,level,updated_at"}
if student_id:
    params["id"] = f"eq.{student_id}"
profile_response = requests.get(f"{supabase_url}/rest/v1/profiles", headers=headers, params=params, timeout=30)
profile_response.raise_for_status()
profiles = profile_response.json()
if not profiles:
    dbutils.notebook.exit("No profiles to sync")

ids = ",".join(profile["id"] for profile in profiles)
skills = requests.get(
    f"{supabase_url}/rest/v1/user_skills",
    headers=headers,
    params={"select": "user_id,skill_id,skills(name)", "user_id": f"in.({ids})"},
    timeout=30,
).json()
projects = requests.get(f"{supabase_url}/rest/v1/user_projects", headers=headers, params={"select": "user_id", "user_id": f"in.({ids})"}, timeout=30).json()
certifications = requests.get(f"{supabase_url}/rest/v1/user_certifications", headers=headers, params={"select": "user_id", "user_id": f"in.({ids})"}, timeout=30).json()

skills_by_user, projects_by_user, certs_by_user = {}, {}, {}
for item in skills: skills_by_user.setdefault(item["user_id"], []).append(item)
for item in projects: projects_by_user[item["user_id"]] = projects_by_user.get(item["user_id"], 0) + 1
for item in certifications: certs_by_user[item["user_id"]] = certs_by_user.get(item["user_id"], 0) + 1
now = datetime.now(timezone.utc)
rows = [Row(
    student_id=profile["id"], goal_role=profile["goal_role"], academic_year=profile["academic_year"], interests=profile.get("interests", []),
    skill_ids=[item["skill_id"] for item in skills_by_user.get(profile["id"], [])],
    skill_names=[item.get("skills", {}).get("name", item["skill_id"]) for item in skills_by_user.get(profile["id"], [])],
    project_count=projects_by_user.get(profile["id"], 0), certification_count=certs_by_user.get(profile["id"], 0),
    xp=profile["xp"], level=profile["level"], profile_updated_at=profile.get("updated_at"), synced_at=now,
) for profile in profiles]

source = spark.createDataFrame(rows)
source.createOrReplaceTempView("incoming_students_analytical")
spark.sql(f"""
MERGE INTO {catalog}.{schema}.students_analytical target
USING incoming_students_analytical source ON target.student_id = source.student_id
WHEN MATCHED THEN UPDATE SET *
WHEN NOT MATCHED THEN INSERT *
""")
