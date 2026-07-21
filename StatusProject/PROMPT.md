# Prompt: StatusProject

Canonical operating rules. All other root docs (`README.md`, `START-HERE.md`, `AGENTS.md`, `CLAUDE.md`, `AI-INSTRUCTION.md`, `AI-SETTINGS-INSTRUCTION.md`) are short pointers — do not duplicate rules into them. Links/paths live in `LINKS.md` and `StatusProject/SOURCE.md`.

## Enable When
One answer is not enough: multi-step or multi-session work, blockers/dependencies/critical files, imports, migrations, publication, integration, infrastructure, or support. Skip short one-off tasks.

## Layout
- Repo root: short `AGENTS.md` / `CLAUDE.md` (+ optional `GEMINI.md`, `COPILOT_INSTRUCTIONS.md`) and normal project files.
- `StatusProject/`: operating docs, `templates/`, state files. Do not put state files in repo root.
- Templates stay English. Update `StatusProject/` docs by default; replace root entries only when explicitly selected.

## Source Resolution
Installation and update details live in `INSTALL.md`.

Use this order to find StatusProject files:
1. Deployed project source: `StatusProject/SOURCE.md`.
2. Local source path recorded in `SOURCE.md`.
3. Maintainer local default source, when working on this machine: `D:\Data\OneDrive\source\StatusProject`.
4. Default global source: `%USERPROFILE%\.statusproject\source\StatusProject` on Windows, `~/.statusproject/source/StatusProject` on Linux/macOS.
5. GitHub latest release: `https://github.com/NohchiyBors/StatusProject/releases/latest`.

Templates are taken from `<source>/templates/` and deployed to `<repo>/StatusProject/templates/`. If a required state file is missing, create it from the matching template instead of silently continuing.

## Deployment Contract
In every enabled target project:
- Root gets only short AI entries: `AGENTS.md`, `CLAUDE.md`, optional `GEMINI.md`, `COPILOT_INSTRUCTIONS.md`.
- `StatusProject/` must contain operating docs, `templates/`, `SOURCE.md`, and active state files.
- Required state files: `TODO.md`, `MEMORY.md`, `PROJECT-RESUME.md`.
- Add `PLAN.md` for multi-phase work. Add `STATUS-LOG.md` for long/batch/repeated work. Add domain files only when the domain exists.

## Context Budget
1. Always: `PROJECT-RESUME` → `TODO` → `MEMORY`.
2. On demand: `PLAN` (multi-phase), `STATUS-LOG`/`STATE-HISTORY` (history needed), domain files when the task touches that domain.
3. Architecture floor: if the request touches structure, services, interfaces, deployment, runtime environments, access, or `dev`/`staging`/`prod`/`local` differences, read `ARCHITECTURE`, `INFRASTRUCTURE`, and `SOFTWARE` when present before planning or editing.
4. Skip unless directly relevant: `README`, `CHANGELOG`, `VERSIONING`, installer files, templates.
5. Use `LINKS.md` instead of opening many docs to find paths.

## State Files
Minimum when enabled: `TODO`, `MEMORY`, `PROJECT-RESUME`.

| Add | When |
| --- | --- |
| `PLAN` | multi-phase, parallel workstreams, strategy decisions |
| `STATUS-LOG` | long, batch, import, migration, sync, rollout |
| `STATE-HISTORY` | archive completed details out of active files |
| `REQUIREMENTS` | scope and acceptance need a durable source |
| `ARCHITECTURE` | components, interfaces, dependencies, data flows |
| `PROJECT-TREE` | repo/service/dependency tree |
| `INFRASTRUCTURE` | `prod`/`staging`/`dev`/`local` clarity (label every env) |
| `SOFTWARE` | entrypoints, modules, commands |
| `DEVELOPMENT-STATUS` | tree-based progress with % and blockers |
| `TESTING` | quality gates, critical scenarios, release checks |
| `MCP` | external tools/connectors |
| `IMPORT-SOP` | imports, migrations, syncs, bulk processing |
| `VERSIONING` | releases, tags, changelog, GitHub Release |
| `LINKS` | scattered repo/doc/service links |

## State Write Contract
When `StatusProject` is enabled, update state after every meaningful action:

| File | Record |
| --- | --- |
| `TODO` | current tasks, done items, blockers, next action |
| `MEMORY` | durable rules, decisions, constraints, source/update facts |
| `PROJECT-RESUME` | current phase/status, last result, next step, restart read order |
| `PLAN` | workstreams, priorities, do-not rules |
| `STATUS-LOG` | chronological evidence, command results, batch/import/release steps |
| `STATE-HISTORY` | completed phase details moved out of active files |
| `REQUIREMENTS` | scope, acceptance, priorities, non-goals |
| `ARCHITECTURE` | components, interfaces, dependencies, data flows |
| `PROJECT-TREE` | repository/service/dependency tree |
| `INFRASTRUCTURE` | `prod`/`staging`/`dev`/`local`, owners, access, deployment, backups |
| `SOFTWARE` | entrypoints, modules, commands, config, data, build/test/release |
| `DEVELOPMENT-STATUS` | progress tree, percentages, blockers, release readiness |
| `TESTING` | quality gates, scenarios, coverage gaps, release checks |
| `MCP` | canonical tool names, when to use, access, limits, fallback |
| `LINKS` | file/repo/service/update-source navigation |

Do not finish a substantial task with stale `TODO`, `MEMORY`, or `PROJECT-RESUME`.

## Session Start
1. Read in context-budget order. Identify goal, next step, blockers.
2. Check `StatusProject` updates at most once per 7 days per project; compare against `StatusProject/SOURCE.md`, then GitHub latest release if needed. Record the check date in `MEMORY` or `PROJECT-RESUME`.
3. If templates are newer, list affected files and propose an update. Never overwrite local state without approval. For existing deployments, use `update-statusproject.ps1` or `update-statusproject.sh`.

## Work Rules
- Update state files after meaningful progress; prefer concise deltas over rewrites.
- `TODO` ← current work; `MEMORY` ← durable rules/decisions; `PLAN` ← workstream changes; `PROJECT-RESUME` ← session checkpoint; `STATE-HISTORY` ← archived details.
- Cross-file triggers:
  - scope/acceptance change → `REQUIREMENTS` → `ARCHITECTURE`, `SOFTWARE`, `TODO`
  - architecture change → `ARCHITECTURE` → `SOFTWARE`, `TESTING`, `INFRASTRUCTURE`
  - env/deploy change → `INFRASTRUCTURE` → `TESTING`, `VERSIONING`
  - toolchain/connectors change → `MCP`
  - release flow change → `TESTING`, `VERSIONING`
- In `MCP`, record canonical name, when to use, access, constraints, fallback.
- For imports/migrations/syncs use `templates/IMPORT-SOP.template.md`. For releases use `VERSIONING.md`.

## Gitignore
When deploying, check or create `.gitignore` from `templates/GITIGNORE.template`. Never overwrite an existing file without review. Ignore: local state (`TODO*.md`, `MEMORY*.md`, ...), secrets (`.env`, `.env.*`, keys, `secrets/`, `private/`), logs/tmp, local tool state (`.claude/`, `.codex/`, `.cursor/`). Local systems may use `.env`/`.env.*`; staging/prod use environment variables or a secret manager. Commit only `.env.example`.

## Finish Check
Before responding: required state files exist in `StatusProject/`; `TODO` has the next step; `MEMORY` has new durable rules; `PROJECT-RESUME` can restart the work; `STATUS-LOG` is current for long processes.
