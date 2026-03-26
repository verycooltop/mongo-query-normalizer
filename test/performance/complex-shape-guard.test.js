"use strict";

const assert = require("node:assert/strict");
const { normalizeQuery } = require("../../dist/index.js");

function buildDeepAndChain(depth) {
    let q = { score: { $gte: 0 } };
    for (let i = 0; i < depth; i++) {
        q = { $and: [q, { archived: false }] };
    }
    return q;
}

function jsonSizeApprox(obj) {
    try {
        return JSON.stringify(obj).length;
    } catch {
        return Number.MAX_SAFE_INTEGER;
    }
}

function maxBranchingWidth(value) {
    let m = 0;
    function walk(x) {
        if (x === null || typeof x !== "object") {
            return;
        }
        if (Array.isArray(x)) {
            for (const y of x) {
                walk(y);
            }
            return;
        }
        const andc = x.$and;
        const orc = x.$or;
        if (Array.isArray(andc)) {
            m = Math.max(m, andc.length);
        }
        if (Array.isArray(orc)) {
            m = Math.max(m, orc.length);
        }
        for (const v of Object.values(x)) {
            if (v !== null && typeof v === "object") {
                walk(v);
            }
        }
    }
    walk(value);
    return m;
}

describe("performance / 复杂形状护栏（非计时）", function () {
    this.timeout(120000);

    it("深层 $and 链：不抛错、不栈溢出、输出体积相对输入不过度膨胀", function () {
        const raw = buildDeepAndChain(400);
        let out;
        assert.doesNotThrow(() => {
            out = normalizeQuery(raw, { level: "predicate" });
        });
        const ratio = jsonSizeApprox(out.query) / Math.max(1, jsonSizeApprox(raw));
        assert.ok(ratio < 5, `output grew too much: ratio=${ratio}`);
        const second = normalizeQuery(out.query, { level: "predicate" });
        assert.deepStrictEqual(second.query, out.query);
    });

    it("宽而浅的 $and：批量子句可完成 normalize", function () {
        const children = [];
        for (let i = 0; i < 80; i++) {
            children.push({ score: { $gte: i % 3 } });
        }
        const raw = { $and: children };
        assert.doesNotThrow(() => {
            const once = normalizeQuery(raw, { level: "predicate" });
            const twice = normalizeQuery(once.query, { level: "predicate" });
            assert.deepStrictEqual(twice.query, once.query);
        });
    });

    it("大量重复同字段范围子句：合并后任意 $and 宽度不应接近线性原样保留", function () {
        const children = Array.from({ length: 120 }, () => ({ score: { $gte: 10, $lte: 90 } }));
        const raw = { $and: children };
        let once;
        assert.doesNotThrow(() => {
            once = normalizeQuery(raw, { level: "predicate" });
        });
        const w = maxBranchingWidth(once.query);
        assert.ok(w < 40, `expected merged width << 120, got maxBranch=${w}`);
        assert.ok(jsonSizeApprox(once.query) < jsonSizeApprox(raw) * 2, "output json should shrink after merge");
        const twice = normalizeQuery(once.query, { level: "predicate" });
        assert.deepStrictEqual(twice.query, once.query);
    });

    it("pathological：多层重复 $and 包裹同一叶子，不栈溢出且宽度受控", function () {
        let inner = { priority: { $gte: 0 } };
        for (let i = 0; i < 250; i++) {
            inner = { $and: [inner, { archived: false }] };
        }
        assert.doesNotThrow(() => {
            const once = normalizeQuery(inner, { level: "predicate" });
            assert.ok(maxBranchingWidth(once.query) < 500);
            const twice = normalizeQuery(once.query, { level: "predicate" });
            assert.deepStrictEqual(twice.query, once.query);
        });
    });
});
