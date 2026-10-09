# MCP: <Project>

## Summary
- Owner: `<person/team>`
- Policy owner: `<who decides access>`
- Last reviewed: `<YYYY-MM-DD>`
- System role: tool and connector interface inventory for the project life cycle.
- Life cycle stage: `<development|utilization|support|retirement>`

## Stakeholder And Access Requirements
| Requirement | Source | Tool impact | Verification |
| --- | --- | --- | --- |
| `<access/current-state/safety requirement>` | `<person/policy>` | `<tool/scope>` | `<review/test/log>` |

## Canonical Remote Tools
| Name | Type | Purpose | Use when | Notes |
| --- | --- | --- | --- | --- |
| `<github>` | `<app/mcp/connector/plugin>` | `<repos/PR/issues>` | `<condition>` | `<limits>` |
| `<drive>` | `<app/mcp/connector/plugin>` | `<docs/files>` | `<condition>` | `<limits>` |

## Local Development Tools
| Name | Type | Purpose | Use when | Notes |
| --- | --- | --- | --- | --- |
| `<git>` | `<cli>` | `<version control>` | `<condition>` | `<limits>` |
| `<shell>` | `<cli/runtime>` | `<local inspection or execution>` | `<condition>` | `<limits>` |
| `<editor/patch tool>` | `<local tool>` | `<file edits>` | `<condition>` | `<limits>` |

## Selection Rules
- Use MCP for external data, current remote state, permissions, or remote artifacts.
- Prefer local files when they are sufficient.
- Prefer local development tools for repository inspection, editing, formatting, and local verification.
- If several tools apply, use the canonical source above.

## Access And Safety
- Accounts/scopes: `<account/scope: reason>`
- Forbidden: `<action>`, `<action requiring confirmation>`
- Secrets rule: `<no tokens/keys/private data in output>`
- Approval required for: destructive actions, publishing, sending messages, permission changes, deletion.

## Operating Flow
1. Read remote state before changing it.
2. Apply only approved changes.
3. Record durable results in `STATUS-LOG` or `PROJECT-RESUME`.
4. If unavailable, record blocker and fallback.

## Scenarios
| Scenario | Life cycle process | Tool | Input | Output | State update |
| --- | --- | --- | --- | --- | --- |
| `<scenario>` | `<process area>` | `<name>` | `<input>` | `<output>` | `<file>` |

## Verification
| Check | Method | Evidence | Status |
| --- | --- | --- | --- |
| `<tool works / access is appropriate / fallback exists>` | `<test/review>` | `<result>` | `<pass|fail|unknown>` |

## Constraints / Decisions
- Constraints: `<constraint>`, `<constraint>`
- Decisions: `<YYYY-MM-DD: decision: reason>`
