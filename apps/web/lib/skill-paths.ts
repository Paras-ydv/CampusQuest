import type { Quest, SkillCategory } from "@campusquest/shared";
import catalogue from "@/lib/data/skill-paths.generated.json";
import { goalRolesForSkill } from "@/lib/data/skill-roles";

/**
 * ===========================================================================
 *  SKILL PATHS
 * ===========================================================================
 * The three-level quest path behind every skill, from two sources.
 *
 *   roadmap  — steps derived from the committed roadmap.sh outline for that
 *              skill by `scripts/roadmap/build-skill-paths.mjs`. This is how a
 *              React path comes to list Hooks, State Management and Testing
 *              rather than "Build a small working React exercise", which is
 *              what every path used to say with the name swapped in.
 *
 *   authored — hand-written, deliverable-shaped steps. Kept where they exist
 *              because they are reviewed and each one names an artifact a
 *              verifier can look for; the roadmap version would be a topic
 *              checklist, which is weaker for exactly these skills. Also the
 *              only option for skills roadmap.sh does not publish: embedded
 *              systems, ROS and Azure.
 *
 * Authored wins on conflict. Everything else in the app — ranking, seeding,
 * the offline fallback — reads `skillPathDefinitions()`, so the two sources
 * are indistinguishable downstream apart from the `source` field the UI uses
 * to credit roadmap.sh.
 */

type PathSource = "roadmap" | "authored";

type PathDefinition = {
  name: string;
  category: SkillCategory;
  goals: string[];
  levels: [string[], string[], string[]];
  source: PathSource;
  /** Present on roadmap-derived paths, for attribution and the "broader match" note. */
  roadmap?: { slug: string; title: string; match: "exact" | "broader"; note: string | null; alsoCovers: string[] };
};

/* ------------------------------------------------------------- authored -- */

