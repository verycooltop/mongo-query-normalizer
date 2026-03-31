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

## Testing

### Test layout

This repository organizes tests by **API surface**, **normalization level**, and **cross-level contracts**, while preserving deeper semantic and regression suites.

### Directory responsibilities

#### `test/api/`

Tests the public API and configuration surface.

Put tests here when they verify:

* `normalizeQuery` return shape and top-level behavior
* `resolveNormalizeOptions`
* preview / warning boundary behavior
* package exports

Do **not** put level-specific normalization behavior here.

---

#### `test/levels/`

Tests the behavior boundary of each `NormalizeLevel`.

Current levels:

* `shape`
* `predicate`
* `logical`
* `experimental`

Each level test file should focus on four things:

1. positive capabilities of that level
2. behavior explicitly not enabled at that level
3. contrast with the adjacent level(s)
4. a small number of representative contracts for that level

Prefer asserting:

* normalized query structure
* observable cross-level differences
* stable public metadata

Avoid overfitting to:

* exact warning text
* exact internal rule IDs
* fixed child ordering unless ordering itself is part of the contract

---

#### `test/contracts/`

Tests contracts that should hold across levels, or default behavior that is separate from any single level.

Put tests here when they verify:

* default level behavior
* idempotency across all levels
* output invariants across all levels
* opaque subtree preservation across all levels

Use `test/helpers/level-contract-runner.js` for all-level suites.

---

#### `test/semantic/`

Tests semantic equivalence against execution behavior.
These tests validate that normalization preserves meaning.

This directory is intentionally separate from `levels/` and `contracts/`.

---

#### `test/property/`

Tests property-based and metamorphic behavior.

Use this directory for:

* randomized semantic checks
* metamorphic invariants
* broad input-space validation

Do not use it as the primary place to express level boundaries.

---

#### `test/regression/`

Tests known historical failures and hand-crafted regression cases.

Add a regression test here when fixing a bug that should stay fixed.

---

#### `test/performance/`

Tests performance guards or complexity-sensitive behavior.

These tests should stay focused on performance-related expectations, not general normalization structure.

---

### Helper files

#### `test/helpers/level-runner.js`

Shared helper for running a query at a specific level.

#### `test/helpers/level-cases.js`

Shared fixed inputs used across level tests.
Prefer adding reusable representative cases here instead of duplicating inline fixtures.

#### `test/helpers/level-contract-runner.js`

Shared `LEVELS` list and helpers for all-level contract suites.

---

### Rules for adding new tests

#### When adding a new normalization rule

Ask first:

* Is this a public API behavior?

  * Add to `test/api/`
* Is this enabled only at a specific level?

  * Add to `test/levels/`
* Should this hold for all levels?

  * Add to `test/contracts/`
* Is this about semantic preservation or randomized validation?

  * Add to `test/semantic/` or `test/property/`
* Is this a bug fix for a previously broken case?

  * Add to `test/regression/`

---

#### When adding a new level

At minimum, update all of the following:

1. add a new `test/levels/<level>-level.test.js`
2. register the level in `test/helpers/level-contract-runner.js`
3. ensure all-level contract suites cover it
4. add at least one contrast case against the adjacent level

---

### Testing style guidance

Prefer:

* example-based tests for level boundaries
* query-shape assertions
* contrast tests between adjacent levels
* shared fixtures for representative cases

Avoid:

* coupling level tests to unstable implementation details
* repeating the same fixture with only superficial assertion changes
* putting default-level behavior inside a specific level test
* mixing exports/API tests with normalization behavior tests

---

### Practical rule of thumb

* `api/` answers: **how the library is used**
* `levels/` answers: **what each level does and does not do**
* `contracts/` answers: **what must always remain true**
* `semantic/property/regression/performance` answer: **whether the system remains correct, robust, and efficient**

---

### npm scripts and property-test tooling

Randomized semantic tests use **`mongodb-memory-server`** + **`fast-check`** to compare **real** `find` results (same `sort` / `skip` / `limit`, projection `{ _id: 1 }`) before and after `normalizeQuery` on a **fixed document schema** and a **restricted operator set** (see `test/helpers/arbitraries.js`). They assert matching **`_id` order**, **idempotency** of the returned `query`, and (for opaque operators) **non-crash / stable second pass** only. **`FC_SEED` / `FC_RUNS` defaults are centralized in `test/helpers/fc-config.js`** (also re-exported from `arbitraries.js`).

* **`npm run test`** — build, then `test:unit`, then `test:semantic`.
* **`npm run test:api`** — `test/api/**/*.test.js` only.
* **`npm run test:levels`** — `test/levels/**/*.test.js` and `test/contracts/*.test.js`.
* **`npm run test:unit`** — all `test/**/*.test.js` except `test/semantic/**`, `test/regression/**`, and `test/property/**` (includes `test/api/**`, `test/levels/**`, `test/contracts/**`, `test/performance/**`, and other unit tests).
* **`npm run test:semantic`** — semantic + regression + property folders (defaults when env unset: see `fc-config.js`).
* **`npm run test:semantic:quick`** — lower **`FC_RUNS`** (script sets `45`) + **`FC_SEED=42`**, still runs `test/regression/**` and `test/property/**`.
* **`npm run test:semantic:ci`** — CI-oriented env (`FC_RUNS=200`, `FC_SEED=42` in script).

Override property-test parameters: **`FC_SEED`**, **`FC_RUNS`**, optional **`FC_QUICK=1`** (see `fc-config.js`). How to reproduce failures and when to add a fixed regression case: **`test/REGRESSION.md`**.

Full-text, geo, heavy **`$expr`**, **`$where`**, aggregation, collation, etc. stay **out** of the main semantic equivalence generator; opaque contracts live in **`test/contracts/opaque-operators.all-levels.test.js`**.

---

## Contributor notes

- [SPEC.md](SPEC.md) — behavior-oriented specification.  
- [docs/CANONICAL_FORM.md](docs/CANONICAL_FORM.md) — idempotency and canonical shape notes.
