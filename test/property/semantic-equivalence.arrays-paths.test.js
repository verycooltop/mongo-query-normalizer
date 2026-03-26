"use strict";

const fc = require("fast-check");
const {
    docsBatchArb,
    queryArbExtended,
    sortArbExtended,
    skipArb,
    limitArb,
    getFcConfig,
} = require("../helpers/arbitraries.js");
const { getTestCollection, clearTestCollection } = require("../helpers/mongo-fixture.js");
const { assertSemanticEquivalence } = require("../helpers/assert-semantic-equivalence.js");

/**
 * 数组算子、路径冲突、同字段拆分、深层 $and/$or：以 Mongo 执行 + 幂等为主验收。
 */
describe("property / 语义等价 · 数组与路径", function () {
    this.timeout(300000);

    it("predicate：扩展 queryArb + 扩展 sort，结果顺序与集合一致", async function () {
        const { seed, numRuns } = getFcConfig();
        await fc.assert(
            fc.asyncProperty(
                docsBatchArb(),
                queryArbExtended,
                sortArbExtended,
                skipArb,
                limitArb,
                async (docs, query, sort, skip, limit) => {
                    const coll = getTestCollection();
                    await clearTestCollection();
                    await coll.insertMany(docs);
                    await assertSemanticEquivalence({
                        collection: coll,
                        rawQuery: query,
                        normalizeOptions: { level: "predicate" },
                        sort,
                        skip,
                        limit,
                        seed,
                        docs,
                    });
                }
            ),
            { seed, numRuns, asyncTimeout: 90_000 }
        );
    });

    it("shape：同上（形状层不改变匹配语义）", async function () {
        const { seed, numRuns } = getFcConfig();
        await fc.assert(
            fc.asyncProperty(
                docsBatchArb(),
                queryArbExtended,
                sortArbExtended,
                skipArb,
                limitArb,
                async (docs, query, sort, skip, limit) => {
                    const coll = getTestCollection();
                    await clearTestCollection();
                    await coll.insertMany(docs);
                    await assertSemanticEquivalence({
                        collection: coll,
                        rawQuery: query,
                        normalizeOptions: { level: "shape" },
                        sort,
                        skip,
                        limit,
                        seed,
                        docs,
                    });
                }
            ),
            { seed, numRuns, asyncTimeout: 90_000 }
        );
    });
});
