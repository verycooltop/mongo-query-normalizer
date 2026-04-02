"use strict";

const assert = require("node:assert/strict");
const { IMPOSSIBLE_SELECTOR } = require("../../dist/types.js");
const {
    assertPredicateIdempotent,
    assertAppliedCapabilitiesWhitelisted,
    assertNoFalseImpossible,
} = require("../helpers/predicate-test-helpers.js");

describe("contracts / predicate conservative boundary (array-sensitive unsafe-unsat)", () => {
    it("eq-in: plain scalar field hit may collapse to eq", () => {
        const q = { $and: [{ a: { $eq: 2 } }, { a: { $in: [1, 2, 3] } }] };
        const { first } = assertPredicateIdempotent(q);
        assertAppliedCapabilitiesWhitelisted(first.meta);
        assert.deepStrictEqual(first.normalized, { a: 2 });
    });

    it("eq-in: plain scalar field miss must not emit IMPOSSIBLE_SELECTOR", () => {
        const q = { $and: [{ a: { $eq: 1 } }, { a: { $in: [2, 3] } }] };
        const { first } = assertPredicateIdempotent(q);
        assertAppliedCapabilitiesWhitelisted(first.meta);
        assertNoFalseImpossible(first);
        assert.notDeepStrictEqual(first.normalized, IMPOSSIBLE_SELECTOR);
    });

    it("dotted path: eq-in hit must not emit IMPOSSIBLE_SELECTOR", () => {
        const q = { $and: [{ "members.uid": "u1" }, { "members.uid": { $in: ["u1", "u2"] } }] };
        const { first } = assertPredicateIdempotent(q);
        assertAppliedCapabilitiesWhitelisted(first.meta);
        assertNoFalseImpossible(first);
    });

    it("dotted path: eq-in miss must not emit IMPOSSIBLE_SELECTOR", () => {
        const q = { $and: [{ "members.uid": "u1" }, { "members.uid": { $in: ["u2", "u3"] } }] };
        const { first } = assertPredicateIdempotent(q);
        assertAppliedCapabilitiesWhitelisted(first.meta);
        assertNoFalseImpossible(first);
    });

    it("dotted path: eq + $nin must remain conservative (no impossible)", () => {
        const q = { $and: [{ "members.uid": "u1" }, { "members.uid": { $nin: ["u2"] } }] };
        const { first } = assertPredicateIdempotent(q);
        assertAppliedCapabilitiesWhitelisted(first.meta);
        assertNoFalseImpossible(first);
    });

    it("dotted path: eq + range must remain conservative (no impossible)", () => {
        const q = { $and: [{ "members.score": 5 }, { "members.score": { $gt: 10 } }] };
        const { first } = assertPredicateIdempotent(q);
        assertAppliedCapabilitiesWhitelisted(first.meta);
        assertNoFalseImpossible(first);
    });

    it("dotted path: in + in disjoint must remain conservative (no impossible)", () => {
        const q = { $and: [{ "members.uid": { $in: ["u1"] } }, { "members.uid": { $in: ["u2"] } }] };
        const { first } = assertPredicateIdempotent(q);
        assertAppliedCapabilitiesWhitelisted(first.meta);
        assertNoFalseImpossible(first);
    });

    it("dotted path: contradictory ranges must remain conservative (no impossible)", () => {
        const q = { $and: [{ "members.score": { $gt: 10 } }, { "members.score": { $lt: 0 } }] };
        const { first } = assertPredicateIdempotent(q);
        assertAppliedCapabilitiesWhitelisted(first.meta);
        assertNoFalseImpossible(first);
    });
});

