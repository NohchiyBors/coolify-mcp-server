# Changelog

All notable changes to Coolify MCP are recorded here.

## Unreleased

No unreleased changes yet.

## v0.2.0 - 2026-10-09

### Added

- Native WSL launcher with Linux Node checks, Windows env-path conversion, and runtime staging outside synchronized drives.
- Explicit Docker Compose service creation with UTF-8 YAML encoded for the Coolify API; deployment remains opt-in.
- Runtime logs for application previews, databases, and service components; full-log selectors and timestamps.
- Optional external/local IP metadata in server profiles, preserving the configured API URL.
- HTTP transport access controls and dedicated stdio/HTTP, runtime, WSL, and API contract checks.

### Fixed

- Current-team API routes with a 404-only compatibility fallback for older Coolify.
- Legacy Compose application creation restricted to recognized Coolify 4.0 versions; current versions direct callers to service creation.
- Unsupported arbitrary container execution reports an explicit compatibility error and sends no API request.
- Recursive secret redaction and POST-only server validation behavior.

### Verification

- Isolated checks: 92 passed, 0 failed; stdio/HTTP expose 77 tool definitions, including compatibility placeholders.
- Read-only team compatibility verified against Coolify 4.0.0 and 4.3.23; application, database, and service log reads succeeded on 4.3.23.
- Production creation/deployment and a live PR preview were not exercised.

### Known limitations

- Native Windows launcher and desktop reconnection acceptance remain open.
- Preview logs require Coolify 4.3.23+; `lines=all` requires 4.3.20+.
- Known dependency findings remain unresolved, including critical proxy-addr/express entries; this release does not claim they are repaired.

License: MIT.
