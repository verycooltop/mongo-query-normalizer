"use strict";

/**
 * core/field-condition-normalize.ts 单元测试
 * 目的：同字段条件语义合并（$eq/$in/$nin/bounds/$exists）、冲突返回 impossible，
 * 与 pipeline 中 fieldConditionNormalize 行为一致。
 */
const assert = require("node:assert/strict");
const {
    normalizeFieldConditions,
    fieldConditionNormalize,
    normalizeFieldNode,
} = require("../dist/core/field-condition-normalize.js");
const { ASTNodeBuilder } = require("../dist/ast/index.js");
const { rewriteQuerySelector } = require("../dist/index.js");
const { IMPOSSIBLE_SELECTOR } = require("../dist/types.js");

function fc(op, value) {
    return { op, value };
}

describe("core/field-condition-normalize.ts", () => {
    describe("normalizeFieldConditions", () => {
        it("两个 $eq:5 合并为一个", () => {
            const result = normalizeFieldConditions([fc("$eq", 5), fc("$eq", 5)]);
            assert.ok("conditions" in result);
            assert.deepStrictEqual(result.conditions, [fc("$eq", 5)]);
        });

        it("$eq:5 与 $eq:6 冲突 → impossible", () => {
            const result = normalizeFieldConditions([fc("$eq", 5), fc("$eq", 6)]);
            assert.strictEqual("impossible" in result && result.impossible, true);
        });

        it("$in:[1,2] + $in:[2,3] → $in:[2]", () => {
            const result = normalizeFieldConditions([
                fc("$in", [1, 2]),
                fc("$in", [2, 3]),
            ]);
            assert.ok("conditions" in result);
            assert.deepStrictEqual(result.conditions, [fc("$in", [2])]);
        });

        it("$in:[1,2] + $in:[3,4] → impossible", () => {
            const result = normalizeFieldConditions([
                fc("$in", [1, 2]),
                fc("$in", [3, 4]),
            ]);
            assert.strictEqual("impossible" in result && result.impossible, true);
        });

        it("$eq:5 + $in:[5,6] → 只保留 $eq:5", () => {
            const result = normalizeFieldConditions([
                fc("$eq", 5),
                fc("$in", [5, 6]),
            ]);
            assert.ok("conditions" in result);
            assert.deepStrictEqual(result.conditions, [fc("$eq", 5)]);
        });

        it("$eq:5 + $in:[1,2] → impossible", () => {
            const result = normalizeFieldConditions([
                fc("$eq", 5),
                fc("$in", [1, 2]),
            ]);
            assert.strictEqual("impossible" in result && result.impossible, true);
        });

        it("$gt:5 + $gte:3 → 只保留 $gt:5", () => {
            const result = normalizeFieldConditions([
                fc("$gt", 5),
                fc("$gte", 3),
            ]);
            assert.ok("conditions" in result);
            assert.deepStrictEqual(result.conditions, [fc("$gt", 5)]);
        });

        it("$exists:true 与 $exists:false → impossible", () => {
            const result = normalizeFieldConditions([
                fc("$exists", true),
                fc("$exists", false),
            ]);
            assert.strictEqual("impossible" in result && result.impossible, true);
        });

        it("空数组 → conditions: []", () => {
            const result = normalizeFieldConditions([]);
            assert.ok("conditions" in result);
            assert.deepStrictEqual(result.conditions, []);
        });
    });

    describe("normalizeFieldNode", () => {
        it("冲突时返回 FalseNode", () => {
            const node = ASTNodeBuilder.field("a", [fc("$eq", 5), fc("$eq", 6)]);
            const out = normalizeFieldNode(node);
            assert.strictEqual(out.type, "false");
        });

        it("合并后返回新 FieldNode", () => {
            const node = ASTNodeBuilder.field("a", [fc("$in", [1, 2]), fc("$in", [2, 3])]);
            const out = normalizeFieldNode(node);
            assert.strictEqual(out.type, "field");
            assert.deepStrictEqual(out.conditions, [fc("$in", [2])]);
        });
    });

    describe("fieldConditionNormalize(ast)", () => {
        it("递归处理 $and 内 FieldNode", () => {
            const ast = ASTNodeBuilder.logical("$and", [
                ASTNodeBuilder.field("a", [fc("$in", [1, 2]), fc("$in", [2, 3])]),
                ASTNodeBuilder.field("b", [fc("$eq", 1)]),
            ]);
            const out = fieldConditionNormalize(ast);
            assert.strictEqual(out.type, "logical");
            const children = out.children;
            assert.strictEqual(children[0].type, "field");
            assert.deepStrictEqual(children[0].conditions, [fc("$in", [2])]);
            assert.deepStrictEqual(children[1].conditions, [fc("$eq", 1)]);
        });
    });

    describe("pipeline: rewriteQuerySelector 覆盖原 merge 语义", () => {
        it("同字段两 $eq 冲突 → IMPOSSIBLE_SELECTOR", () => {
            const sel = { $and: [{ a: 5 }, { a: 6 }] };
            const out = rewriteQuerySelector(sel);
            assert.deepStrictEqual(out, IMPOSSIBLE_SELECTOR);
        });

        it("同字段 $in 交集", () => {
            const sel = { $and: [{ a: { $in: [1, 2] } }, { a: { $in: [2, 3] } }] };
            const out = rewriteQuerySelector(sel);
            assert.deepStrictEqual(out, { a: { $in: [2] } });
        });

        it("$eq 与 $in 兼容保留 $eq", () => {
            const sel = { $and: [{ a: 5 }, { a: { $in: [5, 6] } }] };
            const out = rewriteQuerySelector(sel);
            assert.deepStrictEqual(out, { a: 5 });
        });
    });
});
