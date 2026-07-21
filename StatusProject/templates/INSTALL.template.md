# INSTALL: <Project>

## Source
- Installed source: `StatusProject/SOURCE.md`
- Template folder: `<source>/templates/`
- Optional maintainer/local source: `<machine-specific-local-source-if-any>`
- Remote fallback: `<latest-release-url>`
- Update check frequency: at most once per 7 days

## Layout
- Repository root: short AI entry files only.
- `StatusProject/`: operating docs, `templates/`, `SOURCE.md`, and state files.
- Required state: `TODO.md`, `MEMORY.md`, `PROJECT-RESUME.md`.

## Install
Windows:
```powershell
.\install-statusproject.ps1 -TargetPath <repo>
```

Linux/macOS:
```bash
./install-statusproject.sh <repo>
```

## First State
- `TODO.md` from `templates/TODO.template.md`
- `MEMORY.md` from `templates/MEMORY.template.md`
- `PROJECT-RESUME.md` from `templates/PROJECT-RESUME.template.md`

## Update
Windows:
```powershell
.\update-statusproject.ps1 -TargetPath <repo>
```

Linux/macOS:
```bash
./update-statusproject.sh <repo>
```

## Safety
- Preserve local state files.
- Back up replaced files.
- Update root AI entry files only by explicit selection.
- Record update-check date in `MEMORY.md` or `PROJECT-RESUME.md`.
