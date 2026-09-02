import type {
  AlignmentResponse,
  GenieSuggestion,
  HistoricalRole,
  Opportunity,
  PeerMatch,
  Profile,
  Quest,
  ResearchMatch,
  SkillGap,
} from "@campusquest/shared";
import { skill, skills } from "./skills";

/**
 * Demo dataset.
 *
 * Every number here is shaped like the real thing so the UI is built against
 * realistic values — percentages are 0-100, XP is an integer, alignment comes
 * with the role count it was computed from. When P2 and P3 ship, `lib/data/
 * client.ts` swaps its fixture reads for fetches and none of this moves.
 */

export const DEMO_PROFILE: Profile = {
  id: "stu_001",
  name: "Kartikeya",
  email: "kartikeya@campus.edu",
  initials: "KG",
  branch: "Computer Science",
  year: 3,
  goalRole: "AI/ML Engineer",
  interests: ["Machine learning", "Distributed systems", "Robotics", "Open source"],
  wantsToLearn: ["docker", "systemdesign", "kubernetes"],
  skills: [
    { skill: skill("python"), proficiency: "strong", source: "verified" },
    { skill: skill("pytorch"), proficiency: "working", source: "quest" },
    { skill: skill("sql"), proficiency: "working", source: "self" },
    { skill: skill("react"), proficiency: "working", source: "quest" },
    { skill: skill("fastapi"), proficiency: "working", source: "self" },
    { skill: skill("rest"), proficiency: "strong", source: "quest" },
    { skill: skill("git"), proficiency: "strong", source: "verified" },
    { skill: skill("linux"), proficiency: "working", source: "self" },
    { skill: skill("sklearn"), proficiency: "working", source: "self" },
    { skill: skill("dsa"), proficiency: "working", source: "verified" },
  ],
  projects: [
    {
      id: "prj_1",
      title: "Campus notes search",
      summary:
        "Semantic search over four semesters of lecture notes. FastAPI backend, sentence-transformers embeddings, 1.2k monthly queries.",
      skillIds: ["python", "fastapi", "transformers"],
      url: null,
    },
    {
      id: "prj_2",
      title: "Attendance vision tool",
      summary:
        "Face-recognition attendance prototype built for the department, deployed on a Raspberry Pi.",
      skillIds: ["python", "cv", "linux"],
      url: null,
    },
  ],
  certifications: [
    {
      id: "cert_1",
      title: "Deep Learning Specialization",
      issuer: "DeepLearning.AI",
      earnedAt: "2025-07-14T00:00:00.000Z",
    },
  ],
  level: 7,
  xp: 2340,
  xpToNext: 3000,
  alignmentPct: 62,
  createdAt: "2024-08-02T00:00:00.000Z",
};

/* ------------------------------------------------------------------ Gaps -- */

export const DEMO_GAPS: SkillGap[] = [
  { skill: skill("docker"), frequencyPct: 68, impactPct: 12, roleCount: 41, importance: "core", resource: null },
  { skill: skill("systemdesign"), frequencyPct: 57, impactPct: 9, roleCount: 41, importance: "core", resource: null },
  { skill: skill("kubernetes"), frequencyPct: 41, impactPct: 7, roleCount: 41, importance: "core", resource: null },
  { skill: skill("mlops"), frequencyPct: 38, impactPct: 6, roleCount: 41, importance: "core", resource: null },
];

export const DEMO_ALIGNMENT: AlignmentResponse = {
  currentPct: 62,
  roleCount: 41,
  alignedRoleCount: 24,
  yearsCovered: "2022–2025",
  targetRole: "AI/ML Engineer",
  roleFamily: "ML Engineer",
  gaps: DEMO_GAPS,
  heldSkills: skills("python", "pytorch", "sql", "rest", "git", "linux", "sklearn"),
};

/**
 * A sample of the roles the alignment score is computed against. In production
 * this is a page of `job_postings` joined to `job_required_skills` in
 * Databricks; `matchPct` is the share of required skills the student holds.
 */
