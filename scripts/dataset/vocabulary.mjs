/**
 * The fixed vocabulary the generator samples from. Kept separate from the
 * generator so the shape of the dataset is readable without reading the
 * sampling logic.
 */

/**
 * The application's own skill vocabulary (Supabase `public.skills`) keys on
 * slugs like `docker`, while this dataset keys on SK-numbers. Carrying both
 * lets a query cross between the operational and analytical planes without a
 * translation table; the compatibility views expose the slug as `skill_id`.
 */
const SKILL_SLUGS = {
  "Python": "python",
  "Java": "java",
  "C++": "cpp",
  "JavaScript": "javascript",
  "TypeScript": "typescript",
  "Go": "go",
  "SQL": "sql",
  "Data Structures & Algorithms": "dsa",
  "System Design": "systemdesign",
  "Operating Systems": "os",
  "Computer Networks": "networks",
  "DBMS": "dbms",
  "Git": "git",
  "Linux": "linux",
  "REST APIs": "rest",
  "GraphQL": "graphql",
  "Node.js": "node",
  "Express": "express",
  "Spring Boot": "springboot",
  "Django": "django",
  "Flask": "flask",
  "React": "react",
  "Next.js": "nextjs",
  "Angular": "angular",
  "Docker": "docker",
  "Kubernetes": "kubernetes",
  "AWS": "aws",
  "Azure": "azure",
  "CI/CD": "cicd",
  "Terraform": "terraform",
  "PostgreSQL": "postgres",
  "MongoDB": "mongodb",
  "Redis": "redis",
  "Apache Spark": "spark",
  "Kafka": "kafka",
  "Airflow": "airflow",
  "Pandas": "pandas",
  "NumPy": "numpy",
  "scikit-learn": "sklearn",
  "PyTorch": "pytorch",
  "TensorFlow": "tensorflow",
  "Computer Vision": "cv",
  "NLP": "nlp",
  "MLOps": "mlops",
  "Android": "android",
  "Figma": "figma"
};

/** 46 skills. Every skill_id referenced anywhere must resolve here. */
export const SKILLS = [
  ["Python", "language"], ["Java", "language"], ["C++", "language"], ["JavaScript", "language"],
  ["TypeScript", "language"], ["Go", "language"], ["SQL", "data"],
  ["Data Structures & Algorithms", "practice"], ["System Design", "systems"],
  ["Operating Systems", "systems"], ["Computer Networks", "systems"], ["DBMS", "data"],
  ["Git", "tooling"], ["Linux", "systems"], ["REST APIs", "practice"], ["GraphQL", "practice"],
  ["Node.js", "framework"], ["Express", "framework"], ["Spring Boot", "framework"],
  ["Django", "framework"], ["Flask", "framework"], ["React", "framework"],
  ["Next.js", "framework"], ["Angular", "framework"], ["Docker", "infra"],
  ["Kubernetes", "infra"], ["AWS", "infra"], ["Azure", "infra"], ["CI/CD", "infra"],
  ["Terraform", "infra"], ["PostgreSQL", "data"], ["MongoDB", "data"], ["Redis", "data"],
  ["Apache Spark", "data"], ["Kafka", "data"], ["Airflow", "data"], ["Pandas", "ml"],
  ["NumPy", "ml"], ["scikit-learn", "ml"], ["PyTorch", "ml"], ["TensorFlow", "ml"],
  ["Computer Vision", "ml"], ["NLP", "ml"], ["MLOps", "ml"], ["Android", "framework"],
  ["Figma", "tooling"],
].map(([name, category], index) => ({
  skill_id: `SK${String(index + 1).padStart(3, "0")}`,
  slug: SKILL_SLUGS[name],
  name,
  category,
}));

const byName = new Map(SKILLS.map((s) => [s.name, s.skill_id]));
/** Look a skill id up by display name so the profiles below stay readable. */
export const sk = (name) => {
  const id = byName.get(name);
  if (!id) throw new Error(`Unknown skill: ${name}`);
  return id;
};

/**
 * Per-family skill probability profiles — the reason the dataset has shape.
 * Uniform assignment makes every aggregate converge to the same percentage and
 * no gap more urgent than another; these produce real clustering and a
 * near-miss population worth ranking.
 *
 * The Backend and Software Engineer profiles are tuned so their combined
 * aggregate reproduces the distribution in the data-foundation document:
 * DSA ~82%, SQL ~68%, Java ~59%, System Design ~57%, Python ~52%, Git ~48%.
 */
