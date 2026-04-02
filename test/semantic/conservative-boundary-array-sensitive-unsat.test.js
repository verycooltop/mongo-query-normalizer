"use strict";

const assert = require("node:assert/strict");
const { getTestCollection, clearTestCollection } = require("../helpers/mongo-fixture.js");
const { normalizeQuery } = require("../../dist/index.js");
const { IMPOSSIBLE_SELECTOR } = require("../../dist/types.js");
const { runFindIds } = require("../helpers/query-runner.js");

describe("semantic / conservative boundary / array-sensitive unsafe-unsat", function () {
    this.timeout(120000);

    const normalizeOptions = { level: "predicate" };
    const findOptions = { sort: { _id: 1 }, skip: 0, limit: 1000 };

    async function assertNotImpossibleAndEquivalent(rawQuery, label) {
        const collection = getTestCollection();

        const first = normalizeQuery(rawQuery, normalizeOptions);
        assert.notDeepStrictEqual(
            first.query,
            IMPOSSIBLE_SELECTOR,
            `${label}: normalized must not be IMPOSSIBLE_SELECTOR`
        );

        const second = normalizeQuery(first.query, normalizeOptions);
        assert.deepStrictEqual(second.query, first.query, `${label}: idempotency must hold`);

        const originalIds = await runFindIds(collection, rawQuery, findOptions);
        const normalizedIds = await runFindIds(collection, first.query, findOptions);
        assert.deepStrictEqual(normalizedIds, originalIds, `${label}: semantic equivalence (_id order)`);
    }

    beforeEach(async () => {
        const collection = getTestCollection();
        await clearTestCollection();
        await collection.insertMany([
            // scalar baseline
            { _id: "a1", a: 1 },
            { _id: "a2", a: 2 },
            { _id: "a12", a: [1, 2] },
            { _id: "other", a: 9 },

            // array-of-documents fixtures: allow different elements satisfy different predicates
            { _id: "team_u1", members: [{ uid: "u1", score: 5 }] },
            { _id: "team_u2", members: [{ uid: "u2", score: 20 }] },
            { _id: "team_u1_u2", members: [{ uid: "u1", score: 5 }, { uid: "u2", score: 20 }] },
            { _id: "team_u2_u3", members: [{ uid: "u2", score: -1 }, { uid: "u3", score: 30 }] },
            { _id: "team_empty", members: [] },
        ]);
    });

    it("eq-in: plain scalar field hit may collapse to eq (equivalent)", async () => {
        await assertNotImpossibleAndEquivalent(
            { $and: [{ a: { $eq: 2 } }, { a: { $in: [1, 2, 3] } }] },
            "scalar eq∈in hit"
        );
    });

    it("eq-in: plain scalar field miss must not emit IMPOSSIBLE_SELECTOR (equivalent)", async () => {
        await assertNotImpossibleAndEquivalent(
            { $and: [{ a: { $eq: 1 } }, { a: { $in: [2, 3] } }] },
            "scalar eq∉in miss"
        );
    });

    it("dotted path: eq-in hit must not emit IMPOSSIBLE_SELECTOR (equivalent)", async () => {
        await assertNotImpossibleAndEquivalent(
            { $and: [{ "members.uid": "u1" }, { "members.uid": { $in: ["u1", "u2"] } }] },
            "dotted eq∈in hit"
        );
    });

    it("dotted path: eq-in miss must not emit IMPOSSIBLE_SELECTOR (equivalent)", async () => {
        await assertNotImpossibleAndEquivalent(
            { $and: [{ "members.uid": "u1" }, { "members.uid": { $in: ["u2", "u3"] } }] },
            "dotted eq∉in miss (different array elements can satisfy)"
        );
    });

    it("regression: docs/issues case must never normalize to impossible (equivalent)", async () => {
        await assertNotImpossibleAndEquivalent(
            {
                $and: [
                    { "members.uid": "8a8a1104618b432c9142997014c8e86b" },
                    { "members.uid": { $in: ["763fe5249c0d431786de6c624e17325e", "ab26c5271ebe40638302d21994d92b3a"] } },
                ],
            },
            "docs/issues regression case"
        );
    });

    it("dotted path: eq + $nin must remain conservative (equivalent)", async () => {
        await assertNotImpossibleAndEquivalent(
            { $and: [{ "members.uid": "u1" }, { "members.uid": { $nin: ["u2"] } }] },
            "dotted eq + nin"
        );
    });

    it("dotted path: eq + range must remain conservative (equivalent)", async () => {
        await assertNotImpossibleAndEquivalent(
            { $and: [{ "members.score": 5 }, { "members.score": { $gt: 10 } }] },
            "dotted eq + range (different elements can satisfy)"
        );
    });

    it("dotted path: in + in disjoint sets must remain conservative (equivalent)", async () => {
        await assertNotImpossibleAndEquivalent(
            { $and: [{ "members.uid": { $in: ["u1"] } }, { "members.uid": { $in: ["u2"] } }] },
            "dotted in + in disjoint (different elements can satisfy)"
        );
    });

    it("dotted path: contradictory ranges must remain conservative (equivalent)", async () => {
        await assertNotImpossibleAndEquivalent(
            { $and: [{ "members.score": { $gt: 10 } }, { "members.score": { $lt: 0 } }] },
            "dotted contradictory ranges (different elements can satisfy)"
        );
    });
});