export const DEMO_ROLES: HistoricalRole[] = [
  {
    id: "role_1",
    title: "ML Infrastructure Engineer",
    company: "Nimbus Labs",
    year: 2025,
    requiredSkills: skills("python", "docker", "kubernetes", "sql"),
    coreSkills: skills("python", "docker", "kubernetes", "sql"),
    matchPct: 50,
    aligned: true,
  },
  {
    id: "role_2",
    title: "Backend Engineer",
    company: "Meridian Systems",
    year: 2025,
    requiredSkills: skills("python", "sql", "rest", "docker", "systemdesign"),
    coreSkills: skills("python", "sql", "rest", "docker", "systemdesign"),
    matchPct: 60,
    aligned: true,
  },
  {
    id: "role_3",
    title: "Applied Scientist, Intern",
    company: "Cobalt AI",
    year: 2025,
    requiredSkills: skills("python", "pytorch", "sklearn"),
    coreSkills: skills("python", "pytorch", "sklearn"),
    matchPct: 100,
    aligned: true,
  },
  {
    id: "role_4",
    title: "Platform Engineer",
    company: "Orbit Retail",
    year: 2024,
    requiredSkills: skills("linux", "docker", "kubernetes", "cicd"),
    coreSkills: skills("linux", "docker", "kubernetes", "cicd"),
    matchPct: 25,
    aligned: false,
  },
  {
    id: "role_5",
    title: "Data Engineer",
    company: "Northwind Analytics",
    year: 2024,
    requiredSkills: skills("python", "sql", "spark", "docker"),
    coreSkills: skills("python", "sql", "spark", "docker"),
    matchPct: 50,
    aligned: true,
  },
  {
    id: "role_6",
    title: "ML Engineer",
    company: "Helix Health",
    year: 2024,
    requiredSkills: skills("python", "pytorch", "mlops", "docker"),
    coreSkills: skills("python", "pytorch", "mlops", "docker"),
    matchPct: 50,
    aligned: true,
  },
  {
    id: "role_7",
    title: "Full-stack Engineer",
    company: "Paperplane",
    year: 2023,
    requiredSkills: skills("typescript", "react", "rest", "postgres"),
    coreSkills: skills("typescript", "react", "rest", "postgres"),
    matchPct: 50,
    aligned: true,
  },
  {
    id: "role_8",
    title: "Systems Engineer",
    company: "Meridian Systems",
    year: 2023,
    requiredSkills: skills("cpp", "linux", "distributed", "systemdesign"),
    coreSkills: skills("cpp", "linux", "distributed", "systemdesign"),
    matchPct: 25,
    aligned: false,
  },
];

/* ---------------------------------------------------------------- Quests -- */

export const DEMO_QUESTS: Quest[] = [
  {
    id: "q_docker",
    title: "Dockerize your backend project",
    summary:
      "Containerise the campus notes search API, add a compose file with Postgres, and publish the image.",
    category: "build",
    rarity: "epic",
    xp: 120,
    skillsGained: skills("docker"),
    steps: [
      { id: "s1", label: "Write a multi-stage Dockerfile", done: false },
      { id: "s2", label: "Add docker-compose with Postgres", done: false },
      { id: "s3", label: "Push the image and document the run", done: false },
    ],
    estimatedHours: 6,
    why: "Docker appeared in 68% of the backend and ML-infra roles that recruited on this campus in 2024–25 — the highest-frequency skill you're missing. Closing it moves your historical alignment from 62% to 74%.",
    status: "active",
  },
  {
    id: "q_sysdesign",
    title: "Design and write up a rate limiter",
    summary:
      "Pick a real API, design a distributed rate limiter for it, and write the trade-offs up as a short doc.",
    category: "learn",
    rarity: "rare",
    xp: 90,
    skillsGained: skills("systemdesign"),
    steps: [
      { id: "s1", label: "Sketch the token-bucket design", done: false },
      { id: "s2", label: "Write the failure-mode section", done: false },
    ],
    estimatedHours: 4,
    why: "System design came up in 57% of surveyed roles and in every interview loop recorded for senior-intern positions.",
    status: "available",
  },
  {
    id: "q_oss",
    title: "Land a PyTorch good-first-issue",
    summary:
      "Pick up a labelled starter issue in the PyTorch repo and carry it through review.",
    category: "contribute",
    rarity: "legendary",
    xp: 220,
    skillsGained: skills("pytorch", "git"),
    steps: [
      { id: "s1", label: "Claim an open good-first-issue", done: false },
      { id: "s2", label: "Open the pull request", done: false },
      { id: "s3", label: "Get it merged", done: false },
    ],
    estimatedHours: 14,
    why: "Open-source contributions were named in 3 of the 5 ML-infra job descriptions that mentioned portfolio evidence.",
    status: "available",
  },
  {
    id: "q_sql",
    title: "Tune three slow queries",
    summary:
      "Profile the slowest endpoints in your notes-search API and cut their query time with indexes.",
    category: "build",
    rarity: "common",
    xp: 60,
    skillsGained: skills("sql", "postgres"),
    steps: [
      { id: "s1", label: "Capture the slow query log", done: false },
      { id: "s2", label: "Add and measure indexes", done: false },
    ],
    estimatedHours: 3,
    why: "SQL appears in 71% of surveyed roles. You hold it at working level — this moves it to strong.",
    status: "available",
  },
  {
    id: "q_team",
    title: "Form a hackathon team of three",
    summary:
      "Recruit two students with complementary skills and register for Smart India Hackathon.",
    category: "connect",
    rarity: "rare",
    xp: 80,
    skillsGained: [],
    steps: [
      { id: "s1", label: "Send three connection requests", done: true },
      { id: "s2", label: "Agree on a problem statement", done: false },
      { id: "s3", label: "Register the team", done: false },
    ],
    estimatedHours: 2,
    why: "Six students on campus match your interests with complementary skills, and three are explicitly looking for a team.",
    status: "active",
  },
];