export const ROLE_FAMILIES = [
  { family: "Backend Engineer", roles: 22, profile: {
    "Data Structures & Algorithms": 0.78, "SQL": 0.72, "Java": 0.54, "System Design": 0.56,
    "Python": 0.48, "Git": 0.40, "REST APIs": 0.42, "DBMS": 0.30, "Docker": 0.26,
    "PostgreSQL": 0.22, "Spring Boot": 0.20, "AWS": 0.16, "Linux": 0.15, "Node.js": 0.14,
    "Redis": 0.11, "Kubernetes": 0.10, "CI/CD": 0.10, "MongoDB": 0.14, "Kafka": 0.12 } },
  { family: "Software Engineer", roles: 22, profile: {
    "Data Structures & Algorithms": 0.80, "SQL": 0.62, "Java": 0.50, "System Design": 0.50,
    "Python": 0.50, "Git": 0.42, "REST APIs": 0.33, "Operating Systems": 0.24, "DBMS": 0.26,
    "C++": 0.24, "Computer Networks": 0.18, "JavaScript": 0.20, "Docker": 0.17,
    "Linux": 0.15, "React": 0.18, "AWS": 0.16, "CI/CD": 0.14 } },
  { family: "Frontend Engineer", roles: 24, profile: {
    "JavaScript": 0.86, "React": 0.74, "TypeScript": 0.60, "Git": 0.55, "REST APIs": 0.46,
    "Data Structures & Algorithms": 0.52, "Next.js": 0.34, "System Design": 0.24,
    "Figma": 0.24, "Node.js": 0.20, "Angular": 0.17, "GraphQL": 0.20, "Docker": 0.16 } },
  { family: "Data Engineer", roles: 20, profile: {
    "SQL": 0.90, "Python": 0.78, "Apache Spark": 0.60, "Airflow": 0.44, "DBMS": 0.40,
    "Kafka": 0.34, "PostgreSQL": 0.34, "AWS": 0.33, "Docker": 0.29,
    "Data Structures & Algorithms": 0.42, "Linux": 0.26, "MongoDB": 0.20 } },
  { family: "ML Engineer", roles: 22, profile: {
    "Python": 0.92, "Pandas": 0.55, "scikit-learn": 0.54, "PyTorch": 0.53, "NumPy": 0.50,
    "Data Structures & Algorithms": 0.48, "SQL": 0.44, "TensorFlow": 0.29, "Docker": 0.27,
    "MLOps": 0.24, "Computer Vision": 0.20, "NLP": 0.24, "AWS": 0.22 } },
  { family: "Data Analyst", roles: 18, profile: {
    "SQL": 0.88, "Python": 0.60, "Pandas": 0.50, "DBMS": 0.35, "NumPy": 0.30,
    "Data Structures & Algorithms": 0.24, "Git": 0.34, "Figma": 0.16 } },
  { family: "DevOps Engineer", roles: 18, profile: {
    "Docker": 0.86, "Linux": 0.74, "Kubernetes": 0.70, "CI/CD": 0.66, "AWS": 0.64,
    "Git": 0.54, "Terraform": 0.44, "Python": 0.40, "Computer Networks": 0.33,
    "System Design": 0.34, "Azure": 0.24 } },
  { family: "Mobile Engineer", roles: 16, profile: {
    "Android": 0.72, "Java": 0.55, "Git": 0.50, "Data Structures & Algorithms": 0.48,
    "REST APIs": 0.44, "React": 0.28, "TypeScript": 0.30, "System Design": 0.25 } },
  { family: "QA Engineer", roles: 14, profile: {
    "Python": 0.46, "Git": 0.45, "REST APIs": 0.40, "SQL": 0.35,
    "Data Structures & Algorithms": 0.33, "CI/CD": 0.29, "Linux": 0.26, "Docker": 0.20 } },
  { family: "Embedded Engineer", roles: 15, profile: {
    "C++": 0.80, "Operating Systems": 0.55, "Linux": 0.50, "Data Structures & Algorithms": 0.44,
    "Git": 0.39, "Computer Networks": 0.38, "Python": 0.38 } },
  { family: "Product Engineer", roles: 14, profile: {
    "JavaScript": 0.55, "React": 0.49, "Git": 0.49, "SQL": 0.44, "TypeScript": 0.40,
    "REST APIs": 0.39, "Figma": 0.34, "Python": 0.33,
    "Data Structures & Algorithms": 0.38 } },
];

export const BRANCHES = ["CSE", "ISE", "ECE", "EEE", "ME", "AIML"];

export const FIRST_NAMES = [
  "Aarav", "Rahul", "Meera", "Ishita", "Rohan", "Sara", "Dev", "Ananya", "Karthik", "Divya",
  "Nikhil", "Priya", "Arjun", "Sneha", "Vikram", "Aditi", "Siddharth", "Kavya", "Manish",
  "Pooja", "Harsh", "Neha", "Varun", "Shreya", "Aditya", "Tanvi", "Raghav", "Anjali",
  "Kunal", "Riya", "Sanjay", "Lakshmi", "Abhishek", "Nandini", "Vivek", "Swati", "Gaurav",
  "Deepika", "Yash", "Preeti",
];

