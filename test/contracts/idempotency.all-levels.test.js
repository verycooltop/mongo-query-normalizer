"use strict";

const assert = require("node:assert/strict");
const { normalizeQuery } = require("../../dist/index.js");
const { forEachLevel } = require("../helpers/level-contract-runner.js");

describe("contracts / idempotency（all levels）", () => {
    forEachLevel((level) => {
        it(`同 level 二次 normalize 输出稳定：${level}`, () => {
            const query = { a: 5, b: { $gt: 10 } };
            const once = normalizeQuery(query, { level });
            const twice = normalizeQuery(once.query, { level });
            assert.deepStrictEqual(once.query, twice.query);
        });
    });
});
