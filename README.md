# Mongo Query Normalizer

**English** | [中文](README.zh-CN.md)

An **observable, level-based** normalizer for MongoDB query objects. It stabilizes query **shape** at the conservative default, offers **preview** higher levels for analysis and experiments, and returns **predictable** output plus **metadata**—not a MongoDB planner optimizer.

> **v0.1.0 — production scope:** For **general production** traffic, use **`shape` only**—it is the **sole** level we recommend for that role in this release. **`predicate`**, **`logical`**, and **`experimental`** are **preview / experimental** surfaces; they fit **offline analysis**, **replay testing**, **semantic validation**, and **targeted experiments** better than a blanket default for all online requests.

---

## Why it exists

- Query **shape** diverges across builders and hand-written filters.
- Outputs can be **hard to compare**, log, or diff without a stable pass.
- You need a **low-risk normalization layer** that defaults to conservative behavior.

This library does **not** promise to make queries faster or to pick optimal indexes.

---

## Features

- **Level-based** normalization (`shape` → `predicate` → `logical` → `experimental`)
- **Conservative default**: `shape` only out of the box (the **only** level we recommend for general production in v0.1.0)
- **Observable** `meta`: changed flags, applied/skipped rules, warnings, hashes, optional stats
- **Stable / idempotent** output when rules apply (same options)
- **Opaque fallback** for unsupported operators (passthrough, not semantically rewritten)

---

## Install

```bash
npm install mongo-query-normalizer
```

---

## Quick start

```ts
import { normalizeQuery } from "mongo-query-normalizer";

const result = normalizeQuery({
    $and: [{ status: "open" }, { $and: [{ priority: { $gte: 1 } }] }],
});

console.log(result.query);
console.log(result.meta);
```

---

## Default behavior

- **Default `level` is `"shape"`** (see `resolveNormalizeOptions()`).
- By default there is **no** aggressive predicate merge or logical hoisting.
- The goal is **stability and observability**, not “smart optimization.”

---

## Production guidance (v0.1.0)

- Use **`shape`** for **general production** traffic. It is the **only** level recommended for that purpose in v0.1.0.
- Levels above `shape` (`predicate`, `logical`, `experimental`) are **preview / unstable** surfaces. Use them for **offline analysis**, **replay testing**, and **targeted experiments** when you explicitly accept preview semantics—not as a default for all online requests.
- If you opt into a non-`shape` level, **`meta.warnings` includes a boundary notice** for that call. In **non-production** runs (`NODE_ENV !== "production"`), the library also prints a **matching `console.warn` once per level per process** so local development surfaces the same guidance without spamming repeated logs.

---

## Levels

### `shape` (default)

**Recommended for production hot paths** (the only v0.1.0 level recommended for general production). Safe structural normalization only, for example:

- flatten logical nodes  
- remove empty logical nodes  
- collapse single-child logical nodes  
- dedupe logical children  
- canonical ordering  

### `predicate`

**Preview / not recommended for general production** in v0.1.0. On top of `shape`, conservative **predicate** cleanup:

- dedupe same-field predicates  
- merge comparable predicates where modeled  
- collapse clear contradictions to an unsatisfiable filter  
- merge **direct** `$and` children that share the same field name before further predicate work (so contradictions like `{ $and: [{ a: 1 }, { a: 2 }] }` can be detected)

### `logical`

**Preview / not recommended for general production** in v0.1.0. On top of `predicate`:

- **detect** common predicates inside `$or` (detection / metadata; **no** default hoisting)

### `experimental`

**Preview / not recommended for general production** in v0.1.0. May **hoist** common predicates from `$or` when the corresponding rule is enabled—**not** for blanket production rollout.

---

## `meta` fields

| Field | Meaning |
|--------|---------|
| `changed` | Structural/predicate output differs from input (hash-based) |
| `level` | Resolved normalization level |
| `appliedRules` / `skippedRules` | Rule tracing |
| `warnings` | Non-fatal issues when observation is enabled, plus a **v0.1.0 boundary warning** whenever the resolved level is not `shape` (always present for that case, independent of `observe.collectWarnings`) |
| `bailedOut` | Safety stop; output reverts to pre-pass parse for that call |
| `bailoutReason` | Why bailout happened, if any |
| `beforeHash` / `afterHash` | Stable hashes for diffing |
| `stats` | Optional before/after tree metrics (`observe.collectMetrics`) |

