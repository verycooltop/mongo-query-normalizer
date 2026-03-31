"use strict";

const assert = require("node:assert/strict");
const index = require("../../dist/index.js");

describe("api / index exports", () => {
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
});