/* --------------------------------------------------------- Opportunities -- */

export const DEMO_OPPORTUNITIES: Opportunity[] = [
  {
    id: "opp_1",
    title: "ML Infrastructure Internship",
    org: "Nimbus Labs",
    kind: "internship",
    description:
      "Six-month internship on the model-serving team. Container orchestration, inference latency, and evaluation pipelines.",
    deadline: "2026-09-06T23:59:00.000Z",
    requiredSkills: skills("python", "docker", "kubernetes"),
    skillsGained: skills("mlops", "kubernetes"),
    difficulty: "advanced",
    matchPct: 84,
    closesGapIds: ["docker", "kubernetes"],
    url: "#",
    saved: true,
    source: "Campus placement cell",
  },
  {
    id: "opp_2",
    title: "Smart India Hackathon",
    org: "Ministry of Education",
    kind: "hackathon",
    description:
      "National 36-hour hackathon. Teams of six, problem statements published two weeks ahead.",
    deadline: "2026-09-12T23:59:00.000Z",
    requiredSkills: skills("python", "react"),
    skillsGained: skills("systemdesign"),
    difficulty: "intermediate",
    matchPct: 79,
    closesGapIds: ["systemdesign"],
    url: "#",
    saved: false,
    source: "MLH mirror",
  },
  {
    id: "opp_3",
    title: "PyTorch — good first issue",
    org: "PyTorch",
    kind: "oss",
    description:
      "Eleven open issues labelled good-first-issue, six of them in the Python frontend.",
    deadline: null,
    requiredSkills: skills("python", "git"),
    skillsGained: skills("pytorch"),
    difficulty: "intermediate",
    matchPct: 91,
    closesGapIds: [],
    url: "#",
    saved: true,
    source: "GitHub API",
  },
  {
    id: "opp_4",
    title: "Distributed Systems Lab — student researcher",
    org: "Dept. of Computer Science",
    kind: "research",
    description:
      "Two openings for undergraduates on consensus protocols under Prof. Iyer. One semester, credit-bearing.",
    deadline: "2026-09-20T23:59:00.000Z",
    requiredSkills: skills("distributed", "cpp"),
    skillsGained: skills("distributed", "systemdesign"),
    difficulty: "advanced",
    matchPct: 68,
    closesGapIds: ["systemdesign"],
    url: "#",
    saved: false,
    source: "Campus research portal",
  },
  {
    id: "opp_5",
    title: "Kubernetes fundamentals workshop",
    org: "Cloud Native Campus Chapter",
    kind: "workshop",
    description:
      "Two-evening hands-on workshop ending with a deployed multi-service app.",
    deadline: "2026-09-04T23:59:00.000Z",
    requiredSkills: skills("docker"),
    skillsGained: skills("kubernetes"),
    difficulty: "intro",
    matchPct: 73,
    closesGapIds: ["kubernetes"],
    url: "#",
    saved: false,
    source: "Campus events",
  },
  {
    id: "opp_6",
    title: "Kaggle — time series forecasting",
    org: "Kaggle",
    kind: "competition",
    description:
      "Featured competition with a three-month window. Strong fit for your scikit-learn work.",
    deadline: "2026-11-30T23:59:00.000Z",
    requiredSkills: skills("python", "sklearn"),
    skillsGained: skills("sklearn"),
    difficulty: "intermediate",
    matchPct: 66,
    closesGapIds: [],
    url: "#",
    saved: false,
    source: "Kaggle",
  },
];

