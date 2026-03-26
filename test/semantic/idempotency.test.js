"use strict";

const assert = require("node:assert/strict");
const fc = require("fast-check");
const { normalizeQuery } = require("../../dist/index.js");
const { queryArb, getFcConfig } = require("../helpers/arbitraries.js");
const { formatFailureContext } = require("../helpers/assert-semantic-equivalence.js");

describe("semantic / 幂等（仅 query 深度相等）", function () {
    this.timeout(120000);

    function assertIdempotent(query, level, seed) {
        const normalizeOptions = { level };
        let first;
        try {
            first = normalizeQuery(query, normalizeOptions);
        } catch (err) {
            const msg = `normalizeQuery threw\n${formatFailureContext({
                seed,
                reason: "normalize_threw",
                rawQuery: query,
                normalizeOptions,
                sort: {},
                skip: 0,
                limit: 0,
            })}`;
            throw new Error(msg, { cause: err });
        }
        const q1 = first.query;
        const second = normalizeQuery(q1, normalizeOptions);
        try {
            assert.deepStrictEqual(second.query, q1);
        } catch (err) {
            throw new Error(
                `${err.message}\n${formatFailureContext({
                    seed,
                    reason: "idempotency_query_mismatch",
                    rawQuery: query,
                    normalizeOptions,
                    sort: {},
                    skip: 0,
                    limit: 0,
                    normalizedQuery: q1,
                    meta: first.meta,
                    metaSecond: second.meta,
                    secondPassQuery: second.query,
                })}`,
                { cause: err }
            );
        }
    }

    it("predicate：随机查询二次 normalize 后 .query 深度相等", function () {
        const { seed, numRuns } = getFcConfig();
        fc.assert(
            fc.property(queryArb, (query) => {
                assertIdempotent(query, "predicate", seed);
            }),
            { seed, numRuns }
        );
    });

    it("shape：随机查询二次 normalize 后 .query 深度相等", function () {
        const { seed, numRuns } = getFcConfig();
        fc.assert(
            fc.property(queryArb, (query) => {
                assertIdempotent(query, "shape", seed);
            }),
            { seed, numRuns }
        );
    });
});
