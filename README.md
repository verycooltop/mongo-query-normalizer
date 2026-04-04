# mongo-query-normalizer

> A safe MongoDB query normalizer — **correctness over cleverness**

---

## ✨ What it does

**Turn messy Mongo queries into clean, stable, and predictable ones — safely.**

```js
// before
{
  $and: [
    { status: "open" },
    { status: { $in: ["open", "closed"] } }
  ]
}

// after
{ status: "open" }
```

---

## ⚠️ Why this matters

If you build dynamic queries, you will eventually get:

* duplicated conditions
* inconsistent query shapes
* hard-to-debug filters
* subtle semantic bugs

Most tools try to “optimize” queries.

👉 This library does something different:

> **It only applies transformations that are provably safe.**

---

## 🛡️ Safe by design

```js
// NOT simplified (correctly)
{
  $and: [
    { uids: "1" },
    { uids: "2" }
  ]
}
```

Why?

Because MongoDB arrays can match both:

```js
{ uids: ["1", "2"] }
```

---

## ❌ What this is NOT

* Not a query optimizer
* Not an index advisor
* Not a performance tool

It will **never guess**:

* field cardinality
* schema constraints
* data distribution

If unsure → **skip**

---

## 🚀 Quick start

```ts
import { normalizeQuery } from "mongo-query-normalizer";

const { query } = normalizeQuery(inputQuery);
```

---

## 🧠 Where it fits

```text
Query Builder / ORM
        ↓
   normalizeQuery   ← (this library)
        ↓
      MongoDB
```

You don’t replace your builder.
You **sanitize its output**.

---

## 🧩 When to use

* dynamic filters / search APIs
* BI / reporting systems
* user-generated queries
* multi-team codebases with inconsistent query styles
* logging / caching / diffing queries

---

## ⚙️ Levels

| Level       | What it does                   | Safety    |
| ----------- | ------------------------------ | --------- |
| `shape`     | structural normalization       | 🟢 safest |
| `predicate` | safe predicate simplification  | 🟡        |
| `scope`     | limited constraint propagation | 🟡        |

Default is `shape`.

---

## 📦 Output

```ts
{
  query, // normalized query
  meta   // debug / trace info
}
```

---

## 🎯 Design philosophy

> If a rewrite might be wrong, don’t do it.

* no schema assumptions
* no array guessing
* no unsafe merges
* deterministic output
* idempotent results

---

## 🔍 Example

```ts
const result = normalizeQuery({
  $and: [
    { status: "open" },
    { status: { $in: ["open", "closed"] } }
  ]
});

console.log(result.query);
// { status: "open" }
```

---

## 📚 Docs

* [`SPEC.md`](SPEC.md) — behavior spec
* [`docs/normalization-matrix.md`](docs/normalization-matrix.md) — rule coverage by operator and level
* [`docs/CANONICAL_FORM.md`](docs/CANONICAL_FORM.md) — canonical output shape and idempotency
* [`CHANGELOG.md`](CHANGELOG.md) — release notes
* [`test/REGRESSION.md`](test/REGRESSION.md) — reproducing property / semantic test failures

**中文：** [`README.zh-CN.md`](README.zh-CN.md) · [`SPEC.zh-CN.md`](SPEC.zh-CN.md) · [`docs/normalization-matrix.zh-CN.md`](docs/normalization-matrix.zh-CN.md) · [`CHANGELOG.zh-CN.md`](CHANGELOG.zh-CN.md)

---

## 🧪 Testing

* semantic equivalence tests (real MongoDB)
* property-based testing
* regression suites

---

## ⭐ Philosophy

Most query tools try to be smart.

This one tries to be **correct**.