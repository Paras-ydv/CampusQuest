# CampusQuest

Campus career and collaboration engine. Next.js + Supabase + Databricks Genie.

This repository includes P1's design system and application shell plus Person 3's
M1-M4 Supabase backend: schema and RLS, quests and XP, people and research
matching, and Realtime chat. P2 and P4 integrations remain optional, typed
adapters with deterministic development fallbacks.

<!--
motion layer, the app shell, and the hero screens — built against mock data
-->

```bash
npm install
npm run dev          # http://localhost:3000
```

With no Supabase environment variables, development uses the existing mock-auth
and deterministic API fallbacks. This is the quickest way to work on the UI.

To start and verify the local database stack (Docker required):

```bash
npx supabase start
npm run db:reset
npm run db:test
npm run db:types:check
npm test
npm run typecheck
npm run build
```

Local service addresses are reported by `npx supabase status`: the app normally
runs at `http://localhost:3000`, Supabase API at `http://localhost:54321`,
Postgres on port `54322`, and Studio at `http://localhost:54323`.

## Person 3 backend (M1–M4)

The shared database foundation lives in `supabase/`. Its repeatable seed provides
development data for the complete schema. To regenerate database types after a
migration change:

```bash
npm run db:types       # regenerate packages/db-types after a migration change
```

`npm run db:types:check` compares the checked-in output against your running
local database and fails if it is stale.

`supabase/migrations/20260831000100_person3_foundation.sql` owns the v1 schema,
including RLS for every app table, `vector(1024)` HNSW retrieval, an atomic
`complete_quest` RPC, direct-thread creation, and the `messages` Realtime
publication. The XP rule is fixed in SQL: `level = floor(xp / 350) + 1`.

Person 3 routes are:

- `GET /api/quests`, `GET /api/quests/next`, `POST /api/quests/:id/complete`
- `GET /api/people/matches`; `GET/POST /api/people/connection-requests`; `PATCH /api/people/connection-requests/:id`
- `GET /api/research/matches`
- `GET/POST /api/threads`; `GET/POST /api/threads/:id/messages`

`apps/web/lib/embeddings.ts` calls Databricks Model Serving when configured and
validates every 1024-dimensional response. Development/tests use a deterministic
local embedding only when Databricks credentials are absent; production fails
closed. People scoring and research percentages are always deterministic. P2's
Genie adapter may only provide a peer explanation and reorder the retrieved set.

P4 research integration expects a configured, validated
`catalogue.schema.table` denormalised project view. Until it is provisioned, the
same ranked seeded research data remains available. P2 skill-gap and profile-sync
webhooks are similarly optional adapters; quest completion is durable before a
webhook is attempted.

### Authentication and environment modes

Copy `.env.example` to `.env.local` only when configuring services. Keep all
server-only values out of browser code and never commit `.env.local`.

- **Mock mode:** Leave `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` unset. In development, the UI and Person 3
  routes use deterministic fallback data, so no Supabase session is required.
- **Live local Supabase mode:** Set the local URL, anon key, and service-role
  key reported by `npx supabase status`. People matching then uses pgvector and
  the service-role client; route requests also require a real Supabase Auth
  session.
- **Production:** Set the public Supabase URL/anon key, server-only service-role
  key, and Databricks/P2/P4 values as needed. The embeddings provider fails
  closed when its required configuration is absent.

`/sign-in` performs real Google OAuth when Supabase is configured, and falls
back to the demo path when it is not, so mock mode still needs no backend.

