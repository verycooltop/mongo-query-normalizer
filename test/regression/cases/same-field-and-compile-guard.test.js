"use strict";

/**
 * 同字段 $and 兄弟在 predicate normalize → compile 后的结构护栏：
 * 防重复 Mongo 键覆盖、防误 impossible、防顺序导致不同放宽结果。
 */

const assert = require("node:assert/strict");
const { normalizeQuery } = require("../../../dist/index.js");
const { IMPOSSIBLE_SELECTOR } = require("../../../dist/types.js");

function permutations(items) {
    if (items.length <= 1) {
        return [items.slice()];
    }
    const out = [];
    for (let i = 0; i < items.length; i += 1) {
        const head = items[i];
        const rest = [...items.slice(0, i), ...items.slice(i + 1)];
        for (const p of permutations(rest)) {
            out.push([head, ...p]);
        }
    }
    return out;
}

function normalizePredicateWithTraces(rawQuery) {
    return normalizeQuery(rawQuery, {
        level: "predicate",
        observe: { collectPredicateTraces: true },
    });
}

function assertNoFalseImpossible(label, rawQuery) {
    const { query, meta } = normalizePredicateWithTraces(rawQuery);
    assert.notDeepStrictEqual(query, IMPOSSIBLE_SELECTOR, `${label}: must not normalize to IMPOSSIBLE_SELECTOR`);
    assert.ok(Array.isArray(meta.predicateTraces), `${label}: predicateTraces`);
    assert.ok(
        !meta.predicateTraces.some((t) => t.impossibleEmitted),
        `${label}: must not emit impossible on any field trace`
    );
    assert.ok(
        !meta.predicateTraces.some((t) => t.contradiction),
        `${label}: must not report field-level contradiction`
    );
    const twice = normalizeQuery(query, { level: "predicate" });
    assert.deepStrictEqual(twice.query, query, `${label}: idempotency`);
    return query;
}

function assertTopLevelAndWithFieldBranches(query, field, minBranches) {
    assert.ok(query && typeof query === "object", "query object");
    assert.ok(Array.isArray(query.$and), "must keep top-level $and");
    assert.ok(
        query.$and.length >= minBranches,
        `expected at least ${minBranches} $and branches, got ${query.$and.length}`
    );
    for (const branch of query.$and) {
        assert.ok(branch && typeof branch === "object" && field in branch, `each branch must constrain ${field}`);
    }
}

function assertFieldObjectKeepsEqAndRange(query, field) {
    const inner = query[field];
    assert.ok(inner && typeof inner === "object", `${field} must be operator object`);
    assert.ok("$eq" in inner, `${field} keeps $eq`);
    assert.ok(
        ["$lt", "$lte", "$gt", "$gte"].some((k) => k in inner),
        `${field} keeps at least one range op`
    );
}

