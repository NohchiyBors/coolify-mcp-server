# INFRASTRUCTURE: <Project>

## Summary
- Owner: `<person/team>`
- Criticality: `<low|medium|high|critical>`
- Primary env: `<prod|staging|dev|local>`
- Env labels: `prod = production`, `staging = pre-production`, `dev = development`, `local = operator machine`
- Life cycle stage: `<development|production|utilization|support|retirement>`
- Service objective: `<availability/recovery/security objective>`

## Stakeholder And Service Requirements
| Requirement | Source | Applies to | Verification |
| --- | --- | --- | --- |
| `<uptime/RPO/RTO/security/access requirement>` | `<stakeholder/doc>` | `<env/component>` | `<check/evidence>` |

## Environment Status
| Env | Role | Status | Source of truth | Last verified | Notes |
| --- | --- | --- | --- | --- | --- |
| prod | `production` | `<up|degraded|down|unknown>` | `<host/service/doc>` | `<YYYY-MM-DD>` | `<live customer-facing env>` |
| staging | `pre-production` | `<up|degraded|down|unknown>` | `<host/service/doc>` | `<YYYY-MM-DD>` | `<release validation env>` |
| dev | `development` | `<up|degraded|down|unknown>` | `<host/service/doc>` | `<YYYY-MM-DD>` | `<team integration env>` |
| local | `operator machine` | `<ready|partial|blocked|unknown>` | `<host/service/doc>` | `<YYYY-MM-DD>` | `<single-user workstation env>` |

## Environments
| Env | URL | Provider/region | Runtime | DB/storage | Notes |
| --- | --- | --- | --- | --- | --- |
| prod | `<url>` | `<provider/region>` | `<runtime>` | `<db/storage>` | `<notes>` |
| staging | `<url>` | `<provider/region>` | `<runtime>` | `<db/storage>` | `<notes>` |
| dev | `<url>` | `<provider/region>` | `<runtime>` | `<db/storage>` | `<notes>` |
| local | `<command>` | `<tools>` | `<runtime>` | `<local deps>` | `<notes>` |

## Components
| Component | Role | Owner | Critical dependency |
| --- | --- | --- | --- |
| `<name>` | `<role>` | `<owner>` | `<dependency>` |

## Secrets And Access
- Storage: `<vault/provider/path>`
- Required: `<SECRET: purpose>`, `<SECRET: purpose>`
- Access rule: `<who/how>`
- Env rule: `local systems may load secrets from .env or .env.*; staging/prod should inject secrets as environment variables or managed secrets, not from committed files`

## Transition, Deploy And Ops
- Deploy: `<method/command>`
- Rollback: `<method>`
- Migrations: `<rule>`
- Healthcheck: `<url/command>`
- Logs/metrics/alerts: `<where>`
- Backups/restore: `<schedule/procedure/last test>`
- Transition criteria: `<what must be true before release/cutover>`
- Retirement criteria: `<how to decommission safely>`

## Commands
- Start: `<cmd>`
- Stop: `<cmd>`
- Restart: `<cmd>`
- Status/logs: `<cmd>`

## Verification And Validation
| Check | Method | Evidence | Frequency | Status |
| --- | --- | --- | --- | --- |
| `<health/security/backup/restore/performance>` | `<command/review/test>` | `<log/report>` | `<when>` | `<pass|fail|unknown>` |

## Risks / Do Not
- Risks: `<risk>`, `<risk>`
- Do not: `<restriction>`, `<restriction>`
