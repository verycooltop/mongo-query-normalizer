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

describe("semantic / shape 等价（Mongo 执行）", function () {
    this.timeout(300000);

    it("level=shape：normalize 前后结果集一致且 query 幂等", async function () {
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
