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

describe("levels / logical", () => {
    it("继承 predicate：矛盾仍折叠为 IMPOSSIBLE_SELECTOR", () => {
        const { query } = runAtLevel("logical", contradictorySameFieldInAnd);
        assert.deepStrictEqual(query, IMPOSSIBLE_SELECTOR);
    });

    it("继承 predicate：可比谓词合并与 predicate 一致", () => {
        const predicateQ = runAtLevel("predicate", comparableGtMerge).query;
        const logicalQ = runAtLevel("logical", comparableGtMerge).query;
        assert.deepStrictEqual(logicalQ, predicateQ);
    });

    it("公共谓词 $or：query 与 predicate 同形（detect 不改写结构）", () => {
        const predicateQuery = runAtLevel("predicate", commonPredicatesInOr).query;
        const logicalQuery = runAtLevel("logical", commonPredicatesInOr).query;
        assert.deepStrictEqual(logicalQuery, predicateQuery);
        assert.ok(Array.isArray(logicalQuery.$or));
    });

    it("相较 predicate 存在额外观测（warnings 更多，不校验具体文案）", () => {
        const observe = { collectWarnings: true };
        const pw = runAtLevel("predicate", commonPredicatesInOr, { observe }).meta.warnings.length;
        const lw = runAtLevel("logical", commonPredicatesInOr, { observe }).meta.warnings.length;
        assert.ok(lw > pw);
    });

    it("禁止能力：不出现 experimental 的 hoist 结构（与 predicate 输出一致）", () => {
        const pred = runAtLevel("predicate", commonPredicatesInOr).query;
        const log = runAtLevel("logical", commonPredicatesInOr).query;
        assert.deepStrictEqual(log, pred);
        const exp = runAtLevel("experimental", commonPredicatesInOr).query;
        assert.notDeepStrictEqual(log, exp);
    });

    it("与 experimental 对照：logical 保持顶层 $or，experimental 变为顶层 $and", () => {
        const logicalQuery = runAtLevel("logical", commonPredicatesInOr).query;
        const experimentalQuery = runAtLevel("experimental", commonPredicatesInOr).query;
        assert.ok(Array.isArray(logicalQuery.$or));
        assert.ok(Array.isArray(experimentalQuery.$and));
        assert.notDeepStrictEqual(logicalQuery, experimentalQuery);
    });

    it("三分支公共 $or：logical 仍与 predicate 同形", () => {
        const p = runAtLevel("predicate", commonPredicatesInOrTriple).query;
        const l = runAtLevel("logical", commonPredicatesInOrTriple).query;
        assert.deepStrictEqual(l, p);
    });
});
