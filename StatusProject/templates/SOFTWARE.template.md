# SOFTWARE: <App>

## Summary
- Users: `<who>`
- Goal: `<main job>`
- Repo: `<path/url>`
- System of interest: `<app/service/tool>`
- Life cycle stage: `<concept|development|production|utilization|support|retirement>`

## Stakeholder And System Requirements
| Requirement | Source | Priority | Acceptance / verification |
| --- | --- | --- | --- |
| `<REQ-ID or summary>` | `<user/doc/regulation>` | `<high|medium|low>` | `<test/review/demo/analysis>` |

## Stack
- Language/framework: `<lang/version> / <framework>`
- Runtime/package manager: `<runtime> / <pm>`
- DB/storage: `<if any>`

## Entrypoints
- App/API/CLI/UI: `<file|command|route>`

## Modules
| Module | Responsibility | Important files |
| --- | --- | --- |
| `<name>` | `<responsibility>` | `<paths>` |

## Flows
- `<user/system flow>`
- `<user/system flow>`

## Data And Contracts
- Models: `<models/tables/entities>`
- External APIs: `<services>`
- Formats: `<JSON/CSV/XLSX/XML/etc>`
- Compatibility: `<what must not break>`

## Integration And Interfaces
| Interface | Producer | Consumer | Contract | Failure handling |
| --- | --- | --- | --- | --- |
| `<API/event/file/CLI>` | `<module/service>` | `<module/service/user>` | `<schema/protocol>` | `<fallback/error handling>` |

## Config
- Env: `<ENV: purpose>`, `<ENV: purpose>`
- Files: `<file: purpose>`
- Rule: `local systems may use .env or .env.*; staging/prod should use platform environment variables or secret manager; commit only .env.example`

## Commands
- Install: `<cmd>`
- Dev/prod: `<cmd>` / `<cmd>`
- Test/lint/build: `<cmd>` / `<cmd>` / `<cmd>`

## Verification And Validation
| Concern | Method | Command / evidence | Status |
| --- | --- | --- | --- |
| `<requirement/risk/interface>` | `<test/review/demo/analysis>` | `<cmd/file/log>` | `<pass|fail|unknown>` |

## Transition, Release And Support
- Method/versioning: `<method>` / `<rule>`
- Changelog: `<file/location>`
- Rollback: `<rule>`
- Operational handoff: `<docs/runbook/support owner>`
- Maintenance rule: `<bugfix/update/dependency policy>`

## Constraints / Do Not
- Constraints: `<constraint>`, `<constraint>`
- Do not: `<restriction>`, `<restriction>`
