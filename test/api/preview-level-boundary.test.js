"use strict";

const assert = require("node:assert/strict");
const { normalizeQuery } = require("../../dist/index.js");
const { resetLevelPreviewConsoleStateForTests } = require("../../dist/observe/level-boundary-hints.js");

/** 与 formatPreviewOnlyWarningMessage 一致的前缀，避免绑定整句文案。 */
const PREVIEW_WARNING_PREFIX = "[mongo-query-normalizer]";

describe("api / preview level boundary (v0.1.0)", () => {
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
            assert.equal(meta.warnings.length, 0);
        } finally {
            console.warn = originalWarn;
        }
        assert.equal(warnCalls, 0);
    });

    it("predicate: meta.warnings 含边界提示（即使 collectWarnings 为 false）", () => {
        const { meta } = normalizeQuery({ a: 1 }, {
            level: "predicate",
            observe: { collectWarnings: false },
        });
        assert.ok(meta.warnings.length >= 1);
        assert.ok(meta.warnings.some((w) => w.startsWith(PREVIEW_WARNING_PREFIX)));
    });

    it("predicate in non-production: console.warn once per level for repeated calls", () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = "development";
        let warnCalls = 0;
        const originalWarn = console.warn;
        console.warn = (message) => {
            warnCalls += 1;
            assert.ok(typeof message === "string" && message.startsWith(PREVIEW_WARNING_PREFIX));
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
            assert.ok(meta.warnings.length >= 1);
            assert.ok(meta.warnings.some((w) => w.startsWith(PREVIEW_WARNING_PREFIX)));
            normalizeQuery({ b: 2 }, { level: "predicate" });
        } finally {
            console.warn = originalWarn;
            process.env.NODE_ENV = originalEnv;
        }
        assert.equal(warnCalls, 0);
    });
});
