"use strict";

const assert = require("node:assert/strict");
const { fieldNode } = require("../../../dist/ast/builders.js");
const { buildFieldPredicateBundleFromFieldNode } = require("../../../dist/predicate/ir/build-field-bundle.js");
const { normalizeFieldPredicateBundle } = require("../../../dist/predicate/normalize-field-predicate-bundle.js");

describe("predicate-capabilities / eq.in", () => {
    it("positive：$in 列表去重", () => {
        const node = fieldNode("a", [{ op: "$in", value: [1, 1, 2] }]);
        const r = normalizeFieldPredicateBundle(buildFieldPredicateBundleFromFieldNode(node), {});
        assert.ok(r.changed);
        const inAtom = r.normalizedBundle.predicates.find((p) => p.kind === "in");
        assert.ok(inAtom);
        assert.equal(inAtom.values.length, 2);
    });

    it("conservative：$eq 不在 $in 时不应判死", () => {
        const node = fieldNode("a", [
            { op: "$eq", value: 1 },
            { op: "$in", value: [2, 3] },
        ]);
        const r = normalizeFieldPredicateBundle(buildFieldPredicateBundleFromFieldNode(node), {});
        assert.equal(r.contradiction, false);
    });

    it("conservative：多个 $in 不做求交（仅保留/去重值）", () => {
        const node = fieldNode("a", [
            { op: "$in", value: [1, 2, 3] },
            { op: "$in", value: [2, 3, 4] },
        ]);
        const r = normalizeFieldPredicateBundle(buildFieldPredicateBundleFromFieldNode(node), {});
        assert.equal(r.changed, false);
        assert.equal(r.contradiction, false);
    });
});