The flow is: `components/auth/google-sign-in.tsx` starts
`signInWithOAuth` → Google → `GET /auth/callback` exchanges the code for a
session → new users go to `/onboarding`, returning users to `/journey`.
`proxy.ts` (Next 16's renamed middleware) rotates the session cookie on every
request, which is what lets server components and route handlers only ever read
it. Signing out is `POST /auth/sign-out`; it is POST-only so a prefetch cannot
end a session.

To enable it locally, create a Google OAuth client whose authorised redirect URI
is `http://127.0.0.1:54321/auth/v1/callback`, set
`SUPABASE_AUTH_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_GOOGLE_SECRET`, flip
`[auth.external.google] enabled = true` in `supabase/config.toml`, and restart
`npx supabase start`.

`supabase/migrations/20260901120000_auth_profile_bootstrap.sql` creates the
`public.profiles` row on signup from the identity provider's name, email and
avatar. Onboarding still owns `branch`, `academic_year`, `goal_role` and
`interests` — an empty `goal_role` is how the callback route recognises a user
who has not onboarded yet.

`getCurrentProfile()` in `lib/auth/session.ts` still returns the demo fixture;
reading the real profile row belongs to `GET /api/profile`, which is not built
yet.

For Realtime chat, keep the `messages` table in the `supabase_realtime`
publication (the migration does this), enable Realtime in the Supabase project,
and use `subscribeToThread` from `lib/supabase/realtime.ts`. It subscribes to
`thread:<thread-id>`, tracks authenticated presence, deduplicates persisted
message IDs, and cleanly removes its channel.

### Person 2 Databricks and Genie

P2's deployable assets are in `databricks/`:

- `ddl/002_campus_dataset.sql` creates the fourteen dataset tables with the
  column comments Genie reads; `ddl/003_alignment_views.sql` adds the weighted
  alignment and gap views.
- `scripts/generate-campus-dataset.mjs` regenerates `databricks/seed/data/*.csv`
  deterministically (seed 31), and `scripts/load-campus-dataset.mjs` applies the
  DDL and loads them through the SQL warehouse — no cluster required.
  `seed/02_load_open_data.py` remains for importing governed P4 open data.
- `genie/` contains the Agent instructions, metric definitions, and example SQL.
  Create the Agent in Databricks, attach the listed Unity Catalog assets, then
  set `DATABRICKS_GENIE_SPACE_ID`.
- `etl/sync_profiles/` contains the nightly job definition. Create its Databricks
  Job, set `DATABRICKS_PROFILE_SYNC_JOB_ID`, and configure the `campusquest`
  secret scope with `supabase-url` and `supabase-service-role-key`.

The app's server-only P2 configuration is `DATABRICKS_HOST`,
`DATABRICKS_TOKEN`, `DATABRICKS_SQL_WAREHOUSE_ID`, `DATABRICKS_CATALOG`,
`DATABRICKS_SCHEMA`, and `DATABRICKS_GENIE_SPACE_ID`. Use an OAuth token or a
service-principal token with Genie access, `CAN USE` on the warehouse, and
`SELECT` on the Unity Catalog assets. The Time Machine sends fixed,
parameterized statements to the Warehouse; Genie is used only for narrative
answers and query explanations.

P3 completes a quest by writing a durable activity first, then optionally POSTs
to `PROFILE_SYNC_WEBHOOK_URL`. Point it at `/api/internal/profile-sync` and set
the same `PROFILE_SYNC_WEBHOOK_SECRET` in both environments. The route starts
the profile-sync job with the student ID; it never exposes Supabase service-role
or Databricks credentials to the browser.

To enable Genie-backed people narratives, set `P2_GENIE_RATIONALE_URL` to the
absolute `/api/genie/rationale` URL for the P2 service. The People Matchmaker
forwards the caller's session only to that configured service; if it is absent
or fails, the deterministic candidate order, scores, and template rationale are
kept unchanged.

Genie endpoints stream SSE frames in the P1 contract:

- `POST /api/genie/ask`
- `POST /api/genie/:id/follow-up`
- `POST /api/genie/rationale`
- `GET /api/timemachine/alignment`, `GET /api/timemachine/roles`, and
  `POST /api/timemachine/simulate`

When Databricks is not configured, development uses seeded, deterministic
answers. Production fails closed instead of making up analytical data.

Node 20+. The workspace uses npm workspaces; P4 layers Turborepo on top later.

---

## Layout

```
campusquest/
├── packages/shared/          # @campusquest/shared — zod API contracts (P1 owns)
│   └── src/schemas/          # profile, skill, quest, timemachine,
│                             # opportunity, people, research, genie
└── apps/web/                 # the Next.js app
    ├── app/
    │   ├── page.tsx          # landing
    │   ├── (auth)/           # sign-in, onboarding
    │   └── (app)/            # signed-in shell + journey dashboard
    ├── components/
    │   ├── motion/           # Reveal, WordRise, Odometer, Counter,
    │   │                     # Marquee, Magnetic, PageTransition
    │   ├── ui/               # Button, Chip, Label, Panel, Avatar, SegmentBar
    │   ├── app/              # dashboard + shell components
    │   ├── marketing/        # landing-only components
    │   └── onboarding/
    └── lib/
        ├── auth/session.ts   # ← auth seam
        ├── data/client.ts    # ← data seam
        ├── data/fixtures.ts  # demo dataset
        └── data/skills.ts    # skill taxonomy
```

---

## The two seams

Everything the UI knows about data and identity passes through exactly two
files. Replacing their bodies is the entire migration off mocks — no component
changes.

**`lib/data/client.ts`** — every screen reads through this and nothing else.
Each function is annotated with the endpoint it becomes and who owns it:

| Function | Becomes | Owner |
| --- | --- | --- |
| `getProfile` | `GET /api/profile` | P1 |
| `getAlignment` / `simulate` | `GET /api/timemachine/alignment`, `POST /api/timemachine/simulate` | P2 |
| `askGenie` | `POST /api/genie/ask` (SSE) | P2 |
| `getQuests` / `getNextQuest` / `completeQuest` | `GET /api/quests`, `/next`, `POST /api/quests/:id/complete` | P3 |
| `getPeers` | `GET /api/people/matches` | P3 |
| `getResearch` | `GET /api/research/matches` | P3 / P4 |
| `getOpportunities` | `GET /api/opportunities` | P4 |

**`lib/auth/session.ts`** — `getSession()` / `requireUser()`. The shape already
matches what Supabase Auth returns. Every route handler in the app should import
`requireUser` rather than reading the session itself, so there is one definition
of "signed in".

### The Genie contract is already real

`askGenie` is an async generator that yields exactly the `GenieStreamEvent`
frames `/api/genie/ask` will emit over SSE, in the same order
(`status → sql → table → delta… → done`). The chat panel is written against the
production contract — only the transport changes. **P2: emit these frames and
the UI works unmodified.**

---

## Design system — "Kinetic"

Bright, high-contrast, hard-edged editorial. Structure comes from 2px rules and
a strict grid; personality comes from motion, not ornament.

- **Square corners.** Radius is reserved for pills and avatars.
- **2px borders** in `--line`, which flips with the theme.
- **Uppercase mono labels**, wide tracking. Numbers are tabular.
- **Emphasis inverts** (ink ground, paper text) rather than tinting.
- **One accent** (`--hot`, vermilion) for emphasis, one secondary (`--volt`) for
  focus and interactive state.
- **Every colour is a token.** Nothing hard-coded in a component.

Tokens live in `app/globals.css` and are exposed to Tailwind via `@theme inline`,
so they stay dynamic across themes. Light is the primary identity; dark is fully
designed, not an inversion. Three theme states are handled: explicit light,
explicit dark, and system (the un-stamped default).

### Motion vocabulary

One easing curve — `cubic-bezier(0.16, 1, 0.3, 1)` — used everywhere, so the
whole app feels like one system.

| Primitive | Used for |
| --- | --- |
| `Reveal` | the default entrance for everything, with index stagger |
| `WordRise` | the one headline that matters per screen |
| `Odometer` | XP and level figures — columns roll from zero |
| `Counter` | stat tiles, where the odometer would be too loud |
| `Marquee` | the campus data ticker |
| `Magnetic` | primary actions only |
| `PageTransition` | route entrance, via `(app)/template.tsx` |

Every primitive respects `prefers-reduced-motion`.

---

## Screens

| Route | What it does |
| --- | --- |
| `/` | Landing page — hero, problem, the four-step journey, feature blocks |
| `/sign-in` | Mock Google sign-in (goes to onboarding) |
| `/onboarding` | 5-step profile builder with direction-aware transitions |
| `/journey` | Dashboard — level, XP, next quest, gaps, Genie, peers, radar |
| `/quests` | Quest board with status/category filters and the completion sequence |
| `/time-machine` | Constellation, what-if simulator, gap frequency, the roles behind the number |
| `/people` | Peer matches with search and interest filters |
| `/radar` | Opportunities with kind/difficulty/deadline filters and save toggles |
| `/research` | Research projects, leads, publications, open positions |

### Skill constellation

`components/app/skill-constellation.tsx`, used on the Time Machine. Solid ink
squares are skills you hold; dashed vermilion squares are the gaps. Edges
crossing between the two clusters are the ones worth closing. Hovering a node
isolates its edges; clicking a gap toggles it into the what-if simulator, so the
diagram and the alignment figure move together.

Layout is authored, not force-simulated — see `lib/data/skill-graph.ts`. The
graph is small, the composition matters, and a deterministic layout renders
identically every time. **P2: the edge list is the shape `skill_graph` should
return.**

### Interaction moments worth demoing

- `/quests` → **Complete quest** — steps tick off in sequence, XP rolls on the
  odometer, and a vermilion band sweeps in for the level-up.
- `/time-machine` → click a dashed square in the constellation, or a skill
  chip, and watch alignment re-roll with the newly unlocked roles.
- `/journey` → ask the Genie panel a question; it streams status, a result
  table, the prose answer, and discloses the SQL behind it.

## Notes

Everything behind `(app)` is `force-dynamic`: the pages are per-user and read
the clock for deadline countdowns, which would otherwise freeze at build time.
Card components take a server-supplied `nowIso` for the same reason — computing
"6 days left" independently during SSR and hydration can disagree across a
timezone or midnight boundary.

---

## Conventions

- Server components fetch; client components animate. `"use client"` only where
  motion or state actually needs it.
- No endpoint ships without its zod schema landing in `packages/shared` first.
- **XP, levels, alignment and gap figures come from SQL, never from an LLM.**
  Genie writes prose and rationale; if a number appears in the UI, a query
  produced it.
