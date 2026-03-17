"use strict";

/**
 * 鲁棒性测试：非法入参不崩溃、边界值语义保持、不可满足形态唯一、compile 未知节点不返回 undefined。
 */
const assert = require("node:assert/strict");
const { rewriteQuerySelector } = require("../dist/index.js");
const { parseSelector } = require("../dist/operations/parse.js");
const { compileSelector } = require("../dist/operations/compile.js");
const { IMPOSSIBLE_SELECTOR } = require("./helpers/assertions.js");

describe("鲁棒性", () => {
    describe("parseSelector 非法入参不崩溃", () => {
        it("null 入参返回 trueNode，不抛错", () => {
            const out = parseSelector(null);
            assert.strictEqual(out.type, "true");
        });

        it("undefined 入参返回 trueNode，不抛错", () => {
            const out = parseSelector(undefined);
            assert.strictEqual(out.type, "true");
        });

        it("非对象（数字/字符串）返回 trueNode，不崩溃", () => {
            const out = parseSelector(123);
            assert.strictEqual(out.type, "true");
        });
    });

    describe("rewriteQuerySelector 非法入参", () => {
        it("undefined 或 null 返回空对象（等价 trueNode 编译结果）", () => {
            const outUndef = rewriteQuerySelector(undefined);
            const outNull = rewriteQuerySelector(null);
            assert.deepStrictEqual(outUndef, {});
            assert.deepStrictEqual(outNull, {});
        });
    });

    describe("$in:[] / $nin:[] 语义保持（Mongo 中 $in:[] 匹配零文档）", () => {
        it("优化后 $in:[] 仍为 $in:[] 或等价不可满足", () => {
            const query = { a: { $in: [] } };
            const out = rewriteQuerySelector(query);
            const isImpossible = out._id && out._id.$exists === false;
            const hasEmptyIn = out.a && Array.isArray(out.a.$in) && out.a.$in.length === 0;
            assert.ok(isImpossible || hasEmptyIn, "应保持 $in:[] 或编译为不可满足");
        });
    });

    describe("空字符串字段名", () => {
        it("parse 含空字符串 key 不崩溃", () => {
            const query = { "": 1 };
            const out = parseSelector(query);
            assert.ok(out.type === "field" || out.type === "logical");
            if (out.type === "field") assert.strictEqual(out.field, "");
        });
    });

    describe("compileSelector 未知节点类型不返回 undefined", () => {
        it("非法 type 时抛错，不返回 undefined", () => {
            const badNode = { type: "unknown", children: [] };
            assert.throws(
                () => compileSelector(badNode),
                /Unknown AST node type/
            );
        });
    });

    describe("不可满足选择器形态唯一", () => {
        it("所有“不可能”结果均为 _id: { $exists: false }", () => {
            const cases = [
                { $and: [{ a: 1 }, { a: 2 }] },
                { $and: [{ a: { $eq: 5 } }, { a: { $ne: 5 } }] },
            ];
            for (const query of cases) {
                const out = rewriteQuerySelector(query);
                assert.deepStrictEqual(out, IMPOSSIBLE_SELECTOR, "不可满足应统一为 IMPOSSIBLE_SELECTOR");
            }
        });
    });

    describe("幂等性多场景", () => {
        it("多组 query 二次 rewrite 结果不变", () => {
            const queries = [
                { a: 5 },
                { a: { $gt: 1, $lt: 10 } },
                { $or: [{ a: 1 }, { b: 2 }] },
            ];
            for (const query of queries) {
                const once = rewriteQuerySelector(query);
                const twice = rewriteQuerySelector(once);
                assert.deepStrictEqual(once, twice, `幂等失败: ${JSON.stringify(query)}`);
            }
        });
    });

    describe("大查询 / 深度嵌套不超时、不栈溢出", () => {
        it("100+ 条件 $and 在 5s 内完成", function () {
            this.timeout(5000);
            const clauses = [];
            for (let i = 0; i < 100; i++) {
                clauses.push({ ["f" + i]: i });
            }
            const query = { $and: clauses };
            const out = rewriteQuerySelector(query);
            assert.ok(out.$and || Object.keys(out).length >= 1);
        });

        it("20 层嵌套 $and 不栈溢出", function () {
            this.timeout(3000);
            let query = { x: 1 };
            for (let i = 0; i < 20; i++) {
                query = { $and: [query] };
            }
            const out = rewriteQuerySelector(query);
            assert.ok(out.x === 1 || (out.$and && out.$and.length >= 1));
        });
    });

    describe("语义等价：优化后不可满足即匹配零文档", () => {
        it("冲突 query 优化结果为 IMPOSSIBLE_SELECTOR，与 Mongo 匹配零文档一致", () => {
            const impossibleQueries = [
                { $and: [{ a: 1 }, { a: 2 }] },
                { $and: [{ a: { $in: [1, 2] } }, { a: { $eq: 3 } }] },
            ];
            for (const q of impossibleQueries) {
                const out = rewriteQuerySelector(q);
                assert.deepStrictEqual(out, IMPOSSIBLE_SELECTOR);
            }
        });
    });
});
