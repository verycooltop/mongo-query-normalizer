# Mongo Query Rewriter Specification

Formal specification for `mongo-query-rewriter`: move from “implementation-driven” behavior to **rule-driven + verifiable** behavior. The content is kept executable and testable.

---

## 1. Overview

Goals of `mongo-query-rewriter`:

1. Convert a MongoDB selector into an **AST**
2. Perform **semantics-preserving rewrites** on the AST
3. Output a **canonical selector**

Rewriting must satisfy:

```
match(query, doc) == match(rewrite(query), doc)
```

Unless the **query is unsatisfiable**, in which case:

```
rewrite(query) = IMPOSSIBLE_SELECTOR
```

---

## 2. Core Concepts

### 2.1 Selector

A selector is defined as:

```
Selector = Document → Boolean
```

For example, `{ a: { $gt: 5 } }` is equivalent to `doc => doc.a > 5`.

### 2.2 Impossible Selector

The system’s only “impossible selector” is:

```
IMPOSSIBLE_SELECTOR = { _id: { $exists: false } }
```

Requirement: for all documents `doc`, `match(IMPOSSIBLE_SELECTOR, doc) = false`.

---

## 3. Pipeline

Rewrite pipeline:

```
rewrite(query):
  parse
  → normalize
  → predicateMerge
  → simplify
  → canonicalize
  → compile
```

Each step must preserve semantics: `match(step_i(query)) == match(query)`, except when `simplify` produces a `FalseNode`.

---

## 4. AST Specification

AST node types: `Node = LogicalNode | FieldNode | TrueNode | FalseNode`.

### 4.1 LogicalNode

- `type: "logical"`
- `op: "$and" | "$or" | "$nor"`
- `children: Node[]`
- Constraint: `children.length ≥ 0`

### 4.2 FieldNode

- `type: "field"`
- `field: string`
- `conditions: Condition[]`
- Constraint: `conditions.length ≥ 1`; otherwise it degenerates to `TrueNode`.

### 4.3 TrueNode

- `type: "true"`
- Semantics: `match(TrueNode, doc) = true`

### 4.4 FalseNode

- `type: "false"`
- Semantics: `match(FalseNode, doc) = false`

---

## 5. Condition Model

`Condition = { op: Operator, value: any }`.

### 5.1 Supported Operators

`$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`, `$exists`.

### 5.2 Opaque / Fallback Operators

The following operators are **not modeled semantically** at the moment: `$regex`, `$elemMatch`, `$size`, `$type`, `$mod`, and any other unknown `$`-prefixed operator.

Current implementation conventions:

- **parse**:
    - Known `$regex` is modeled as a dedicated `RegexCondition`;
    - Any other `$` operator that is not explicitly supported is **downgraded to a literal wrapped by `$eq`**, for example:

      ```js
      { a: { $elemMatch: { x: 1 } } }
      // ↓ treated after parse as
      { field: "a", conditions: [{ op: "$eq", value: { $elemMatch: { x: 1 } } }] }
      ```

- **simplify / conflict / tighten**:
    - Tightening and conflict detection are only performed for the modeled operator set (`$eq/$ne/$gt/$gte/$lt/$lte/$in/$nin/$exists`);
    - The fallback conditions above are treated as normal `$eq` literals, with no additional inference.

- **compile**:
    - `RegexCondition` is compiled back to `{ field: { $regex: ... } }`;
    - Other fallback conditions are emitted as-is as literal values.

> If we later decide to semantically model `$elemMatch` / `$size` / `$type` / `$mod`, we must:
> 1) extend the `FieldCondition` types; 2) implement semantics in parse / simplify / conflicts / canonicalize / compile; 3) remove the “downgrade to `$eq` literal wrapper” logic and tests for those operators.

---

## 6. Normalization Rules

### 6.1 AND Flatten

`$and([a, $and([b,c])])` → `$and([a,b,c])`.

### 6.2 Empty Logic

- `$and([])` → true
- `$or([])` → false
- `$nor([])` → true

### 6.3 Single Child

- `$and([x])` → x
- `$or([x])` → x

---

## 7. Predicate Merge

Only performed under `$and`: **same field → merge**.

Example: `$and([{a: {$gt:5}}, {a: {$lt:10}}])` → `a: {$gt:5, $lt:10}`.

---

## 8. Conflict Detection

Conflict definition: for all documents `doc`, `match(selector, doc) = false`.

- **8.1 Equality**: `$eq:5` conflicts with `$eq:6`.
- **8.2 Range**: `$gt:10` conflicts with `$lt:5`.
- **8.3 Exists**: `$exists:false` conflicts with `$eq:5`.
- **8.4 IN**: `$in:[1,2]` conflicts with `$in:[3]`.
- **8.5 EQ vs NIN**: `$eq:5` conflicts with `$nin:[5]`.

---

## 9. Simplification Rules

Simplification includes: **tighten**, **prune**, **conflict detect**.

- **9.1 AND**: `$and([... true ...])` → remove `true`; `$and([... false ...])` → `false`.
- **9.2 OR**: `$or([... true ...])` → `true`; `$or([... false ...])` → remove `false`.
- **9.3 NOR**: `$nor([true])` → `false`; `$nor([false])` → `true`.

