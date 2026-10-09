# INSTALL: StatusProject

Canonical install/update guide. Operating rules live in `PROMPT.md`.

## Source
Resolve StatusProject source in this order:
1. `StatusProject/SOURCE.md` in the target project.
2. Recorded local source path from `SOURCE.md`.
3. Maintainer local default source, when working on this machine:
   - Windows: `D:\Data\OneDrive\source\StatusProject`
4. Default global source:
   - Windows: `%USERPROFILE%\.statusproject\source\StatusProject`
   - Linux/macOS: `~/.statusproject/source/StatusProject`
5. GitHub latest release: `https://github.com/NohchiyBors/StatusProject/releases/latest`

Templates are always taken from `<source>/templates/`.

## Target Layout
- Repository root: only short AI entry files for StatusProject:
  `AGENTS.md`, `CLAUDE.md`, optional `GEMINI.md`, `COPILOT_INSTRUCTIONS.md`.
- `StatusProject/`: operating docs, `templates/`, `SOURCE.md`, and all state files.
- Required enabled state: `TODO.md`, `MEMORY.md`, `PROJECT-RESUME.md`.

## Install
Windows:
```powershell
.\install-statusproject.ps1 -TargetPath <repo>
```

Linux/macOS:
```bash
./install-statusproject.sh <repo>
```

Installer behavior:
- creates `<repo>/StatusProject/`
- copies operating docs and `templates/`
- writes `StatusProject/SOURCE.md`
- asks before reusing/replacing an existing `StatusProject/`
- asks which root AI entry files to install/update
- does not replace existing root AI entry files unless explicitly selected

## First State
After install, create missing required state files inside `StatusProject/` from templates:
- `TODO.md` from `templates/TODO.template.md`
- `MEMORY.md` from `templates/MEMORY.template.md`
- `PROJECT-RESUME.md` from `templates/PROJECT-RESUME.template.md`

Add optional files only when needed:
- `PLAN.md` for multi-phase work
- `STATUS-LOG.md` for long/batch/release work
- domain files for their domains: `ARCHITECTURE`, `INFRASTRUCTURE`, `SOFTWARE`, `TESTING`, `MCP`, etc.

## Update
Windows:
```powershell
.\update-statusproject.ps1 -TargetPath <repo>
```

Linux/macOS:
```bash
./update-statusproject.sh <repo>
```

Updater behavior:
- updates shipped operating docs and `templates/`
- refreshes `StatusProject/SOURCE.md`
- creates backup under `StatusProject/.backup/update-YYYYMMDD-HHMMSS/`
- preserves local state files
- updates root AI entry files only by explicit selection

## Rules
- Check updates at most once per 7 days per target project.
- Record update-check date in `MEMORY.md` or `PROJECT-RESUME.md`.
- Never overwrite local state without approval.
- Never put StatusProject state files in repository root.
