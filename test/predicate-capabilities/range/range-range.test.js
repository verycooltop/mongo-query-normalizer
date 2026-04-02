"use strict";

const assert = require("node:assert/strict");
const { fieldNode } = require("../../../dist/ast/builders.js");
const { buildFieldPredicateBundleFromFieldNode } = require("../../../dist/predicate/ir/build-field-bundle.js");
const { normalizeFieldPredicateBundle } = require("../../../dist/predicate/normalize-field-predicate-bundle.js");

describe("predicate-capabilities / range.range", () => {
    it("positive：多个 $gt 收紧", () => {
        const node = fieldNode("a", [
            { op: "$gt", value: 1 },
            { op: "$gt", value: 5 },
        ]);
        const r = normalizeFieldPredicateBundle(buildFieldPredicateBundleFromFieldNode(node), {});
        assert.ok(r.appliedCapabilities.includes("range.range"));
        const gt = r.normalizedBundle.predicates.find((p) => p.kind === "gt");
        assert.ok(gt);
        assert.equal(gt.value, 5);
    });

    it("conservative：$gt 与 $lt 不相交不判冲突（数组语义）", () => {
        const node = fieldNode("a", [
            { op: "$gt", value: 5 },
            { op: "$lt", value: 1 },
        ]);
        const r = normalizeFieldPredicateBundle(buildFieldPredicateBundleFromFieldNode(node), {});
        assert.equal(r.contradiction, false);
    });
});