---

## 10. Tightening

Parent constraints can tighten child constraints. Example: parent `a > 5`, child `a > 1` → child becomes `a > 5`.

---

## 11. Canonical Form

### 11.1 AND Node Ordering

Field nodes first, then logical nodes.

### 11.2 FieldNode Order

Sort by `indexSpecs`; if no index is available, sort alphabetically.

### 11.3 Unique FieldNode

One field corresponds to one `FieldNode`.

### 11.4 Condition Ordering

Condition ordering: `$eq` → `$gt` → `$gte` → `$lt` → `$lte` → `$in` → `$nin` → `$exists` → `$ne`.

---

## 12. Compile Rules

- **12.1 Equality Shortcut**: `{a: {$eq:5}}` → `{a: 5}`.
- **12.2 Logical**: preserve `$and` / `$or` / `$nor` structure.
- **12.3 TrueNode** → `{}`.
- **12.4 FalseNode** → `IMPOSSIBLE_SELECTOR`.

---

## 13. Invariants

- **13.1 Semantic Preservation**: `match(query, doc) == match(rewrite(query), doc)`.
- **13.2 Idempotency**: `rewrite(rewrite(q)) == rewrite(q)`.
- **13.3 Canonical Stability**: `canonicalize(rewrite(q)) == rewrite(q)`.
- **13.4 Structural Safety**: optimization must not **mutate the input query**.

---

## 14. Complexity Guarantees

- Optimization complexity: **O(N log N)**, where N is the AST node count.
- Maximum supported: depth ≤ 1000, nodes ≤ 10000.

---

## 15. Unsupported Behavior

No optimization is guaranteed for: `$geo`, `$text`, `$where`, `$jsonSchema`. These operators are treated as **opaque**.

---

## 16. Testing Requirements

- **Unit**: parse, normalize, merge, conflicts, simplify, canonicalize, compile.
- **Property**: 1000+ random selectors, validate semantic preservation.
- **Fuzz**: 10000 selectors, validate no crash and idempotency.
- **Differential**: use MongoDB to validate `find(query) == find(rewrite(query))`.

### 16.1 Operator Coverage Matrix

Each operator’s support per stage must be covered by tests:

| Operator       | parse                           | merge | conflict     | simplify     | compile            |
| -------------- | ------------------------------- | ----- | ------------ | ------------ | ------------------ |
| `$eq`          | ✓                               | ✓     | ✓            | ✓            | ✓                  |
| `$ne`          | ✓                               | ✓     | ✓            | ✓            | ✓                  |
| `$gt`          | ✓                               | ✓     | ✓            | ✓            | ✓                  |
| `$gte`         | ✓                               | ✓     | ✓            | ✓            | ✓                  |
| `$lt`          | ✓                               | ✓     | ✓            | ✓            | ✓                  |
| `$lte`         | ✓                               | ✓     | ✓            | ✓            | ✓                  |
| `$in`          | ✓                               | ✓     | ✓            | ✓            | ✓                  |
| `$nin`         | ✓                               | ✓     | ✓            | ✓            | ✓                  |
| `$exists`      | ✓                               | ✓     | ✓            | ✓            | ✓                  |
| `$regex`       | ✓ (dedicated condition type)    | -     | -            | -            | ✓ (emitted as-is)  |
| other `$op`    | ✓ (downgrade to `$eq` literal)  | -     | (as `$eq`)   | (as `$eq`)   | ✓ (literal output) |

> Note: this matrix reflects the **current implementation**, not the final goal. If we later add semantic modeling for `$elemMatch` / `$size` / `$type`, we should split them out from the “other `$op`” row and maintain them as formally supported operators.

Requirement:

> Each `✓` must be covered by at least one unit test or end-to-end test.

### 16.2 AST Invariants

The AST layer must satisfy the following invariants (validated by tests such as `ast.test.js`):

- LogicalNode:
  - When `type === "logical"`, `children` must be an array and each element must be a `SelectorAST`.
- FieldNode:
  - `conditions.length > 0`; if optimization produces empty `conditions`, the simplify stage must convert it to `TrueNode` or prune it.
- Visitor:
  - `visit(node, fn)` returns a **new object** for logical nodes (structure preserved) and must not mutate the input node;
  - for non-logical nodes, it **does not recurse** into children.

### 16.3 Test Architecture (Suggested)

Suggested test layout:

1. `parse.test.js`: AST modeling and parse invariants.
2. `normalize.test.js`: structure-preserving transforms (no predicate semantics).
3. `predicate-merge.test.js`: same-field condition merging.
4. `conflicts.test.js`: full matrix for conflict/unsatisfiable detection.
5. `simplify.test.js`: tighten + prune + context propagation.
6. `canonicalize.test.js`: canonical ordering and idempotency.
7. `compile.test.js`: semantic preservation for AST → selector.
8. `rewrite.test.js` / `roundtrip.test.js`: end-to-end + global invariants (§13).
9. `robustness.test.js` / `invariants.test.js`: stack-safety, input immutability, extreme cases.

---

## 17. Future Extensions

Planned support: `$elemMatch`, `$size`, `$type`, `$all`, `$not`. After adding support, update parse, merge, conflict, simplify, compile, and tests accordingly.