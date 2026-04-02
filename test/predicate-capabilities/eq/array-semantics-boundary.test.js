"use strict";

const assert = require("node:assert/strict");
const { fieldNode } = require("../../../dist/ast/builders.js");
const { buildFieldPredicateBundleFromFieldNode } = require("../../../dist/predicate/ir/build-field-bundle.js");
const { normalizeFieldPredicateBundle } = require("../../../dist/predicate/normalize-field-predicate-bundle.js");

function runEngine(fieldNodeInput) {
    const bundle = buildFieldPredicateBundleFromFieldNode(fieldNodeInput);
    return normalizeFieldPredicateBundle(bundle, {});
}

function assertNotImpossible(r, label) {
    assert.equal(
        r.contradiction,
        false,
        `${label}: must not be treated as IMPOSSIBLE_SELECTOR under array semantics`
    );
}

function assertNotSingleEqTightening(r, label) {
    const eqAtoms = r.normalizedBundle.predicates.filter((p) => p.kind === "eq");
    assert.notEqual(
        eqAtoms.length,
        1,
        `${label}: must not be incorrectly tightened to a single eq predicate`
    );
}

describe("predicate-capabilities / array semantics boundary", () => {
    it("多个 eq（不能判冲突）", () => {
        const node = fieldNode("a", [
            { op: "$eq", value: 1 },
            { op: "$eq", value: 2 },
        ]);
        const r = runEngine(node);
        assertNotImpossible(r, "eq+eq on array field");
        assertNotSingleEqTightening(r, "eq+eq on array field");
    });

    it("多个 eq（字符串版本，不能判冲突）", () => {
        const node = fieldNode("uids", [
            { op: "$eq", value: "1" },
            { op: "$eq", value: "2" },
            { op: "$eq", value: "3" },
        ]);
        const r = runEngine(node);
        assertNotImpossible(r, "string eq+eq+eq on array field");
        assertNotSingleEqTightening(r, "string eq+eq+eq on array field");
    });

    it("eq + range（不能判冲突）", () => {
        const node = fieldNode("a", [
            { op: "$eq", value: 1 },
            { op: "$lt", value: 0 },
        ]);
        const r = runEngine(node);
        assertNotImpossible(r, "eq + range on array field");
    });

    it("range + range（不能判冲突）", () => {
        const node = fieldNode("a", [
            { op: "$gt", value: 5 },
            { op: "$lt", value: 3 },
        ]);
        const r = runEngine(node);
        assertNotImpossible(r, "range + range on array field");
    });

    it("多个 $in（不能默认求交）", () => {
        const node = fieldNode("a", [
            { op: "$in", value: [1] },
            { op: "$in", value: [3] },
        ]);
        const r = runEngine(node);
        assertNotImpossible(r, "in + in on array field");
        const inAtoms = r.normalizedBundle.predicates.filter((p) => p.kind === "in");
        assert.equal(inAtoms.length, 2, "in + in must not be intersected into one in predicate");
    });

    it("混合场景：eq + in + range（不能判冲突，也不能错误收紧）", () => {
        const node = fieldNode("a", [
            { op: "$eq", value: 1 },
            { op: "$in", value: [1, 2, 3] },
            { op: "$lt", value: 0 },
        ]);
        const r = runEngine(node);
        assertNotImpossible(r, "eq + in + range on array field");
        const eqAtoms = r.normalizedBundle.predicates.filter((p) => p.kind === "eq");
        assert.equal(
            eqAtoms.some((p) => p.value === 3),
            false,
            "eq + in + range must not be incorrectly tightened to { a: 3 }"
        );
    });
});
