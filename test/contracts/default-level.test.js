"use strict";

const assert = require("node:assert/strict");
const { normalizeQuery } = require("../../dist/index.js");

describe("contracts / default level", () => {
    it("normalizeQuery(query) 等价于显式 level shape", () => {
        const query = { $and: [{ a: 1 }, { b: 2 }] };
        const implicit = normalizeQuery(query);
        const explicit = normalizeQuery(query, { level: "shape" });
        assert.deepStrictEqual(implicit.query, explicit.query);
    });

    it("默认 meta.level 为 shape", () => {
        const result = normalizeQuery({ a: 1 });
        assert.equal(result.meta.level, "shape");
    });
});