/* ----------------------------------------------------------------- Peers -- */

export const DEMO_PEERS: PeerMatch[] = [
  {
    id: "peer_1",
    name: "Aarav Sharma",
    email: "aarav@campus.edu",
    initials: "AS",
    branch: "Electronics",
    year: 3,
    goalRole: "Robotics Engineer",
    matchPct: 88,
    sharedInterests: ["Robotics", "Machine learning"],
    complementarySkills: skills("embedded", "ros", "cpp"),
    youBring: skills("python", "pytorch"),
    lookingFor: "A hackathon team for Smart India Hackathon",
    why: "You both list robotics, but Aarav's embedded and ROS experience covers exactly the hardware half you don't have. Two of your four skill gaps are skills he already holds.",
    connection: "none",
  },
  {
    id: "peer_2",
    name: "Meera Raghavan",
    email: "meera@campus.edu",
    initials: "MR",
    branch: "Computer Science",
    year: 4,
    goalRole: "Computer Vision Engineer",
    matchPct: 84,
    sharedInterests: ["Machine learning", "Open source"],
    complementarySkills: skills("cv", "transformers", "docker"),
    youBring: skills("fastapi", "rest"),
    lookingFor: "A collaborator for a CVPR workshop submission",
    why: "Meera already holds Docker — your highest-impact gap — and needs the API layer you've built twice. She's a year ahead and has shipped a vision paper.",
    connection: "outgoing",
  },
  {
    id: "peer_3",
    name: "Dev Patel",
    email: "dev@campus.edu",
    initials: "DP",
    branch: "Computer Science",
    year: 3,
    goalRole: "Product Engineer",
    matchPct: 77,
    sharedInterests: ["Open source"],
    complementarySkills: skills("figma", "nextjs", "typescript"),
    youBring: skills("python", "sql"),
    lookingFor: "A backend partner for a campus product",
    why: "Dev covers design and frontend end-to-end, which is the half of a demo your projects currently lack.",
    connection: "connected",
  },
  {
    id: "peer_4",
    name: "Ishita Nair",
    email: "ishita@campus.edu",
    initials: "IN",
    branch: "Computer Science",
    year: 4,
    goalRole: "Platform Engineer",
    matchPct: 74,
    sharedInterests: ["Distributed systems"],
    complementarySkills: skills("kubernetes", "aws", "cicd"),
    youBring: skills("pytorch", "sklearn"),
    lookingFor: "Someone to co-run a Kubernetes reading group",
    why: "Ishita holds three of your four gaps. A reading group with her is the cheapest path through the infra cluster.",
    connection: "none",
  },
  {
    id: "peer_5",
    name: "Rohan Verma",
    email: "rohan@campus.edu",
    initials: "RV",
    branch: "Mathematics",
    year: 2,
    goalRole: "Research Scientist",
    matchPct: 71,
    sharedInterests: ["Machine learning"],
    complementarySkills: skills("spark", "sql"),
    youBring: skills("pytorch", "fastapi"),
    lookingFor: "A reading partner for probabilistic ML",
    why: "Rohan's maths depth complements your engineering side; he's looking for exactly the implementation partner you'd be.",
    connection: "none",
  },
  {
    id: "peer_6",
    name: "Sara Fernandes",
    email: "sara@campus.edu",
    initials: "SF",
    branch: "Electronics",
    year: 3,
    goalRole: "Hardware Engineer",
    matchPct: 69,
    sharedInterests: ["Robotics"],
    complementarySkills: skills("embedded", "cpp"),
    youBring: skills("python", "cv"),
    lookingFor: "A software partner for a drone build",
    why: "Sara fills the hardware slot that's still open on the robotics team you're forming.",
    connection: "none",
  },
];

/* -------------------------------------------------------------- Research -- */

