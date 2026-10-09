# PROJECT-TREE: <Project>

## Summary
- Scope: `<repo/system/product>`
- Owner: `<person/team>`
- Last updated: `<YYYY-MM-DD>`

## Repository Tree
```text
<repo-root>/
├── <app-or-service>/
│   ├── <src-or-app>/
│   └── <tests-or-config>/
├── <shared-or-lib>/
└── <ops-or-docs>/
```

## Services Tree
```text
<system>
├── <frontend/service>
│   └── <depends on>
├── <backend/service>
│   ├── <depends on>
│   └── <depends on>
└── <external system>
```

## Nodes
| Node | Type | Responsibility | Owner | Interfaces/dependencies |
| --- | --- | --- | --- | --- |
| `<path or service>` | `<app/service/lib/db/queue/doc>` | `<what it owns>` | `<owner>` | `<key interfaces>` |

## Important Paths
- `<path>` — `<why it matters>`
- `<path>` — `<why it matters>`

## External Systems
| System | Purpose | Interface | Environment note |
| --- | --- | --- | --- |
| `<service/vendor/system>` | `<purpose>` | `<API/DB/queue/file>` | `<prod/dev note>` |
