"use strict";

const { ObjectId } = require("mongodb");
const fc = require("fast-check");
const {
    leafPredicateArbExtended,
    sortArbExtended,
    skipArb,
    limitArb,
    getFcConfig,
} = require("../helpers/arbitraries.js");
const { getTestCollection, clearTestCollection } = require("../helpers/mongo-fixture.js");
const { assertPairedSemanticEquivalence } = require("../helpers/assert-semantic-equivalence.js");
const {
    wrapSingleElementAnd,
    shuffleTopLevelAnd,
    duplicateTopLevelAndChild,
    redundantNestedAnd,
} = require("../helpers/metamorphic.js");

const andQueryArb = fc.array(leafPredicateArbExtended(), { minLength: 2, maxLength: 6 }).map((c) => ({ $and: c }));

/**
 * 变形前后 Mongo 结果一致，normalize 后仍一致；优先覆盖 $and 子句顺序、冗余包裹、重复子句。
 */
describe("property / 变形等价", function () {
    this.timeout(300000);

    it("predicate：对显式 $and 查询做语义保持变形", async function () {
        const { seed, numRuns } = getFcConfig();
        await fc.assert(
            fc.asyncProperty(
                andQueryArb,
                fc.integer({ min: 0, max: 0xffffffff }),
                sortArbExtended,
                skipArb,
                limitArb,
                async (base, shuffleSeed, sort, skip, limit) => {
                    const coll = getTestCollection();
                    await clearTestCollection();
                    const docs = [];
                    for (let i = 0; i < 40; i++) {
                        docs.push({
                            _id: new ObjectId(),
                            score: (i * 7) % 100,
                            priority: i % 5,
                            archived: i % 3 === 0,
                            ownerId: i,
                            createdAt: new Date(Date.UTC(2022, 0, 1 + (i % 400))),
                            status: ["open", "closed", "draft", null][i % 4],
                            tags: i % 2 === 0 ? ["alpha"] : ["beta", "gamma"],
                            profile:
                                i % 5 === 0
                                    ? null
                                    : { level: i % 12, region: ["us", "emea", "apac", null][i % 4] },
                        });
                    }
                    await coll.insertMany(docs);

                    const transforms = [
                        ["wrap", wrapSingleElementAnd(base)],
                        ["shuffle", shuffleTopLevelAnd(base, shuffleSeed)],
                        ["dup", duplicateTopLevelAndChild(base, shuffleSeed)],
                        ["nest", redundantNestedAnd(base)],
                    ];

                    for (const [label, morphed] of transforms) {
                        if (morphed === null) {
                            continue;
                        }
                        await assertPairedSemanticEquivalence({
                            collection: coll,
                            queryA: base,
                            queryB: morphed,
                            normalizeOptions: { level: "predicate" },
                            sort,
                            skip,
                            limit,
                            seed,
                            docs,
                            label: `predicate/${label}`,
                        });
                    }
                }
            ),
            { seed, numRuns: Math.min(numRuns, 80), asyncTimeout: 90_000 }
        );
    });
});
