"use strict";

const assert = require("node:assert/strict");
const fc = require("fast-check");
const { normalizeQuery } = require("../../dist/index.js");
const { queryArb, queryArbExtended, getFcConfig } = require("../helpers/arbitraries.js");
const { forEachLevel } = require("../helpers/level-contract-runner.js");

function maxLogicalDepth(value, depth = 0) {
    if (depth > 500) {
        return depth;
    }
    if (value === null || typeof value !== "object") {
        return depth;
    }
    if (Array.isArray(value)) {
        let m = depth;
        for (const x of value) {
            m = Math.max(m, maxLogicalDepth(x, depth + 1));
        }
        return m;
    }
    let m = depth;
    for (const [k, v] of Object.entries(value)) {
        if (k === "$and" || k === "$or") {
            if (Array.isArray(v)) {
                for (const c of v) {
                    m = Math.max(m, maxLogicalDepth(c, depth + 1));
                }
            }
        } else if (v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
            m = Math.max(m, maxLogicalDepth(v, depth + 1));
        }
    }
    return m;
}

function countKeysApprox(obj, budget = 5000) {
    let n = 0;
    const stack = [obj];
    while (stack.length && n < budget) {
        const cur = stack.pop();
        if (cur === null || typeof cur !== "object") {
            continue;
        }
        if (Array.isArray(cur)) {
            for (const x of cur) {
                stack.push(x);
            }
            continue;
        }
        for (const v of Object.values(cur)) {
            n++;
            if (n >= budget) {
                return n;
            }
            if (v !== null && typeof v === "object") {
                stack.push(v);
            }
        }
    }
    return n;
}

describe("contracts / output invariants（all levels）", function () {
    this.timeout(120000);

    forEachLevel((level) => {
        describe(`level: ${level}`, () => {
            it("输出仍为可 JSON 序列化的 plain 结构（不含循环）", function () {
                const { seed, numRuns } = getFcConfig();
                fc.assert(
                    fc.property(queryArbExtended, (q) => {
                        const { query, meta } = normalizeQuery(q, { level });
                        assert.equal(typeof meta.bailedOut, "boolean");
                        assert.doesNotThrow(() => JSON.stringify(query));
                        assert.ok(query === null || typeof query === "object");
                    }),
                    { seed, numRuns: Math.min(numRuns, 100) }
                );
            });

            it("逻辑深度相对输入受控", function () {
                const { seed, numRuns } = getFcConfig();
                fc.assert(
                    fc.property(queryArb, (q) => {
                        const inD = maxLogicalDepth(q);
                        const { query } = normalizeQuery(q, { level });
                        const outD = maxLogicalDepth(query);
                        assert.ok(
                            outD <= inD + 8,
                            `depth inflated: in=${inD} out=${outD}`
                        );
                    }),
                    { seed, numRuns }
                );
            });

            it("扩展 queryArb：逻辑深度相对输入仍受控（略放宽上界）", function () {
                const { seed, numRuns } = getFcConfig();
                fc.assert(
                    fc.property(queryArbExtended, (q) => {
                        const inD = maxLogicalDepth(q);
                        const { query } = normalizeQuery(q, { level });
                        const outD = maxLogicalDepth(query);
                        assert.ok(
                            outD <= inD + 14,
                            `extended depth inflated: in=${inD} out=${outD}`
                        );
                    }),
                    { seed, numRuns: Math.min(numRuns, 80) }
                );
            });

            it("对已 normalize 的 query 再次 normalize 结构稳定", function () {
                const { seed, numRuns } = getFcConfig();
                fc.assert(
                    fc.property(queryArbExtended, (q) => {
                        const once = normalizeQuery(q, { level });
                        const twice = normalizeQuery(once.query, { level });
                        assert.deepStrictEqual(twice.query, once.query);
                    }),
                    { seed, numRuns: Math.min(numRuns, 80) }
                );
            });

            it("输出节点规模受控（防指数膨胀）", function () {
                const { seed, numRuns } = getFcConfig();
                fc.assert(
                    fc.property(queryArbExtended, (q) => {
                        const { query } = normalizeQuery(q, { level });
                        const keys = countKeysApprox(query, 8000);
                        assert.ok(keys < 8000, `query too large: ~${keys} nested keys`);
                    }),
                    { seed, numRuns: Math.min(numRuns, 60) }
                );
            });

            it("normalize 后 JSON 体积相对输入不应无理由暴涨", function () {
                const { seed, numRuns } = getFcConfig();
                fc.assert(
                    fc.property(queryArbExtended, (q) => {
                        const inSize = JSON.stringify(q).length;
                        const { query } = normalizeQuery(q, { level });
                        const outSize = JSON.stringify(query).length;
                        assert.ok(
                            outSize <= Math.max(512, inSize * 25),
                            `json size blowup: in=${inSize} out=${outSize}`
                        );
                    }),
                    { seed, numRuns: Math.min(numRuns, 50) }
                );
            });
        });
    });
});
