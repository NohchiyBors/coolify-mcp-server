# ARCHITECTURE: <System>

## Summary
- Scope: `<system/product/bounded context>`
- Owner: `<person/team>`
- Primary goal: `<what this architecture must enable>`
- Life cycle stage: `<concept|development|production|utilization|support|retirement>`
- Architecture baseline: `<draft|approved|implemented|retired>`

## Stakeholder Needs And Drivers
| Stakeholder | Need / driver | Architecture implication |
| --- | --- | --- |
| `<person/team/system>` | `<need>` | `<implication>` |

## System Requirements Trace
| Requirement | Source | Architecture element | Verification method |
| --- | --- | --- | --- |
| `<REQ-ID or summary>` | `<stakeholder/source>` | `<component/interface/decision>` | `<review/test/demo/analysis>` |

## System Context
| Actor/System | Role | Interface | Notes |
| --- | --- | --- | --- |
| `<user/service>` | `<why it interacts>` | `<UI/API/queue/file/etc>` | `<notes>` |

## Components
| Component | Responsibility | Inputs | Outputs | Important files/services |
| --- | --- | --- | --- | --- |
| `<name>` | `<what it owns>` | `<inputs>` | `<outputs>` | `<paths/services>` |

## Interfaces And Contracts
| Interface | Producer | Consumer | Contract | Compatibility rule |
| --- | --- | --- | --- | --- |
| `<API/event/file/schema>` | `<component>` | `<component>` | `<shape/protocol>` | `<what must not break>` |

## Integration Strategy
| Integration point | Preconditions | Integration method | Failure handling |
| --- | --- | --- | --- |
| `<component/interface>` | `<preconditions>` | `<manual/automated/deploy step>` | `<fallback>` |

## Data Flows
- `<source> -> <step> -> <destination>`
- `<source> -> <step> -> <destination>`

## Dependencies
| Dependency | Type | Used by | Failure impact | Notes |
| --- | --- | --- | --- | --- |
| `<service/lib/db>` | `<internal/external>` | `<component>` | `<impact>` | `<notes>` |

## Deployment Mapping
- `prod`: `<what runs where>`
- `staging`: `<what runs where>`
- `dev/local`: `<what runs where>`

## Verification And Validation
| Concern | Method | Evidence | Status |
| --- | --- | --- | --- |
| `<requirement/risk/interface>` | `<review/test/demo/analysis>` | `<file/log/result>` | `<pass|partial|fail|unknown>` |

## Decisions And Constraints
- Decisions: `<YYYY-MM-DD: decision: reason>`
- Constraints: `<constraint>`, `<constraint>`
- Do not: `<restriction>`, `<restriction>`
