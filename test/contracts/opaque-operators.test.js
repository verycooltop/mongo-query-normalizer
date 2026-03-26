"use strict";

const assert = require("node:assert/strict");
const fc = require("fast-check");
const { normalizeQuery } = require("../../dist/index.js");
const { getFcAssertOptions } = require("../helpers/fc-config.js");

/**
 * 保守算子契约：不崩溃、不透明子文档不被「拆解改写」、二次 normalize 稳定。
 * （不纳入主随机语义等价：行为以 Mongo 与驱动为准，此处只锁库内契约。）
 */
const OPAQUE_CASES = [
    { name: "$regex", query: { status: { $regex: "^op", $options: "i" } }, preservePath: ["status"] },
    { name: "$not", query: { score: { $not: { $gt: 5 } } }, preservePath: ["score"] },
    { name: "$elemMatch", query: { tags: { $elemMatch: { $eq: "alpha" } } }, preservePath: ["tags"] },
    { name: "$expr", query: { $expr: { $gt: ["$score", 0] } }, preservePath: ["$expr"] },
    { name: "$nor", query: { $nor: [{ status: "open" }, { archived: true }] }, preservePath: ["$nor"] },
    { name: "$text", query: { $text: { $search: "open" } }, preservePath: ["$text"] },
    {
        name: "$geoWithin",
        query: { loc: { $geoWithin: { $centerSphere: [[0, 0], 0.01] } } },
        preservePath: ["loc"],
    },
    {
        name: "$jsonSchema",
        query: { x: { $jsonSchema: { bsonType: "object", required: ["a"] } } },
        preservePath: ["x"],
    },
];

function getAtPath(obj, path) {
    if (path === "$expr" || path === "$nor" || path === "$text") {
        return obj[path];
    }
    return obj[path];
}

describe("contracts / opaque 算子", function () {
    this.timeout(60000);

    for (const { name, query, preservePath } of OPAQUE_CASES) {
        it(`${name}：不抛错、幂等，且关键子结构深度保留`, function () {
            const originals = preservePath.map((p) => structuredClone(getAtPath(query, p)));

            let once;
            assert.doesNotThrow(() => {
                once = normalizeQuery(query, { level: "predicate" });
            });
            assert.ok(once && typeof once.query === "object");

            preservePath.forEach((p, i) => {
                assert.deepStrictEqual(getAtPath(once.query, p), originals[i], `preserved subtree ${p}`);
            });

            const twice = normalizeQuery(once.query, { level: "predicate" });
            assert.deepStrictEqual(twice.query, once.query);
            assert.equal(typeof once.meta.bailedOut, "boolean");
        });
    }

    it("未知字段算子：整段 raw 保留且幂等", function () {
        const query = { score: { $unknownOp: [1, 2] } };
        const once = normalizeQuery(query, { level: "predicate" });
        assert.deepStrictEqual(once.query.score, query.score);
        const twice = normalizeQuery(once.query, { level: "predicate" });
        assert.deepStrictEqual(twice.query, once.query);
    });

    it("fast-check：opaque 子句与简单字段 $and 混合不崩溃且幂等", function () {
        const arb = fc.record({
            inner: fc.constantFrom(...OPAQUE_CASES.map((c) => c.query)),
        }).map((r) => ({ $and: [r.inner, { archived: false }] }));

        fc.assert(
            fc.property(arb, (q) => {
                const once = normalizeQuery(q, { level: "predicate" });
                const twice = normalizeQuery(once.query, { level: "predicate" });
                assert.deepStrictEqual(twice.query, once.query);
            }),
            getFcAssertOptions({ numRuns: 40 })
        );
    });

    it("shape 层对 opaque 查询同样不破坏幂等", function () {
        for (const { query } of OPAQUE_CASES) {
            const once = normalizeQuery(query, { level: "shape" });
            const twice = normalizeQuery(once.query, { level: "shape" });
            assert.deepStrictEqual(twice.query, once.query);
        }
    });
});
