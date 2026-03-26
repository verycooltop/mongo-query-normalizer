"use strict";

const fc = require("fast-check");
const {
    docsBatchArbRich,
    queryArb,
    sortArbExtended,
    skipArb,
    limitArb,
    getFcConfig,
} = require("../helpers/arbitraries.js");
const { getTestCollection, clearTestCollection } = require("../helpers/mongo-fixture.js");
const { assertSemanticEquivalence } = require("../helpers/assert-semantic-equivalence.js");

/**
 * 脏文档 / 结构漂移：在「随机复杂文档」上仍跑主 queryArb（叶子谓词），验证 normalize 不误伤 Mongo 语义。
 */
describe("property / 语义等价 · 脏文档", function () {
    this.timeout(300000);

    it("predicate：docArbRich + 基线 queryArb", async function () {
        const { seed, numRuns } = getFcConfig();
        await fc.assert(
            fc.asyncProperty(
                docsBatchArbRich(),
                queryArb,
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
            { seed, numRuns: Math.min(numRuns, 120), asyncTimeout: 90_000 }
        );
    });
});