const authoredSkills: Record<string, PathDefinition> = {
  llmapps: detailed("LLM applications", "ml", ["Create a Python API project with pinned LLM dependencies", "Send a structured prompt and validate its response schema", "Store prompts in version-controlled templates", "Add environment-variable configuration and a .env.example", "Document safe local run instructions"], ["Build a multi-turn chat or extraction workflow", "Add prompt-injection and malformed-output handling", "Implement streaming or retry behaviour", "Write unit tests with a mocked model client", "Publish an architecture and cost trade-off note"], ["Ship a focused LLM product with a real user workflow", "Add structured logging without secrets", "Create a regression prompt suite", "Document privacy, limitations and failure modes", "Write a complete README with demo evidence", "Pass the GitHub Actions workflow"]),
  rag: detailed("Retrieval-augmented generation", "ml", ["Create a repository with a small licensed document corpus", "Chunk documents and persist metadata", "Generate embeddings through a configurable provider", "Implement top-k similarity retrieval", "Write a retrieval notebook or script with example queries"], ["Build an ingestion pipeline with duplicate handling", "Add citations from retrieved chunks to answers", "Compare chunking or retrieval configurations", "Create a small labelled retrieval evaluation set", "Document data provenance and retrieval quality"], ["Deliver an end-to-end cited question-answering application", "Add tests for ingestion, retrieval and citation formatting", "Measure answer faithfulness and retrieval quality", "Provide reproducible indexing and run commands", "Document security, privacy and known limitations", "Pass the GitHub Actions workflow"]),
  aievals: detailed("AI evaluation", "ml", ["Define a task-specific evaluation rubric", "Create a versioned JSONL evaluation dataset", "Implement deterministic scoring for at least one metric", "Run a baseline model against the dataset", "Write a baseline results summary"], ["Add judge-model or human-review evaluation with documented controls", "Compare two prompts or models", "Track pass rate, latency and cost", "Add regression thresholds for a critical metric", "Publish an evaluation report with error categories"], ["Build a repeatable evaluation harness for an AI feature", "Run it in CI with mocked or recorded fixtures", "Add a regression dashboard or machine-readable report", "Document evaluator bias and metric limitations", "Include reproduction instructions and result snapshots", "Pass the GitHub Actions workflow"]),
  mlops: detailed("MLOps", "ml", ["Create a training project with pinned dependencies", "Track parameters, metrics and model artifacts", "Separate configuration from training code", "Save a reproducible baseline model", "Document the training command and outputs"], ["Build a data-validation or model-validation step", "Add experiment comparison", "Containerise the training service", "Write tests for the training pipeline", "Document model versioning and rollback strategy"], ["Deliver a train-to-serve ML pipeline", "Add CI checks for tests and model validation", "Capture model metrics and lineage in artifacts", "Provide deployment and rollback instructions", "Write a model card with limitations", "Pass the GitHub Actions workflow"]),
  kubernetes: detailed("Kubernetes", "infra", ["Containerise a small web service", "Write Deployment and Service manifests", "Configure resource requests and limits", "Run the manifests on a local cluster", "Document cluster setup and verification commands"], ["Add ConfigMap and Secret references without committing secrets", "Configure readiness and liveness probes", "Deploy a rolling update", "Add a Helm chart or Kustomize overlay", "Write a troubleshooting runbook"], ["Deploy a production-style multi-service application", "Add namespace, RBAC and network-policy controls", "Add autoscaling and resource monitoring", "Test a failed rollout and rollback", "Document architecture and operational ownership", "Pass the GitHub Actions workflow"]),
  terraform: detailed("Terraform", "infra", ["Create a Terraform project with a pinned provider", "Declare variables, outputs and a remote-safe example tfvars file", "Provision a small cloud resource or local test resource", "Run terraform fmt and validate", "Document init, plan and destroy safety steps"], ["Split reusable infrastructure into modules", "Add environment-specific variable files", "Use a remote-state design without secrets in git", "Run terraform plan in CI", "Document change-review and state-locking practices"], ["Provision a complete application environment as code", "Add least-privilege IAM and network boundaries", "Add policy or static security checks", "Create a tested rollback/change procedure", "Publish architecture and cost assumptions", "Pass the GitHub Actions workflow"]),
  cicd: detailed("CI/CD", "infra", ["Create a GitHub Actions workflow", "Install dependencies deterministically", "Run linting or type checks", "Run the project test suite", "Document local and CI commands"], ["Add build artifacts or container-image creation", "Cache safe dependency paths", "Add pull-request checks", "Protect secrets through repository variables", "Document failure triage for the workflow"], ["Create a staged build-test-release pipeline", "Add dependency or security scanning", "Publish versioned artifacts", "Add a deployment approval or dry-run stage", "Document release and rollback procedures", "Pass the GitHub Actions workflow"]),
  observability: detailed("Observability", "infra", ["Instrument a service with structured logs", "Add request latency and error metrics", "Expose a health endpoint", "Create a local dashboard or metrics query", "Document telemetry fields and privacy choices"], ["Define service-level indicators and objectives", "Add distributed tracing across two operations", "Create an actionable alert rule", "Simulate an error and inspect telemetry", "Write an incident triage runbook"], ["Deliver an observable service with dashboards and alerts", "Test alert routing or a failure scenario", "Add error-budget or reliability reporting", "Document on-call ownership and escalation", "Write architecture and operational evidence", "Pass the GitHub Actions workflow"]),
  appsec: detailed("Application security", "practice", ["Create a small authenticated API or web application", "Validate request input at every public boundary", "Store credentials only in environment variables", "Add secure dependency configuration", "Write a threat-model note for the application"], ["Implement authorization checks for protected actions", "Add secure error handling and audit-friendly logs", "Run dependency and static security scans", "Add tests for an authorization or injection failure", "Document remediations using OWASP terminology"], ["Ship a hardened application with a security review", "Add automated dependency and code scanning", "Demonstrate remediation of a seeded vulnerability", "Document secrets, access control and incident response", "Write a security-focused README section", "Pass the GitHub Actions workflow"]),
  testautomation: detailed("Test automation", "practice", ["Create a testable sample application", "Write unit tests for core logic", "Add deterministic fixtures", "Measure or report test coverage", "Document how to run tests locally"], ["Add API or integration tests", "Add one browser or end-to-end test", "Mock external services reliably", "Test a known failure path", "Document the testing pyramid and trade-offs"], ["Deliver a tested application with quality gates", "Run unit, integration and end-to-end tests in CI", "Publish test reports or artifacts", "Add regression coverage for a real defect", "Write a quality and release checklist", "Pass the GitHub Actions workflow"]),
  dbt: detailed("dbt", "data", ["Create a dbt project connected to sample warehouse data", "Build staging and mart models", "Declare sources in YAML", "Add schema tests for key columns", "Document dbt build instructions"], ["Implement incremental or reusable models", "Add relationship and freshness tests", "Create model descriptions and lineage docs", "Add a seed or snapshot where appropriate", "Write a data-quality report"], ["Deliver an analytics project with governed marts", "Run dbt build and tests in CI", "Add exposures or downstream-consumer documentation", "Demonstrate a failed data-quality check", "Publish lineage and ownership guidance", "Pass the GitHub Actions workflow"]),
  dataviz: detailed("Data visualization", "data", ["Choose a public dataset and define an audience", "Clean data and document assumptions", "Create three appropriate charts", "Add labels, units and accessible colour choices", "Write a short findings summary"], ["Build an interactive dashboard or notebook", "Add filters and meaningful empty states", "Validate calculations against source data", "Add accessibility and mobile checks", "Write a stakeholder-oriented insight report"], ["Publish an end-to-end decision dashboard", "Add automated tests for transformations or calculations", "Document data refresh and governance", "Include a concise executive findings summary", "Write reproduction and accessibility guidance", "Pass the GitHub Actions workflow"]),

  /*
   * roadmap.sh publishes nothing for these three, so there is no outline to
   * derive from. Without them Embedded Engineer — a real family in the
   * warehouse — would have had no quest of its own at all.
   */
  embedded: detailed("Embedded systems", "systems",
    ["Set up a toolchain for a microcontroller board", "Blink an LED from bare-metal or HAL code", "Read a sensor over GPIO, I2C or SPI", "Handle an interrupt and debounce an input", "Document the wiring and the build/flash commands"],
    ["Drive a peripheral over UART, I2C or SPI with error handling", "Add a timer-driven task loop or an RTOS task", "Measure and reduce power draw or latency", "Add a serial or logic-analyser trace as evidence", "Document memory and timing constraints"],
    ["Build a complete embedded device with a real input and output", "Add watchdog handling and a safe failure state", "Add host-side tests for the protocol or parsing logic", "Document schematic, pinout and flashing procedure", "Write a README with photographs or a capture of it running", "Pass the GitHub Actions workflow"]),
  ros: detailed("ROS", "systems",
    ["Create a ROS 2 workspace and build a package", "Write a publisher and a subscriber node", "Define a custom message type", "Launch several nodes from one launch file", "Document the build and run commands"],
    ["Model a robot with URDF and visualise it in RViz", "Add a service or action for a task the robot performs", "Record and replay a bag file", "Tune a node with parameters and a config file", "Write a node test with launch_testing"],
    ["Build a robot behaviour that closes a sensing-acting loop", "Add navigation, perception or manipulation for the task", "Test it in simulation and record the result", "Document the node graph, topics and coordinate frames", "Write a README with a demonstration recording", "Pass the GitHub Actions workflow"]),
  azure: detailed("Azure", "infra",
    ["Create a resource group and deploy one service", "Configure authentication with a managed identity", "Store configuration in App Configuration or Key Vault", "Deploy from the CLI and record the commands", "Document the cost of what you deployed"],
    ["Define the environment as Bicep or ARM templates", "Add a virtual network and private endpoints", "Add monitoring through Azure Monitor and Log Analytics", "Deploy from a pipeline rather than a laptop", "Document the access model and role assignments"],
    ["Deploy a multi-service application across environments", "Add least-privilege RBAC and policy checks", "Add autoscaling and a tested backup or failover path", "Document architecture, cost and operational ownership", "Write a runbook covering deploy and rollback", "Pass the GitHub Actions workflow"]),
};

