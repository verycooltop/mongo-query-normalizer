"use strict";

const assert = require("node:assert/strict");
const { normalizeQuery } = require("../../dist/index.js");

describe("api / normalizeQuery", () => {
    it("返回 { query, meta }", () => {
        const result = normalizeQuery({ a: 1 });
        assert.ok(result && typeof result === "object");
        assert.ok("query" in result && "meta" in result);
        assert.equal(typeof result.meta.changed, "boolean");
    });

    it("空对象保持为空", () => {
        const { query, meta } = normalizeQuery({});
        assert.deepStrictEqual(query, {});
        assert.equal(meta.changed, false);
    });

    it("单字段字面量保持为字段条件", () => {
        const { query } = normalizeQuery({ a: 5 });
        assert.deepStrictEqual(query, { a: 5 });
    });

    it("collectMetrics 时 meta.stats 存在", () => {
        const { meta } = normalizeQuery({ a: 1 }, { observe: { collectMetrics: true } });
        assert.ok(meta.stats);
        assert.ok(meta.stats.before.nodeCount >= 1);
        assert.ok(meta.stats.after.nodeCount >= 1);
    });

    it("顶层 $nor 保持为数组透传", () => {
        const { query } = normalizeQuery({ $nor: [{ a: 1 }] });
        assert.ok(Array.isArray(query.$nor));
    });
});
