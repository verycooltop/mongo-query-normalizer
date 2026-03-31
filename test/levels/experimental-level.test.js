"use strict";

const assert = require("node:assert/strict");
const { runAtLevel } = require("../helpers/level-runner.js");
const {
    IMPOSSIBLE_SELECTOR,
    contradictorySameFieldInAnd,
    comparableGtMerge,
    commonPredicatesInOr,
    commonPredicatesInOrTriple,
} = require("../helpers/level-cases.js");

function isPlainObject(x) {
    return x !== null && typeof x === "object" && !Array.isArray(x);
}

function andBranchHasFieldAOnly(node) {
    return isPlainObject(node) && node.a === 1 && Object.keys(node).length === 1;
}

function andBranchHasNestedOr(node) {
    return isPlainObject(node) && Array.isArray(node.$or);
}

describe("levels / experimental", () => {
    it("继承 predicate / logical：矛盾仍得到 IMPOSSIBLE_SELECTOR", () => {
        const { query } = runAtLevel("experimental", contradictorySameFieldInAnd);
        assert.deepStrictEqual(query, IMPOSSIBLE_SELECTOR);
    });

    it("继承 predicate：无 hoist 场景时与 predicate 同类合并一致", () => {
        const pred = runAtLevel("predicate", comparableGtMerge).query;
        const exp = runAtLevel("experimental", comparableGtMerge).query;
        assert.deepStrictEqual(exp, pred);
    });

    it("相对 logical：公共 $or 发生结构变化（顶层 $and + 内层 $or）", () => {
        const logicalQuery = runAtLevel("logical", commonPredicatesInOr).query;
        const { query } = runAtLevel("experimental", commonPredicatesInOr);
        assert.notDeepStrictEqual(query, logicalQuery);
        assert.ok(Array.isArray(query.$and));
        assert.ok(query.$and.some(andBranchHasFieldAOnly));
        assert.ok(query.$and.some(andBranchHasNestedOr));
        const nestedOr = query.$and.find(andBranchHasNestedOr).$or;
        assert.ok(Array.isArray(nestedOr));
    });

    it("与 logical 对照：experimental 出现顶层 $and，logical 仍为顶层 $or", () => {
        const logicalQuery = runAtLevel("logical", commonPredicatesInOr).query;
        const experimentalQuery = runAtLevel("experimental", commonPredicatesInOr).query;
        assert.ok(Array.isArray(logicalQuery.$or));
        assert.ok(Array.isArray(experimentalQuery.$and));
    });

    it("hoist 后内层 $or 仍保留各分支差异（两分支：b 与 c）", () => {
        const { query } = runAtLevel("experimental", commonPredicatesInOr);
        const nestedOr = query.$and.find(andBranchHasNestedOr).$or;
        const keys = nestedOr.map((branch) => Object.keys(branch)[0]).sort();
        assert.deepStrictEqual(keys, ["b", "c"]);
    });

    it("hoist 后内层 $or 仍保留各分支差异（三分支：b / c / d）", () => {
        const { query } = runAtLevel("experimental", commonPredicatesInOrTriple);
        assert.ok(Array.isArray(query.$and));
        const nestedOr = query.$and.find(andBranchHasNestedOr).$or;
        assert.equal(nestedOr.length, 3);
        const keys = nestedOr.map((branch) => Object.keys(branch)[0]).sort();
        assert.deepStrictEqual(keys, ["b", "c", "d"]);
    });

    it("contract：输出为可 JSON 序列化的 plain query 对象", () => {
        const { query } = runAtLevel("experimental", commonPredicatesInOr);
        assert.ok(query !== null && typeof query === "object");
        assert.doesNotThrow(() => JSON.stringify(query));
    });
});