/* -------------------------------------------------------------- roadmap -- */

const roadmapSkills: Record<string, PathDefinition> = Object.fromEntries(
  catalogue.paths
    .filter((path) => !(path.skillId in authoredSkills))
    .map((path) => [
      path.skillId,
      {
        // The roadmap's name when it covers several skills, so a path is never
        // titled after one skill while teaching another.
        name: path.displayName ?? path.skillName,
        category: path.skillCategory as SkillCategory,
        goals: path.goalRoles,
        levels: path.levels.map((level) => level.steps) as [string[], string[], string[]],
        source: "roadmap" as const,
        roadmap: {
          slug: path.roadmapSlug,
          title: path.roadmapTitle,
          match: path.roadmapMatch as "exact" | "broader",
          note: path.roadmapNote,
          alsoCovers: path.alsoCovers,
        },
      },
    ]),
);

/** Every path in the catalogue, authored winning over roadmap-derived. */
export function skillPathDefinitions(): Record<string, PathDefinition> {
  const merged = { ...roadmapSkills, ...authoredSkills };
  return Object.fromEntries(
    Object.entries(merged).map(([id, definition]) => [
      id,
      {
        ...definition,
        /*
         * The union of the path skill's goals and those of every skill folded
         * into it. `os` owns the Computer Science roadmap, which also covers
         * `networks`; without networks' goals a cybersecurity student loses a
         * path that genuinely serves them.
         */
        goals: [
          ...new Set([
            ...goalRolesForSkill(id),
            ...(definition.roadmap?.alsoCovers ?? []).flatMap((covered) => goalRolesForSkill(covered)),
          ]),
        ],
      },
    ]),
  );
}