---

## Unsupported / opaque behavior

Structures such as **`$nor`**, **`$regex`**, **`$not`**, **`$elemMatch`**, **`$expr`**, geo/text queries, and **unknown** operators are generally treated as **opaque**: they pass through or are preserved without full semantic rewriting. They are **not** guaranteed to participate in merge or contradiction logic.

---

## Stability policy

The **public contract** is:

- `normalizeQuery`
- `resolveNormalizeOptions`
- the exported **types** listed in the package entry

**Not** part of the public contract: internal AST, `parseQuery`, `compileQuery`, individual rules/passes, or utilities. They may change between versions.

---

## Principles (explicit)

1. Default level is **`shape`**.  
2. At the default **`shape`** level, the API is **intended for general production use** in v0.1.0.  
3. **`predicate`** and above may change structure while aiming for **semantic equivalence** on modeled operators.  
4. **`experimental`** is for experiments or offline replay—**not** default online traffic.  
5. **Opaque** nodes are not rewritten semantically.  
6. Output should be **idempotent** under the same options when no bailout occurs.  
7. This library is **not** the MongoDB query planner or an optimizer.

---

## Example scenarios

**Online main path** — use default (`shape`); this is the supported production default in v0.1.0:

```ts
normalizeQuery(query);
```

**Offline analysis / replay / experiments** — opt into higher levels only when you accept preview semantics and non-`shape` boundary warnings (and optional dev console hints):

```ts
normalizeQuery(query, { level: "predicate" });
```

---

## Public API

```ts
normalizeQuery(query, options?) => { query, meta }
resolveNormalizeOptions(options?) => ResolvedNormalizeOptions
```

Types: `NormalizeLevel`, `NormalizeOptions`, `NormalizeRules`, `NormalizeSafety`, `NormalizeObserve`, `ResolvedNormalizeOptions`, `NormalizeResult`, `NormalizeStats`.

---

## Semantic tests (property-based)

Randomized tests use **`mongodb-memory-server`** + **`fast-check`** to compare **real** `find` results (same `sort` / `skip` / `limit`, projection `{ _id: 1 }`) before and after `normalizeQuery` on a **fixed document schema** and a **restricted operator set** (see `test/helpers/arbitraries.js`). They assert matching **`_id` order**, **idempotency** of the returned `query`, and (for opaque operators) **non-crash / stable second pass** only. **`FC_SEED` / `FC_RUNS` defaults are centralized in `test/helpers/fc-config.js`** (also re-exported from `arbitraries.js`).

- **`npm run test:unit`** — unit tests (excludes `test/semantic/**`, `test/regression/**`, `test/property/**`; includes `test/contracts/**`, `test/invariants/**`, `test/performance/**`).
- **`npm run test:semantic`** — semantic + regression + property folders (defaults when env unset: see `fc-config.js`).
- **`npm run test:semantic:quick`** — lower **`FC_RUNS`** (script sets `45`) + **`FC_SEED=42`**, still runs `test/regression/**` and `test/property/**`.
- **`npm run test:semantic:ci`** — CI-oriented env (`FC_RUNS=200`, `FC_SEED=42` in script).

Override property-test parameters: **`FC_SEED`**, **`FC_RUNS`**, optional **`FC_QUICK=1`** (see `fc-config.js`). How to reproduce failures and when to add a fixed regression case: **`test/REGRESSION.md`**.

Full-text, geo, heavy **`$expr`**, **`$where`**, aggregation, collation, etc. stay **out** of the main semantic equivalence generator; opaque contracts live in **`test/contracts/opaque-operators.test.js`**.

---

## Contributor notes

- [SPEC.md](SPEC.md) — behavior-oriented specification.  
- [docs/CANONICAL_FORM.md](docs/CANONICAL_FORM.md) — idempotency and canonical shape notes.
