"use strict";

const assert = require("node:assert/strict");
const index = require("../../dist/index.js");

describe("入口导出", () => {
    it("导出 normalizeQuery", () => {
        assert.strictEqual(typeof index.normalizeQuery, "function");
    });

    it("导出 resolveNormalizeOptions", () => {
        assert.strictEqual(typeof index.resolveNormalizeOptions, "function");
    });

    it("不再导出 rewrite 系列 API", () => {
        assert.equal(index.rewriteQuery, undefined);
        assert.equal(index.rewriteQuerySelector, undefined);
    });

    it("normalizeQuery 幂等（同 level）", () => {
        const query = { a: 5, b: { $gt: 10 } };
        const once = index.normalizeQuery(query, { level: "shape" });
        const twice = index.normalizeQuery(once.query, { level: "shape" });
        assert.deepStrictEqual(once.query, twice.query);
    });
});
