# Executable Rules

Rules are JSONata expressions embedded in a schema's `_metadata.rules` block. Each rule is evaluated against applicable nodes at validation time and must return `true` to pass. Rules encode checks that JSON Schema structural validation cannot express — cross-node consistency, quantitative thresholds, and qualitative best practices.

For how rules fit into the broader schema metadata, see [docs/schemas.md](schemas.md).

## Rule Categories

Rules are grouped into three categories under `_metadata.rules`.

| Category | Purpose |
|---|---|
| `validation` | Structural correctness — a violation means the node is incorrect and should be fixed |
| `coherence` | Cross-node checks — for flagging conflicts or contradictions (often combined with `scope: 'global'` for multi-node/aggregate checks) |
| `bestPractice` | Advisory guidance — signals the space may benefit from additional work |

## Rule Object Structure

| Field | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier (kebab-case) |
| `description` | yes | Human-readable description of what the rule checks |
| `check` | yes | JSONata expression that must evaluate to `true` to pass |
| `type` | no | If set, only applies to nodes of this resolved type |
| `scope` | no | Set to `'global'` to evaluate the rule once against the full node set |

Rules without `scope: 'global'` are evaluated once per applicable node (all nodes, or only those matching `type`). A global rule is evaluated once and produces at most one violation for the space — use this for aggregate checks, like counts, across all nodes.

## JSONata Expression Context

Each expression is evaluated once per applicable node with the following input:

| Variable | Description |
|---|---|
| `nodes` | Array of all nodes in the space |
| `current` | The node being evaluated |
| `parent` | The resolved parent node — absent if no parent was resolved |

Nodes include all node properties (title, type, status, parent wikilink, etc.) plus two resolved fields: `resolvedType` (canonical type after alias resolution) and `resolvedParentTitle` (parent title after resolving any links).

Prefer `resolvedType` over `type` for type comparisons. When aliases are in use, `type` reflects the raw frontmatter value and may not match canonical names.

### Referencing `current` inside predicates

Inside a predicate (`nodes[...]`), bare names refer to fields on each item. Use `$$` (JSONata root) to reach outer-scope variables:

```jsonata
// Count solutions whose parent title matches the current node's title
$count(nodes[resolvedParentTitle=$$.current.title and resolvedType='solution'])
```

### `parent` vs `current.parent`

- `parent` — the resolved parent **node object**; absent if the parent was not found in the space
- `current.parent` — the raw wikilink string from frontmatter (e.g. `[[My Outcome]]`)

Use `$exists(parent)` to test whether the current node has a resolved parent:

```jsonata
$exists(parent) = false   // true for root nodes
```

## Examples

```json
{
  "coherence": [
    {
      "id": "active-outcome-count",
      "description": "Only one outcome should be active at a time",
      "scope": "global",
      "check": "$count(nodes[resolvedType='outcome' and status='active']) <= 1"
    },
    {
      "id": "active-opportunity-count",
      "description": "Only one target opportunity should be active at a time",
      "scope": "global",
      "check": "$count(nodes[resolvedType='opportunity' and status='active']) <= 1"
    }
  ],
  "bestPractice": [
    {
      "id": "solution-quantity",
      "description": "Explore multiple candidate solutions (aim for at least three) for the target opportunity",
      "type": "opportunity",
      "check": "$count(nodes[resolvedParentTitle=$$.current.title and resolvedType='solution']) >= 3"
    }
  ]
}
```

The coherence rules run against every node (no `type` filter) — each node in a space with two active outcomes will report a violation. The best-practice rule only runs against `opportunity` nodes, using `resolvedParentTitle` to count child solutions.