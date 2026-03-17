"use strict";

/**
 * Property-based 测试：随机 selector 验证 rewrite 的幂等性。
 */
const assert = require("node:assert/strict");

const { fc, selectorArb } = require("../helpers/arbitraries.js");
const { rewriteQuerySelector } = require("../../dist/index.js");

describe("property-based: random selectors", () => {
    it("rewrite 在有限步内收敛为稳定形态（rewrite^3(q) === rewrite^2(q)）", function () {
        this.timeout(15000);
        fc.assert(
            fc.property(selectorArb(3), (query) => {
                const once = rewriteQuerySelector(query);
                const twice = rewriteQuerySelector(once);
                const thrice = rewriteQuerySelector(twice);
                assert.deepStrictEqual(thrice, twice);
            }),
            { numRuns: 100 }
        );
    });
});

