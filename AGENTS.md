# AI Instruction: Compatibility Entry

Canonical operating rules: [`StatusProject/PROMPT.md`](StatusProject/PROMPT.md). Install/update guide: [`StatusProject/INSTALL.md`](StatusProject/INSTALL.md). Link tree: [`StatusProject/LINKS.md`](StatusProject/LINKS.md). Install source / update path: [`StatusProject/SOURCE.md`](StatusProject/SOURCE.md).

Do not duplicate rules. When configuring an AI tool, point it at `StatusProject/PROMPT.md` and `StatusProject/LINKS.md`; supply `StatusProject/SOURCE.md` so the agent can resolve the deployed install.

- Always respond in Russian.
- For substantial work, read `StatusProject/PROMPT.md`.
- Read `StatusProject/PROJECT-RESUME.md` -> `StatusProject/TODO.md` -> `StatusProject/MEMORY.md` first.
- If required state files are missing, create `StatusProject/TODO.md`, `StatusProject/MEMORY.md`, and `StatusProject/PROJECT-RESUME.md` inside `StatusProject/` from `StatusProject/templates/`.
- Resolve templates from `StatusProject/SOURCE.md`; fallback to maintainer local default `D:\Data\OneDrive\source\StatusProject` when on this machine, then the default global source, then GitHub latest release.
- Check StatusProject updates at most once per 7 days per project; record the check date in `StatusProject/MEMORY.md` or `StatusProject/PROJECT-RESUME.md`.
- After meaningful progress, update state before finishing.
- If the task touches architecture, services, deployment, environments, or dev/prod differences, also read `StatusProject/ARCHITECTURE.md`, `StatusProject/INFRASTRUCTURE.md`, and `StatusProject/SOFTWARE.md` when present before changing files.
