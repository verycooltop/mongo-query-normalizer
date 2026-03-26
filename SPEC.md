# Mongo Query Normalizer — Specification

Formal, behavior-oriented specification for **`mongo-query-normalizer`**: rule-driven, testable, and scoped to a **normalizer** (not a planner optimizer).

---

## 1. Purpose

1. Parse a MongoDB **query object** into an internal **AST**.
2. Apply **level-gated** normalization passes that default to **minimal risk**.
3. Compile back to a plain query object and attach **observable metadata**.

Semantic goal for modeled operators (see §7): for satisfiable queries,

```
match(query, doc) == match(normalized(query), doc)
```

When the engine proves **unsatisfiability** under modeled rules (at `predicate`+ levels), compilation may yield:

```
normalized(query) = IMPOSSIBLE_SELECTOR
```

Current `IMPOSSIBLE_SELECTOR` shape (implementation): `{ $expr: { $eq: [1, 0] } }`.

---

## 2. Public surface

The supported public API is **`normalizeQuery`**, **`resolveNormalizeOptions`**, and the exported **types** from the package entry. Internal modules (AST, parse, compile, rules, passes) are **not** semver-stable.

**Default:** `resolveNormalizeOptions()` sets `level: "shape"`.

---

## 3. Pipeline (fixed order)

For one `normalizeQuery` call:

```
parseQuery
→ normalizeShape
→ normalizePredicate   (only if level is predicate / logical / experimental)
→ simplify             (same gating as normalizePredicate)
→ detect in $or        (logical / experimental, when rule enabled)
→ hoist from $or       (experimental only, when rule enabled)
→ canonicalize
→ compileQuery
```

---

## 4. Bailout

If a **safety** check fails (depth, node growth, etc.), the implementation sets `meta.bailedOut` and **does not** use partially normalized AST for output:

- **`afterNode` for compile reverts to `beforeNode`** (the parse result for that invocation).

Thus callers can rely on: bailout ⇒ output query matches **parse-then-compile of the original** for that pass (modulo compile-only details), not a half-applied normalization.

---

## 5. AST model (summary)

- `LogicalNode` — `op`: `$and` | `$or`, `children[]`
- `FieldNode` — `field`, `predicates[]`
- `TrueNode` / `FalseNode`
- `OpaqueNode` — raw passthrough fragment

(Exact fields are implementation details; behavior is constrained by this spec and tests.)

---

## 6. Levels and rules

### 6.1 `shape` (default)

Structural normalization only (flatten / empty removal / single-child collapse / dedupe children / ordering as configured). **No** predicate merge, **no** contradiction collapse to `FalseNode`.

### 6.2 `predicate`

All `shape` rules plus predicate-oriented rules: dedupe same-field predicates, merge comparable predicates where modeled, collapse contradictions.

**Special case:** In `normalizePredicate`, direct sibling `FieldNode`s with the **same field name** under `$and` may be **merged** before further predicate normalization, so contradictions such as `{ $and: [{ a: 1 }, { a: 2 }] }` can be detected.

### 6.3 `logical`

`predicate` plus **detection** of common predicates in `$or` (on when rule enabled). **Detection does not imply hoisting** by default.

### 6.4 `experimental`

May enable **hoist common predicates from `$or`** when the rule is on. Not intended for unrestricted production defaults.

---

## 7. Modeled vs opaque operators

**Modeled** (for merge / contradiction paths): at minimum `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`, `$exists` where implemented.

**Opaque / limited support** (passthrough or partial handling; no full semantic rewrite): notably **`$nor`**, **`$regex`**, **`$elemMatch`**, **`$expr`**, **`$not`**, geo/text, and unknown `$` operators.

---

## 8. Compile strategy

- `TrueNode` → `{}`
- `FalseNode` → `IMPOSSIBLE_SELECTOR`
- `OpaqueNode` → raw passthrough per implementation
- `FieldNode` / `LogicalNode` → BSON-shaped query object

---

## 9. Non-goals

- Not a MongoDB **planner** or index optimizer.  
- Not full coverage of every MongoDB operator.  
- Not aggressive logical hoisting **by default**.  

---

## 10. Invariants (when no bailout)

- **Semantic preservation** for modeled operators on satisfiable queries (see §1).  
- **Idempotency:** `normalizeQuery(normalizeQuery(q, opts).query, opts)` should match `normalizeQuery(q, opts)` on supported inputs.  
- **Input immutability:** the library must not mutate the caller’s input object.  

---

## 11. Testing

Tests should cover: default `shape` level, explicit `predicate` / `logical` / `experimental` behavior, `meta` fields, bailout fallback, and basic idempotency. Differential tests against a real MongoDB deployment are optional but valuable for regression suites.
