# mongo-query-rewriter

**English** | [中文](README.zh-CN.md)

A MongoDB query rewriter for normalization, simplification, and conflict resolution.

---

## Install

```bash
npm install mongo-query-rewriter
```

---

## Quick example

```js
const { rewriteQuerySelector } = require("mongo-query-rewriter");

// Redundant $and and same-field conditions get merged
const selector = {
    $and: [
        { status: "active" },
        { score: { $gte: 0 } },
        { score: { $lte: 100 } },
    ],
};
const rewritten = rewriteQuerySelector(selector);
// → { $and: [ { status: "active" }, { score: { $gte: 0, $lte: 100 } } ] }

// Conflicting conditions become an impossible selector
const impossible = rewriteQuerySelector({
    $and: [{ a: 1 }, { a: 2 }],
});
// → { _id: { $exists: false } }  (IMPOSSIBLE_SELECTOR)
```

---

## API

### `rewriteQuerySelector(selector)`

- **Parameters:** `selector` — a MongoDB filter object (same shape as `FilterQuery`).
- **Returns:** A rewritten selector. Does not mutate `selector`.

Use this for any filter you pass to MongoDB (e.g. `collection.find(rewriteQuerySelector(filter))`).

### `rewriteAst(ast)`

Rewrites a selector AST only (no parse/compile). For advanced use when you already have an AST (e.g. from `parseSelector` in the operations layer). Most users should use `rewriteQuerySelector` only.

### `IMPOSSIBLE_SELECTOR`

Constant: `{ _id: { $exists: false } }`. Returned when the selector is unsatisfiable (e.g. conflicting conditions on the same field). You can check `result === IMPOSSIBLE_SELECTOR` or use your own check to skip the query or short-circuit.

### Type: `Selector`

TypeScript type for a MongoDB selector, compatible with the driver’s `FilterQuery`. Import with:

```ts
import type { Selector } from "mongo-query-rewriter";
```

---

## Notes

- **May return a tighter filter:** in some cases the output can be stricter than the input (still safe to use as a query filter, but it may match fewer documents).
- **Contradictions:** if the filter is unsatisfiable, it returns `IMPOSSIBLE_SELECTOR`.
- **Idempotent:** calling it twice yields the same result.

---

## License

ISC. See [LICENSE](LICENSE).