export const DEMO_RESEARCH: ResearchMatch[] = [
  {
    matchPct: 86,
    viaInterests: ["Distributed systems"],
    why: "Your interest in distributed systems maps directly onto this group's consensus work, and two of their required skills overlap with quests already on your board.",
    project: {
      id: "rp_1",
      title: "Low-latency consensus for edge clusters",
      summary:
        "Reducing coordination overhead in Raft-style consensus when nodes are geographically split.",
      area: "Distributed systems",
      lead: {
        id: "res_1",
        name: "Prof. Anjali Iyer",
        initials: "AI",
        title: "Associate Professor",
        department: "Computer Science",
        areas: ["Distributed systems", "Consensus", "Edge computing"],
        openToStudents: true,
      },
      requiredSkills: skills("distributed", "cpp", "linux"),
      publications: [
        {
          id: "pub_1",
          title: "Coordination-light replication for intermittent links",
          venue: "SOSP",
          year: 2025,
          authors: ["A. Iyer", "R. Menon"],
          url: null,
        },
      ],
      openings: 2,
    },
  },
  {
    matchPct: 78,
    viaInterests: ["Machine learning", "Robotics"],
    why: "Combines both of your stated interests, and the group explicitly wants students with PyTorch experience.",
    project: {
      id: "rp_2",
      title: "Sim-to-real transfer for low-cost manipulators",
      summary:
        "Training grasping policies in simulation and closing the reality gap on sub-$500 arms.",
      area: "Robot learning",
      lead: {
        id: "res_2",
        name: "Dr. Vikram Bose",
        initials: "VB",
        title: "Assistant Professor",
        department: "Mechanical Engineering",
        areas: ["Robot learning", "Reinforcement learning"],
        openToStudents: true,
      },
      requiredSkills: skills("pytorch", "python", "ros"),
      publications: [
        {
          id: "pub_2",
          title: "Cheap arms, careful policies",
          venue: "CoRL",
          year: 2025,
          authors: ["V. Bose", "S. Kulkarni"],
          url: null,
        },
      ],
      openings: 1,
    },
  },
];

/* ----------------------------------------------------------------- Genie -- */

export const GENIE_SUGGESTIONS: GenieSuggestion[] = [
  {
    id: "gs_1",
    label: "What should I learn next?",
    question:
      "I want to become an AI/ML engineer. Based on companies that recruited here in previous years, what should I learn next?",
  },
  {
    id: "gs_2",
    label: "What if I learn Docker?",
    question:
      "What happens to my historical role alignment if I learn Docker first?",
  },
  {
    id: "gs_3",
    label: "Find me a team",
    question:
      "Find students interested in AI and robotics who are looking for a hackathon team.",
  },
  {
    id: "gs_4",
    label: "Research near my interests",
    question: "Are there any research projects related to distributed systems?",
  },
];

/** Canned Genie answer used until P2's `/api/genie/ask` stream is live. */
export const GENIE_DEMO_ANSWER =
  "Docker — it appears in 68% of the backend and ML-infra roles that recruited on this campus between 2022 and 2025, and it's the only gap blocking three of your current radar matches. Learning it moves your historical alignment from 62% to 74%, a bigger jump than system design (+9) or Kubernetes (+7). There's a quest on your board for it and a campus workshop on 4 September that would cover it in two evenings.";

export const GENIE_DEMO_TABLE = {
  columns: ["Skill", "Roles requiring", "Frequency", "Alignment gain"],
  rows: [
    ["Docker", "28 of 41", "68%", "+12"],
    ["System design", "23 of 41", "57%", "+9"],
    ["Kubernetes", "17 of 41", "41%", "+7"],
    ["MLOps", "16 of 41", "38%", "+6"],
  ] as (string | number | null)[][],
  truncated: false,
};

export const GENIE_DEMO_SQL = `SELECT s.name AS skill,
       COUNT(DISTINCT j.job_id) AS roles_requiring,
       ROUND(100.0 * COUNT(DISTINCT j.job_id) / t.total, 0) AS frequency_pct
FROM   job_required_skills r
JOIN   job_postings j USING (job_id)
JOIN   skill_graph  s USING (skill_id)
CROSS JOIN (SELECT COUNT(*) total FROM job_postings
            WHERE role_family = 'ml_engineer') t
WHERE  j.role_family = 'ml_engineer'
  AND  j.year BETWEEN 2022 AND 2025
  AND  s.skill_id NOT IN (SELECT skill_id FROM students_analytical
                          WHERE student_id = :student_id)
GROUP BY s.name, t.total
ORDER BY roles_requiring DESC;`;

/* ---------------------------------------------------------------- Ticker -- */

export const TICKER_ITEMS = [
  "Docker · 68% of surveyed backend roles",
  "System design · 57%",
  "Kubernetes · 41%",
  "MLOps · 38%",
  "12 opportunities matched",
  "3 closing this week",
  "6 complementary peers on campus",
  "Alignment 62% → 74% with Docker",
];
