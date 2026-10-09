# Coolify MCP versioning

The canonical product version is [`../VERSION`](../VERSION). The same SemVer value, without the `v` prefix, must appear in `package.json`, both root package versions in `package-lock.json`, MCP server metadata in `src/index.ts`, and the default/example user agent.

Product release notes belong in [`../CHANGELOG.md`](../CHANGELOG.md). `StatusProject/VERSION` and `StatusProject/CHANGELOG.md` describe the installed StatusProject framework (currently v1.2.0); they are not Coolify MCP product versions and must not be changed by a product commit or release.

## Version rules

- Patch: compatible fixes and documentation corrections.
- Minor: compatible tool, profile, transport, or runtime features.
- Major: incompatible API, configuration, or runtime contract changes.
- Before 1.0, document compatibility restrictions explicitly.

## PM commit

`PM commit patch|minor|major|vX.Y.Z` updates the product version and changelog, verifies an explicit product-only scope, creates a detailed commit, and pushes the current branch. This project override resolves the generic production module's version paths to the product files above. It does not create a tag or GitHub Release.

Keep credentials, local audit output, installed framework changes, operational state, child repositories, and unrelated work outside the product commit. Preserve existing index and working-tree changes. Use Windows Git for mutations of the OneDrive working tree; metadata remains outside OneDrive.

## PM release

Require an already committed, pushed candidate with matching product metadata and changelog. Verify the intended SHA, branch, repository, checks, public scope, and existing tags/releases. `PM release` creates the annotated product tag and GitHub Release for that SHA; never overwrite an existing tag or release without explicit authorization. Record publication evidence in local project state.

## Acceptance limits

Isolated build and mock transport/API checks do not prove native Windows launcher acceptance, desktop reconnection, live preview logs, or production mutations. Record known gaps in the product changelog and release notes.
