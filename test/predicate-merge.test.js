"use strict";

/**
 * core/predicate-merge.ts 单元测试
 * 目的：仅在 $and 内同字段 FieldNode 合并（conditions 拼接）；非 $and 不变；顺序：同字段合并后按首次出现顺序 + others。
 */
const assert = require("node:assert/strict");
const { predicateMerge } = require("../dist/core/index.js");
const { ASTNodeBuilder } = require("../dist/ast/index.js");

const logical = ASTNodeBuilder.logical.bind(ASTNodeBuilder);
const field = ASTNodeBuilder.field.bind(ASTNodeBuilder);
const trueNode = ASTNodeBuilder.trueNode.bind(ASTNodeBuilder);
const falseNode = ASTNodeBuilder.falseNode.bind(ASTNodeBuilder);

describe("core/predicate-merge.ts", () => {
    describe("非 logical 节点原样返回", () => {
        it("FieldNode 原样返回", () => {
            const ast = field("a", [{ op: "$eq", value: 5 }]);
            const out = predicateMerge(ast);
            assert.deepStrictEqual(out, ast);
        });

        it("trueNode / falseNode 原样返回", () => {
            assert.deepStrictEqual(predicateMerge(trueNode()), { type: "true" });
            assert.deepStrictEqual(predicateMerge(falseNode()), { type: "false" });
        });
    });

    describe("$or / $nor 只递归不合并", () => {
        it("$or 内同字段不合并，结构不变", () => {
            const ast = logical("$or", [
                field("a", [{ op: "$eq", value: 1 }]),
                field("a", [{ op: "$eq", value: 2 }]),
            ]);
            const out = predicateMerge(ast);
            assert.strictEqual(out.type, "logical");
            assert.strictEqual(out.op, "$or");
            assert.strictEqual(out.children.length, 2);
            assert.deepStrictEqual(out.children[0].conditions, [{ op: "$eq", value: 1 }]);
            assert.deepStrictEqual(out.children[1].conditions, [{ op: "$eq", value: 2 }]);
        });
    });

    describe("$and 内同字段合并", () => {
        it("两个同字段 FieldNode 合并为一个，conditions 拼接", () => {
            const ast = logical("$and", [
                field("a", [{ op: "$eq", value: 1 }]),
                field("a", [{ op: "$gt", value: 0 }]),
            ]);
            const out = predicateMerge(ast);
            assert.strictEqual(out.type, "logical");
            assert.strictEqual(out.op, "$and");
            assert.strictEqual(out.children.length, 1);
            assert.strictEqual(out.children[0].type, "field");
            assert.strictEqual(out.children[0].field, "a");
            assert.deepStrictEqual(out.children[0].conditions, [
                { op: "$eq", value: 1 },
                { op: "$gt", value: 0 },
            ]);
        });

        it("三个同字段合并为一个，顺序保持", () => {
            const ast = logical("$and", [
                field("x", [{ op: "$gte", value: 0 }]),
                field("x", [{ op: "$lte", value: 100 }]),
                field("x", [{ op: "$ne", value: 50 }]),
            ]);
            const out = predicateMerge(ast);
            assert.strictEqual(out.children.length, 1);
            assert.strictEqual(out.children[0].field, "x");
            assert.strictEqual(out.children[0].conditions.length, 3);
            assert.strictEqual(out.children[0].conditions[0].op, "$gte");
            assert.strictEqual(out.children[0].conditions[1].op, "$lte");
            assert.strictEqual(out.children[0].conditions[2].op, "$ne");
        });

        it("多字段：a, a, b, a → 两个 FieldNode（a 合并，b 独立），顺序为 a 首次、b、others 无", () => {
            const ast = logical("$and", [
                field("a", [{ op: "$eq", value: 1 }]),
                field("a", [{ op: "$lt", value: 10 }]),
                field("b", [{ op: "$eq", value: 2 }]),
            ]);
            const out = predicateMerge(ast);
            assert.strictEqual(out.children.length, 2);
            assert.strictEqual(out.children[0].field, "a");
            assert.strictEqual(out.children[1].field, "b");
            assert.strictEqual(out.children[0].conditions.length, 2);
            assert.strictEqual(out.children[1].conditions.length, 1);
        });
    });

    describe("$and 内 field + logical 混合", () => {
        it("同字段合并后，others（logical）排在后面", () => {
            const ast = logical("$and", [
                field("a", [{ op: "$eq", value: 1 }]),
                logical("$or", [field("b", [{ op: "$eq", value: 2 }])]),
                field("a", [{ op: "$gt", value: 0 }]),
            ]);
            const out = predicateMerge(ast);
            assert.strictEqual(out.children.length, 2);
            assert.strictEqual(out.children[0].type, "field");
            assert.strictEqual(out.children[0].field, "a");
            assert.strictEqual(out.children[0].conditions.length, 2);
            assert.strictEqual(out.children[1].type, "logical");
            assert.strictEqual(out.children[1].op, "$or");
        });

        it("trueNode 作为 other 保留", () => {
            const ast = logical("$and", [
                field("a", [{ op: "$eq", value: 1 }]),
                trueNode(),
            ]);
            const out = predicateMerge(ast);
            assert.strictEqual(out.children.length, 2);
            assert.strictEqual(out.children[0].field, "a");
            assert.strictEqual(out.children[1].type, "true");
        });
    });

    describe("递归 predicateMerge", () => {
        it("嵌套 $and 内也做同字段合并", () => {
            const ast = logical("$and", [
                logical("$and", [
                    field("x", [{ op: "$eq", value: 1 }]),
                    field("x", [{ op: "$lt", value: 5 }]),
                ]),
            ]);
            const out = predicateMerge(ast);
            assert.strictEqual(out.children.length, 1);
            const inner = out.children[0];
            assert.strictEqual(inner.type, "logical");
            assert.strictEqual(inner.op, "$and");
            assert.strictEqual(inner.children.length, 1);
            assert.strictEqual(inner.children[0].field, "x");
            assert.strictEqual(inner.children[0].conditions.length, 2);
        });
    });

    describe("幂等性", () => {
        it("已合并的 $and 再 predicateMerge 结果一致", () => {
            const ast = logical("$and", [
                field("a", [{ op: "$eq", value: 1 }, { op: "$gt", value: 0 }]),
                field("b", [{ op: "$eq", value: 2 }]),
            ]);
            const once = predicateMerge(ast);
            const twice = predicateMerge(once);
            assert.strictEqual(twice.children.length, once.children.length);
            assert.deepStrictEqual(
                once.children.map((c) => c.type === "field" && c.field),
                twice.children.map((c) => c.type === "field" && c.field)
            );
        });
    });
});
