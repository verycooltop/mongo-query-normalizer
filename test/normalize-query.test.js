"use strict";

const assert = require("node:assert/strict");
const { normalizeQuery, resolveNormalizeOptions } = require("../dist/index.js");
const {
    formatPreviewOnlyWarningMessage,
    resetLevelPreviewConsoleStateForTests,
} = require("../dist/observe/level-boundary-hints.js");

/** 与编译 FalseNode 结果一致（不通过 public API 导出）。 */
const IMPOSSIBLE_SELECTOR = { $expr: { $eq: [1, 0] } };

describe("normalizeQuery / 管线", () => {
    it("默认 meta.level 为 shape", () => {
        const result = normalizeQuery({ a: 1 });
        assert.equal(result.meta.level, "shape");
    });

    it("空对象保持为空", () => {
        const { query, meta } = normalizeQuery({});
        assert.deepStrictEqual(query, {});
        assert.equal(meta.changed, false);
    });

    it("单字段字面量等价于 $eq", () => {
        const { query } = normalizeQuery({ a: 5 });
        assert.deepStrictEqual(query, { a: 5 });
    });

    it("predicate 层：$and 同名字段矛盾化为不可满足", () => {
        const { query } = normalizeQuery({ $and: [{ a: 1 }, { a: 2 }] }, { level: "predicate" });
        assert.deepStrictEqual(query, IMPOSSIBLE_SELECTOR);
    });

    it("shape 级别不跑谓词合并", () => {
        const { query, meta } = normalizeQuery({ $and: [{ a: 1 }, { a: 2 }] }, { level: "shape" });
        assert.notDeepStrictEqual(query, IMPOSSIBLE_SELECTOR);
        assert.equal(meta.level, "shape");
    });

    it("resolveNormalizeOptions 默认 level 为 shape", () => {
        const r = resolveNormalizeOptions({});
        assert.equal(r.level, "shape");
        assert.equal(r.rules.flattenLogical, true);
    });

    it("collectMetrics 时 meta.stats 存在", () => {
        const { meta } = normalizeQuery({ a: 1 }, { observe: { collectMetrics: true } });
        assert.ok(meta.stats);
        assert.ok(meta.stats.before.nodeCount >= 1);
        assert.ok(meta.stats.after.nodeCount >= 1);
    });

    it("顶层 $nor 变为 opaque 编译透传结构", () => {
        const { query } = normalizeQuery({ $nor: [{ a: 1 }] });
        assert.ok(Array.isArray(query.$nor));
    });
});

describe("preview level boundary (v0.1.0)", () => {
    afterEach(() => {
        resetLevelPreviewConsoleStateForTests();
    });

    it("default shape: no preview boundary warning and no console.warn", () => {
        let warnCalls = 0;
        const originalWarn = console.warn;
        console.warn = () => {
            warnCalls += 1;
        };
        try {
            const { meta } = normalizeQuery({ a: 1 });
            assert.equal(meta.level, "shape");
            assert.ok(!meta.warnings.some((w) => w.includes("preview-only")));
        } finally {
            console.warn = originalWarn;
        }
        assert.equal(warnCalls, 0);
    });

    it("predicate: meta.warnings includes boundary message even when collectWarnings is false", () => {
        const expected = formatPreviewOnlyWarningMessage("predicate");
        const { meta } = normalizeQuery({ a: 1 }, {
            level: "predicate",
            observe: { collectWarnings: false },
        });
        assert.ok(meta.warnings.includes(expected));
    });

    it("predicate in non-production: console.warn once per level for repeated calls", () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = "development";
        let warnCalls = 0;
        const originalWarn = console.warn;
        const expected = formatPreviewOnlyWarningMessage("predicate");
        console.warn = (message) => {
            warnCalls += 1;
            assert.equal(message, expected);
        };
        try {
            normalizeQuery({ a: 1 }, { level: "predicate" });
            normalizeQuery({ b: 2 }, { level: "predicate" });
        } finally {
            console.warn = originalWarn;
            process.env.NODE_ENV = originalEnv;
        }
        assert.equal(warnCalls, 1);
    });

    it("predicate in production: meta warning present but console.warn not used", () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = "production";
        let warnCalls = 0;
        const originalWarn = console.warn;
        console.warn = () => {
            warnCalls += 1;
        };
        try {
            const { meta } = normalizeQuery({ a: 1 }, { level: "predicate" });
            assert.ok(meta.warnings.includes(formatPreviewOnlyWarningMessage("predicate")));
            normalizeQuery({ b: 2 }, { level: "predicate" });
        } finally {
            console.warn = originalWarn;
            process.env.NODE_ENV = originalEnv;
        }
        assert.equal(warnCalls, 0);
    });
});
