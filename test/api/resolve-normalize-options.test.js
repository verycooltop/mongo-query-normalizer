"use strict";

const assert = require("node:assert/strict");
const { resolveNormalizeOptions } = require("../../dist/index.js");

describe("api / resolveNormalizeOptions", () => {
    it("默认 level 为 shape", () => {
        const r = resolveNormalizeOptions({});
        assert.equal(r.level, "shape");
        assert.equal(r.rules.flattenLogical, true);
    });

    it("各 level 挂载对应默认 rules 标志", () => {
        const shape = resolveNormalizeOptions({ level: "shape" });
        assert.equal(shape.rules.dedupeSameFieldPredicates, false);
        assert.equal(shape.rules.detectCommonPredicatesInOr, false);
        assert.equal(shape.rules.hoistCommonPredicatesFromOr, false);

        const predicate = resolveNormalizeOptions({ level: "predicate" });
        assert.equal(predicate.rules.dedupeSameFieldPredicates, true);
        assert.equal(predicate.rules.collapseContradictions, true);
        assert.equal(predicate.rules.detectCommonPredicatesInOr, false);
        assert.equal(predicate.rules.hoistCommonPredicatesFromOr, false);

        const logical = resolveNormalizeOptions({ level: "logical" });
        assert.equal(logical.rules.detectCommonPredicatesInOr, true);
        assert.equal(logical.rules.hoistCommonPredicatesFromOr, false);

        const experimental = resolveNormalizeOptions({ level: "experimental" });
        assert.equal(experimental.rules.detectCommonPredicatesInOr, true);
        assert.equal(experimental.rules.hoistCommonPredicatesFromOr, true);
    });

    it("rules 与 level 默认 merge：显式 false 覆盖默认 true", () => {
        const r = resolveNormalizeOptions({
            level: "predicate",
            rules: { dedupeSameFieldPredicates: false },
        });
        assert.equal(r.rules.dedupeSameFieldPredicates, false);
        assert.equal(r.rules.mergeComparablePredicates, true);
    });

    it("safety 与默认 merge", () => {
        const r = resolveNormalizeOptions({ safety: { maxNormalizeDepth: 99 } });
        assert.equal(r.safety.maxNormalizeDepth, 99);
        assert.equal(typeof r.safety.maxNodeGrowthRatio, "number");
    });

    it("observe 与默认 merge", () => {
        const r = resolveNormalizeOptions({ observe: { collectMetrics: true } });
        assert.equal(r.observe.collectMetrics, true);
        assert.equal(r.observe.collectWarnings, true);
    });
});