export const SKILL_PATH_GOALS: Record<string, string[]> = Object.fromEntries(
  Object.entries(skillPathDefinitions()).map(([id, definition]) => [id, definition.goals]),
);

const LEVEL_NAMES = ["Foundation", "Applied practice", "Portfolio capstone"] as const;

export function skillPathQuests(): Quest[] {
  return Object.entries(skillPathDefinitions()).flatMap(([id, definition]) =>
    definition.levels.map((labels, index) => {
      const level = index + 1;
      return {
        id: `q_${id}_l${level}`,
        title: `${definition.name}: ${LEVEL_NAMES[index]}`,
        summary: summaryFor(definition, index),
        category: "learn" as const,
        rarity: (level === 1 ? "common" : level === 2 ? "rare" : "legendary") as Quest["rarity"],
        xp: level === 1 ? 60 : level === 2 ? 100 : 160,
        // Only the capstone grants the skill: finishing one level of three is
        // not holding the skill, and alignment is computed from what is held.
        skillsGained: level === 3 ? [{ id, name: definition.name, category: definition.category }] : [],
        steps: labels.map((label, stepIndex) => ({
          id: `q_${id}_l${level}_s${stepIndex + 1}`,
          label,
          done: false,
          verification: (label.includes("GitHub Actions") ? "github_workflow" : "github_file") as "github_workflow" | "github_file",
          verifiedAt: null,
          verifiedCommit: null,
          verificationMessage: null,
        })),
        estimatedHours: level === 1 ? 4 : level === 2 ? 7 : 12,
        why: `${definition.name} is a tracked skill gap for ${definition.goals.slice(0, 3).join(", ")}.`,
        status: "available" as const,
        pathSkillId: id,
        pathLevel: level,
        prerequisiteQuestId: level === 1 ? null : `q_${id}_l${level - 1}`,
        repositoryUrl: null,
      };
    }),
  );
}

/**
 * Says where the steps came from. A student reading "Machine Learning covers
 * PyTorch" knows why a PyTorch path opens with linear algebra, instead of
 * assuming the app got it wrong.
 */
function summaryFor(definition: PathDefinition, index: number): string {
  const stage = ["Foundation", "applied", "capstone"][index];
  if (definition.source === "authored") {
    return `Verified ${["foundation", "applied practice", "portfolio capstone"][index]} milestone for ${definition.name}.`;
  }
  const { title, match, note } = definition.roadmap!;
  const scope = match === "broader" && note ? ` ${note}.` : "";
  return `${stage === "Foundation" ? "Opening" : stage === "applied" ? "Middle" : "Closing"} third of the ${roadmapName(title)} roadmap, built into one project.${scope}`;
}

/**
 * An authored path. Goals are deliberately not an argument: they come from
 * `skill-roles.ts` like every other path's, so the two cannot disagree. They
 * used to be repeated here, which is how test automation ended up not listed
 * against QA Engineer.
 */
function detailed(name: string, category: SkillCategory, foundation: string[], applied: string[], capstone: string[]): PathDefinition {
  return { name, category, goals: [], levels: [foundation, applied, capstone], source: "authored" };
}

/** "JavaScript Roadmap" → "JavaScript", so the sentence does not say it twice. */
function roadmapName(title: string): string {
  return title.replace(/\s+(Roadmap|Developer)$/i, "");
}
