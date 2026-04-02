"use strict";

const assert = require("node:assert/strict");
const { fieldNode } = require("../../../dist/ast/builders.js");
const { buildFieldPredicateBundleFromFieldNode } = require("../../../dist/predicate/ir/build-field-bundle.js");
const { normalizeFieldPredicateBundle } = require("../../../dist/predicate/normalize-field-predicate-bundle.js");

describe("predicate-capabilities / eq.range", () => {
    it("conservative：$eq 与 range 不判冲突（数组语义）", () => {
        const node = fieldNode("a", [
            { op: "$eq", value: 1 },
            { op: "$gt", value: 2 },
        ]);
        const r = normalizeFieldPredicateBundle(buildFieldPredicateBundleFromFieldNode(node), {});
        assert.equal(r.contradiction, false);
    });

    it("self-contradictory merged bounds：与 $eq 共存时仍不判 contradiction，仅规范 bounds", () => {
        const node = fieldNode("a", [
            { op: "$eq", value: 1 },
            { op: "$gt", value: 5 },
            { op: "$lt", value: 3 },
        ]);
        const r = normalizeFieldPredicateBundle(buildFieldPredicateBundleFromFieldNode(node), {});
        assert.equal(r.contradiction, false);
        const kinds = r.normalizedBundle.predicates.map((p) => p.kind).sort();
        assert.ok(kinds.includes("eq"));
        assert.ok(kinds.includes("gt") || kinds.includes("gte"));
        assert.ok(kinds.includes("lt") || kinds.includes("lte"));
    });
});