describe("regression / cases · 同字段 $and · compile 护栏与稳定性", () => {
    it("should not collapse distinct eq siblings on same field to impossible under unknown cardinality", () => {
        const raw = { $and: [{ uids: "1" }, { uids: "2" }, { uids: "3" }] };
        const query = assertNoFalseImpossible("uids three eq", raw);
        assertTopLevelAndWithFieldBranches(query, "uids", 3);
    });

    it("should not collapse two or three distinct numeric eq siblings to IMPOSSIBLE_SELECTOR", () => {
        assertNoFalseImpossible("a two eq", { $and: [{ a: 1 }, { a: 2 }] });
        const q3 = assertNoFalseImpossible("a three eq", { $and: [{ a: 1 }, { a: 2 }, { a: 3 }] });
        assertTopLevelAndWithFieldBranches(q3, "a", 3);
    });

    it("should keep duplicate eq literal as separate AND branches (conservative)", () => {
        const query = assertNoFalseImpossible("duplicate eq + third", {
            $and: [{ uids: "1" }, { uids: "1" }, { uids: "2" }],
        });
        assert.ok(Array.isArray(query.$and));
        assert.ok(query.$and.length >= 2);
    });

    it("should preserve eq + $in + eq sibling shape without false impossible", () => {
        const query = assertNoFalseImpossible("eq in eq sandwich", {
            $and: [{ a: 1 }, { a: { $in: [1, 2, 3] } }, { a: 2 }],
        });
        assert.ok(Array.isArray(query.$and));
        assert.ok(query.$and.length >= 2);
    });

    it("should not intersect multiple $in siblings under conservative semantics (compile must not overwrite)", () => {
        const raw = { $and: [{ a: { $in: [1] } }, { a: { $in: [2] } }] };
        const query = assertNoFalseImpossible("plain field two disjoint in", raw);
        assertTopLevelAndWithFieldBranches(query, "a", 2);
        assert.deepStrictEqual(query, {
            $and: [{ a: { $in: [1] } }, { a: { $in: [2] } }],
        });
    });

    it("should keep three $in siblings as three $and branches", () => {
        const raw = {
            $and: [{ a: { $in: [1] } }, { a: { $in: [2] } }, { a: { $in: [3] } }],
        };
        const query = assertNoFalseImpossible("three in", raw);
        assertTopLevelAndWithFieldBranches(query, "a", 3);
    });

    it("should not drop eq or range when both apply on the same field (single object must retain both ops)", () => {
        const q1 = assertNoFalseImpossible("eq + lt", { $and: [{ a: 1 }, { a: { $lt: 0 } }] });
        assertFieldObjectKeepsEqAndRange(q1, "a");

        const q2 = assertNoFalseImpossible("eq + gt + lt", {
            $and: [{ a: 1 }, { a: { $gt: 10 } }, { a: { $lt: 0 } }],
        });
        assertFieldObjectKeepsEqAndRange(q2, "a");

        const q3 = assertNoFalseImpossible("two eq + lt", {
            $and: [{ a: 1 }, { a: 2 }, { a: { $lt: 0 } }],
        });
        assert.ok(Array.isArray(q3.$and));
        assert.ok(q3.$and.length >= 2);
    });

    it("should not upgrade contradictory plain-field ranges to impossible", () => {
        assertNoFalseImpossible("gt+lt disjoint", { $and: [{ a: { $gt: 5 } }, { a: { $lt: 3 } }] });
        assertNoFalseImpossible("gt+lt+ne", {
            $and: [{ a: { $gt: 10 } }, { a: { $lt: 0 } }, { a: { $ne: 5 } }],
        });
    });

    it("对照：同字段 $eq 与 $ne 同值仍应判 impossible（防止保守退化为从不判矛盾）", () => {
        const { query, meta } = normalizePredicateWithTraces({ $and: [{ a: 1 }, { a: { $ne: 1 } }] });
        assert.deepStrictEqual(query, IMPOSSIBLE_SELECTOR);
        const t = meta.predicateTraces.filter((x) => x.field === "a").find((x) => x.contradiction);
        assert.ok(t);
        assert.equal(t.impossibleEmitted, true);
    });

    it("permutation：同组兄弟多种顺序 normalize 结果一致且不判死", () => {
        const siblings = [{ uids: "1" }, { uids: "2" }, { uids: "3" }];
        let canonical = null;
        for (const order of permutations(siblings)) {
            const raw = { $and: order };
            const query = assertNoFalseImpossible(`perm uids ${JSON.stringify(order)}`, raw);
            if (canonical === null) {
                canonical = query;
            } else {
                assert.deepStrictEqual(query, canonical, "permutations must canonicalize to the same query");
            }
        }
    });

    it("程序化枚举：2~5 个互异 eq literal 的 $and 不 impossible、不单键吞没、保留多分支", () => {
        const base = 100;
        for (let k = 2; k <= 5; k += 1) {
            const literals = Array.from({ length: k }, (_, i) => base + i);
            for (const order of permutations(literals)) {
                const raw = { $and: order.map((x) => ({ a: x })) };
                const query = assertNoFalseImpossible(`k=${k} perm`, raw);
                assert.notDeepStrictEqual(query, { a: order[0] }, "must not collapse to a single literal key");
                assert.ok(Array.isArray(query.$and), "must remain $and");
                assert.equal(query.$and.length, k, "one branch per distinct literal");
            }
        }
    });
});
