"use strict";

const { ObjectId } = require("mongodb");
const fc = require("fast-check");
const { sortArbExtended, skipArb, limitArb, getFcConfig } = require("../helpers/arbitraries.js");
const { getTestCollection, clearTestCollection } = require("../helpers/mongo-fixture.js");
const { assertPairedSemanticEquivalence } = require("../helpers/assert-semantic-equivalence.js");
const {
    sameFieldRangeCombinedVersusSplit,
    sameFieldRangeCombinedVersusRedundantAnd,
    sameFieldScalarVersusEq,
    shuffleTopLevelAnd,
    redundantNestedAnd,
    wrapTopLevelAndIfApplicable,
} = require("../helpers/metamorphic.js");

const scoreBoundsArb = fc
    .tuple(fc.integer({ min: 5, max: 35 }), fc.integer({ min: 40, max: 90 }))
    .filter(([lo, hi]) => hi > lo + 3);

/**
 * 同字段「合并写法 ↔ 拆散 $and」与路径冲突上的结构性变形；全部走 assertPairedSemanticEquivalence。
 */
describe("property / 变形等价 · 同字段与路径", function () {
    this.timeout(300000);

    async function seedDocs(coll) {
        const docs = [];
        for (let i = 0; i < 36; i++) {
            docs.push({
                _id: new ObjectId(),
                score: (i * 11) % 100,
                priority: i % 7,
                archived: i % 4 === 0,
                ownerId: 10 + i,
                createdAt: new Date(Date.UTC(2023, 0, 1 + (i % 300))),
                status: ["open", "closed", "draft", null][i % 4],
                tags: i % 2 === 0 ? ["alpha"] : ["beta"],
                profile:
                    i % 6 === 0
                        ? null
                        : {
                              level: i % 14,
                              region: ["us", "emea", "apac", null][i % 4],
                              meta: { rank: i % 80 },
                          },
            });
        }
        await coll.insertMany(docs);
        return docs;
    }

    it("predicate：score 范围 合并对象 ↔ 拆成 $and（含 shuffle 拆散式）", async function () {
        const { seed, numRuns } = getFcConfig();
        await fc.assert(
            fc.asyncProperty(
                scoreBoundsArb,
                fc.integer({ min: 0, max: 0xffffffff }),
                sortArbExtended,
                skipArb,
                limitArb,
                async (bounds, shuffleSeed, sort, skip, limit) => {
                    const [lo, hi] = bounds;
                    const coll = getTestCollection();
                    await clearTestCollection();
                    const docs = await seedDocs(coll);
                    const { combined, split } = sameFieldRangeCombinedVersusSplit("score", lo, hi);
                    const shuffled = shuffleTopLevelAnd(split, shuffleSeed);

                    await assertPairedSemanticEquivalence({
                        collection: coll,
                        queryA: combined,
                        queryB: split,
                        normalizeOptions: { level: "predicate" },
                        sort,
                        skip,
                        limit,
                        seed,
                        docs,
                        label: "sameField/range-combined-vs-split",
                    });

                    if (shuffled !== null) {
                        await assertPairedSemanticEquivalence({
                            collection: coll,
                            queryA: split,
                            queryB: shuffled,
                            normalizeOptions: { level: "predicate" },
                            sort,
                            skip,
                            limit,
                            seed,
                            docs,
                            label: "sameField/shuffle-split",
                        });
                    }
                }
            ),
            { seed, numRuns: Math.min(numRuns, 70), asyncTimeout: 90_000 }
        );
    });

    it("predicate：score $gte/$lte 合并 ↔ 带重复子句的 $and", async function () {
        const { seed, numRuns } = getFcConfig();
        await fc.assert(
            fc.asyncProperty(
                fc.tuple(fc.integer({ min: 0, max: 40 }), fc.integer({ min: 50, max: 100 })).filter(([a, b]) => b > a + 5),
                sortArbExtended,
                skipArb,
                limitArb,
                async (bounds, sort, skip, limit) => {
                    const [g, l] = bounds;
                    const coll = getTestCollection();
                    await clearTestCollection();
                    const docs = await seedDocs(coll);
                    const { combined, redundant } = sameFieldRangeCombinedVersusRedundantAnd("score", g, l);
                    await assertPairedSemanticEquivalence({
                        collection: coll,
                        queryA: combined,
                        queryB: redundant,
                        normalizeOptions: { level: "predicate" },
                        sort,
                        skip,
                        limit,
                        seed,
                        docs,
                        label: "sameField/redundant-and",
                    });
                }
            ),
            { seed, numRuns: Math.min(numRuns, 60), asyncTimeout: 90_000 }
        );
    });

    it("predicate：ownerId 标量 ↔ $eq", async function () {
        const { seed, numRuns } = getFcConfig();
        await fc.assert(
            fc.asyncProperty(
                fc.integer({ min: 10, max: 45 }),
                sortArbExtended,
                skipArb,
                limitArb,
                async (oid, sort, skip, limit) => {
                    const coll = getTestCollection();
                    await clearTestCollection();
                    const docs = await seedDocs(coll);
                    const { scalar, explicit } = sameFieldScalarVersusEq("ownerId", oid);
                    await assertPairedSemanticEquivalence({
                        collection: coll,
                        queryA: scalar,
                        queryB: explicit,
                        normalizeOptions: { level: "predicate" },
                        sort,
                        skip,
                        limit,
                        seed,
                        docs,
                        label: "sameField/scalar-vs-eq",
                    });
                }
            ),
            { seed, numRuns: Math.min(numRuns, 50), asyncTimeout: 90_000 }
        );
    });

    it("predicate：profile 路径冲突查询上的 wrap / 冗余嵌套 / shuffle", async function () {
        const { seed, numRuns } = getFcConfig();
        const base = {
            $and: [{ profile: { level: 4, region: "us" } }, { "profile.level": 4 }],
        };

        await fc.assert(
            fc.asyncProperty(
                fc.integer({ min: 0, max: 0xffffffff }),
                sortArbExtended,
                skipArb,
                limitArb,
                async (shuffleSeed, sort, skip, limit) => {
                    const coll = getTestCollection();
                    await clearTestCollection();
                    const docs = await seedDocs(coll);

                    const wrap = wrapTopLevelAndIfApplicable(base);
                    const nest = redundantNestedAnd(base);
                    const shuf = shuffleTopLevelAnd(base, shuffleSeed);

                    for (const [label, morphed] of [
                        ["wrap", wrap],
                        ["nest", nest],
                        ["shuffle", shuf],
                    ]) {
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
                            label: `pathConflict/${label}`,
                        });
                    }
                }
            ),
            { seed, numRuns: Math.min(numRuns, 55), asyncTimeout: 90_000 }
        );
    });
});
