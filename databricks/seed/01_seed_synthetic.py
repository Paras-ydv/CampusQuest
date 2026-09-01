# Databricks notebook source
# MAGIC %md
# MAGIC # CampusQuest responsible synthetic analytical seed
# MAGIC All identities and job descriptions are synthetic. Do not load student PII here.

# COMMAND ----------
from datetime import datetime
from faker import Faker
from pyspark.sql import Row

fake = Faker("en_IN")
Faker.seed(20260901)
catalog = dbutils.widgets.get("catalog") if "dbutils" in globals() else "main"
schema = dbutils.widgets.get("schema") if "dbutils" in globals() else "campusquest"
prefix = f"{catalog}.{schema}"

skills = [
    ("python", "Python", "language"), ("sql", "SQL", "data"), ("docker", "Docker", "infra"),
    ("kubernetes", "Kubernetes", "infra"), ("pytorch", "PyTorch", "ml"),
    ("systemdesign", "System design", "systems"), ("spark", "Apache Spark", "data"),
]
roles = [("Backend Engineer", ["python", "sql", "docker", "systemdesign"]), ("AI/ML Engineer", ["python", "pytorch", "docker", "sql"]), ("Data Engineer", ["python", "sql", "spark", "docker"])]
companies = [(f"cmp_{i:03d}", fake.company(), fake.random_element(["Software", "AI", "Fintech"])) for i in range(1, 13)]
now = datetime.utcnow()

spark.createDataFrame([Row(company_id=i, company_name=n, industry=industry, headquarters="India", campus_partner=True, created_at=now) for i, n, industry in companies]).write.mode("overwrite").saveAsTable(f"{prefix}.companies")
postings, required, preferred = [], [], []
for year in range(2022, 2027):
    for company_id, company_name, _ in companies:
        for role, required_ids in roles:
            job_id = f"job_{year}_{company_id}_{role.lower().replace(' ', '_')}"
            postings.append(Row(job_id=job_id, company_id=company_id, company_name=company_name, title=role, role_family=role, description=f"Synthetic {role} role at {company_name}. Build reliable campus-scale systems.", location="India", posting_year=year, employment_type="internship", campus=True, created_at=now))
            for skill_id in required_ids:
                skill_name = next(name for sid, name, _ in skills if sid == skill_id)
                required.append(Row(job_id=job_id, skill_id=skill_id, skill_name=skill_name, importance=1.0, source="synthetic"))
            for skill_id, skill_name, _ in skills:
                if skill_id not in required_ids and len(preferred) % 3 == 0:
                    preferred.append(Row(job_id=job_id, skill_id=skill_id, skill_name=skill_name, importance=0.5, source="synthetic"))
spark.createDataFrame(postings).write.mode("overwrite").saveAsTable(f"{prefix}.job_postings")
spark.createDataFrame(required).write.mode("overwrite").saveAsTable(f"{prefix}.job_required_skills")
spark.createDataFrame(preferred).write.mode("overwrite").saveAsTable(f"{prefix}.job_preferred_skills")

resources = [Row(resource_id=f"res_{sid}", title=f"Learn {name}", provider="CampusQuest Open", resource_type="course", url=None, skill_id=sid, skill_name=name, level="intro", estimated_hours=6.0, is_open=True, source="synthetic") for sid, name, _ in skills]
spark.createDataFrame(resources).write.mode("overwrite").saveAsTable(f"{prefix}.learning_resources")
