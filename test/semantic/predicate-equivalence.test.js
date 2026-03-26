"use strict";

const fc = require("fast-check");
const {
    docsBatchArb,
    queryArb,
    sortArb,
    skipArb,
    limitArb,
    getFcConfig,
} = require("../helpers/arbitraries.js");
const { getTestCollection, clearTestCollection } = require("../helpers/mongo-fixture.js");
const { assertSemanticEquivalence } = require("../helpers/assert-semantic-equivalence.js");

describe("semantic / predicate 等价（Mongo 执行）", function () {
    this.timeout(300000);

    it("随机文档 + 随机查询：normalize 前后 _id 列表与顺序一致，且 query 幂等", async function () {
        const { seed, numRuns } = getFcConfig();
        await fc.assert(
            fc.asyncProperty(
                docsBatchArb(),
                queryArb,
                sortArb,
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
});