export const LAST_NAMES = [
  "Sharma", "Rao", "Iyer", "Nair", "Verma", "Fernandes", "Patel", "Reddy", "Menon", "Shetty",
  "Gupta", "Kulkarni", "Desai", "Bhat", "Joshi", "Pillai", "Chauhan", "Naik", "Hegde", "Mehta",
];

export const COMPANY_NAMES = [
  "Razorpay", "Zerodha", "Swiggy", "Flipkart", "PhonePe", "Freshworks", "Zoho", "Postman",
  "CRED", "Meesho", "Groww", "Slice", "Zepto", "Dunzo", "Udaan", "BrowserStack", "Chargebee",
  "Hasura", "Atlan", "Sarvam AI", "Infosys", "Wipro", "TCS", "Mindtree", "Mphasis",
  "Juspay", "Setu", "Innovaccer", "Locus", "Netradyne",
];

export const LOCATIONS = ["Bengaluru", "Hyderabad", "Pune", "Chennai", "Remote", "Mumbai", "Delhi NCR"];

/** Research areas. Professors publish in these; projects must match. */
export const RESEARCH_AREAS = [
  "Computer Vision", "Robotics", "Natural Language Processing", "Machine Learning",
  "Distributed Systems", "Computer Architecture", "Wireless Networks", "VLSI Design",
  "Signal Processing", "Cybersecurity", "Human-Computer Interaction", "Bioinformatics",
  "Power Systems", "Control Systems", "Data Mining",
];

/** Which departments plausibly host which areas — keeps professors coherent. */
export const AREA_DEPARTMENTS = {
  "Computer Vision": ["CSE", "AIML", "ECE"], "Robotics": ["AIML", "ECE", "ME"],
  "Natural Language Processing": ["CSE", "AIML"], "Machine Learning": ["CSE", "AIML", "ISE"],
  "Distributed Systems": ["CSE", "ISE"], "Computer Architecture": ["CSE", "ECE"],
  "Wireless Networks": ["ECE", "ISE"], "VLSI Design": ["ECE", "EEE"],
  "Signal Processing": ["ECE", "EEE"], "Cybersecurity": ["CSE", "ISE"],
  "Human-Computer Interaction": ["ISE", "CSE"], "Bioinformatics": ["AIML", "CSE"],
  "Power Systems": ["EEE"], "Control Systems": ["EEE", "ME"], "Data Mining": ["ISE", "CSE"],
};

export const OPPORTUNITY_TYPES = ["internship", "hackathon", "workshop", "competition", "research"];

/**
 * Opportunity titles keyed by domain, so an opportunity's domain always
 * matches its title — one of the generator's integrity rules.
 */
export const OPPORTUNITY_TITLES = {
  Backend: ["Backend Intern", "API Platform Internship", "Distributed Systems Workshop", "Scalable Services Bootcamp"],
  Frontend: ["Frontend Intern", "Design Systems Workshop", "React Performance Clinic", "UI Engineering Sprint"],
  Data: ["Data Engineering Intern", "Databricks Campus Hackathon", "Analytics Case Competition", "Data Pipeline Workshop"],
  "Machine Learning": ["ML Research Assistantship", "Applied ML Internship", "Kaggle Campus Competition", "Deep Learning Workshop"],
  DevOps: ["Platform Engineering Intern", "Kubernetes Workshop", "Site Reliability Bootcamp", "CI/CD Clinic"],
  Robotics: ["Vision-Guided Robotics Assistantship", "Autonomous Systems Hackathon", "Robotics Build Sprint", "ROS Workshop"],
  Algorithms: ["ACM ICPC Regionals", "System Design Primer", "Competitive Programming Camp", "DSA Intensive"],
  Mobile: ["Android Intern", "Mobile App Hackathon", "Cross-Platform Workshop", "App Performance Clinic"],
};

export const ORGANIZATIONS = [
  "Razorpay", "HackCulture", "BMSCE ACM Chapter", "Google Developer Groups", "Databricks",
  "Microsoft Learn Student Chapter", "IEEE BMSCE", "Coding Club", "Flipkart", "Zoho",
  "AWS Educate", "NVIDIA Developer Program",
];

export const RESOURCE_PROVIDERS = ["NPTEL", "Coursera", "freeCodeCamp", "MIT OCW", "Databricks Academy", "YouTube", "Udemy", "Campus Workshop"];
