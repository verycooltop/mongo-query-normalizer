"use strict";

const assert = require("node:assert/strict");
const { normalizeQuery } = require("../../dist/index.js");

describe("api / scope safetyPolicy override", () => {
    it("allowBranchPruning：关闭时不做剪枝类 trace（与默认同形时输出一致）", () => {
        const q = { $and: [{ a: 1 }, { $or: [{ a: 2 }, { b: 1 }] }] };
        const defaultOut = normalizeQuery(q, { level: "scope" }).query;
        const preserved = normalizeQuery(q, {
            level: "scope",
            scope: { safetyPolicy: { allowBranchPruning: false } },
        }).query;
        assert.deepStrictEqual(preserved, defaultOut);
        assert.ok(JSON.stringify(preserved).includes('"a":2'));
        assert.ok(preserved.$and);
    });
});
