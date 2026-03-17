"use strict";

/**
 * core/conflicts.ts 单元测试
 * 目的：确保 hasConditionConflict 与 simplify 中 tightenChildConditionsByParent 的
 * impossible 判断一致；覆盖 valueEqual 相关分支（Date、ObjectId、数组、深对象、null）。
 */
const assert = require("node:assert/strict");
const { hasConditionConflict } = require("../dist/core/conflicts.js");
const { ASTNodeBuilder } = require("../dist/ast/index.js");
const { parseSelector } = require("../dist/operations/parse.js");
const { makeObjectIdLike } = require("./helpers/assertions.js");

const field = ASTNodeBuilder.field.bind(ASTNodeBuilder);

describe("core/conflicts.ts", () => {
    describe("1.1 基础冲突：$eq vs $ne", () => {
        it("$eq:5 与 $ne:5 → 冲突 true", () => {
            const parent = [{ op: "$eq", value: 5 }];
            const child = [{ op: "$ne", value: 5 }];
            assert.strictEqual(hasConditionConflict(parent, child), true);
        });

        it("$eq:5 与 $ne:6 → 不冲突 false", () => {
            const parent = [{ op: "$eq", value: 5 }];
            const child = [{ op: "$ne", value: 6 }];
            assert.strictEqual(hasConditionConflict(parent, child), false);
        });
    });

    describe("1.2 数值范围冲突", () => {
        it("$gt:10 + $lt:5 → 冲突 true", () => {
            const parent = [{ op: "$gt", value: 10 }];
            const child = [{ op: "$lt", value: 5 }];
            assert.strictEqual(hasConditionConflict(parent, child), true);
        });

        it("$gte:5 + $lte:5 且非双 inclusive（$gte:5 与 $lt:5）→ 冲突", () => {
            const parent = [{ op: "$gte", value: 5 }];
            const child = [{ op: "$lt", value: 5 }];
            assert.strictEqual(hasConditionConflict(parent, child), true);
        });

        it("$gte:5 + $lte:5 双 inclusive → 不冲突（同值可满足）", () => {
            const parent = [{ op: "$gte", value: 5 }];
            const child = [{ op: "$lte", value: 5 }];
            assert.strictEqual(hasConditionConflict(parent, child), false);
        });

        it("$gt:5 + $lte:5 → 冲突 true（无交集）", () => {
            const parent = [{ op: "$gt", value: 5 }];
            const child = [{ op: "$lte", value: 5 }];
            assert.strictEqual(hasConditionConflict(parent, child), true);
        });

        it("$gt:3 + $lt:10 → 不冲突", () => {
            const parent = [{ op: "$gt", value: 3 }];
            const child = [{ op: "$lt", value: 10 }];
            assert.strictEqual(hasConditionConflict(parent, child), false);
        });
    });

    describe("1.3 $in / $eq 与 $nin 冲突", () => {
        it("$in:[1,2] vs $eq:3 → 冲突 true", () => {
            const parent = [{ op: "$in", value: [1, 2] }];
            const child = [{ op: "$eq", value: 3 }];
            assert.strictEqual(hasConditionConflict(parent, child), true);
        });

        it("$eq:5 vs $nin:[5] → 冲突 true", () => {
            const parent = [{ op: "$eq", value: 5 }];
            const child = [{ op: "$nin", value: [5] }];
            assert.strictEqual(hasConditionConflict(parent, child), true);
        });

        it("$eq:5 vs $nin:[1,2] → 不冲突", () => {
            const parent = [{ op: "$eq", value: 5 }];
            const child = [{ op: "$nin", value: [1, 2] }];
            assert.strictEqual(hasConditionConflict(parent, child), false);
        });

        it("$in:[1,2] vs $eq:2 → 不冲突", () => {
            const parent = [{ op: "$in", value: [1, 2] }];
            const child = [{ op: "$eq", value: 2 }];
            assert.strictEqual(hasConditionConflict(parent, child), false);
        });
    });

    describe("1.4 $exists:false 与“要求字段存在”的条件冲突", () => {
        it("$exists:false vs $eq:5 → 冲突 true", () => {
            const parent = [{ op: "$exists", value: false }];
            const child = [{ op: "$eq", value: 5 }];
            assert.strictEqual(hasConditionConflict(parent, child), true);
        });

        it("$exists:false vs $in:[1,2] → 冲突 true", () => {
            const parent = [{ op: "$exists", value: false }];
            const child = [{ op: "$in", value: [1, 2] }];
            assert.strictEqual(hasConditionConflict(parent, child), true);
        });

        it("$exists:false vs $gt:10 → 冲突 true", () => {
            const parent = [{ op: "$exists", value: false }];
            const child = [{ op: "$gt", value: 10 }];
            assert.strictEqual(hasConditionConflict(parent, child), true);
        });

        it("$exists:false vs $gte/ $lt/ $lte → 冲突 true", () => {
            assert.strictEqual(
                hasConditionConflict([{ op: "$exists", value: false }], [{ op: "$gte", value: 0 }]),
                true
            );
            assert.strictEqual(
                hasConditionConflict([{ op: "$exists", value: false }], [{ op: "$lt", value: 100 }]),
                true
            );
            assert.strictEqual(
                hasConditionConflict([{ op: "$exists", value: false }], [{ op: "$lte", value: 0 }]),
                true
            );
        });

        it("$exists:false vs $ne:5 → 不冲突（Mongo 中 $ne 对缺失字段同样视为满足）", () => {
            const parent = [{ op: "$exists", value: false }];
            const child = [{ op: "$ne", value: 5 }];
            assert.strictEqual(hasConditionConflict(parent, child), false);
        });
    });

    describe("1.5 $exists 与 $eq:null / undefined 关系", () => {
        it("$exists:true 与 $eq:null → 不冲突（存在且为 null 仍可满足）", () => {
            const parent = [{ op: "$exists", value: true }];
            const child = [{ op: "$eq", value: null }];
            assert.strictEqual(hasConditionConflict(parent, child), false);
        });

        it("$eq:null 与 $exists:true → 不冲突（反向）", () => {
            const parent = [{ op: "$eq", value: null }];
            const child = [{ op: "$exists", value: true }];
            assert.strictEqual(hasConditionConflict(parent, child), false);
        });

        it("$exists:true 与 $eq:undefined → 冲突（undefined 视作字段缺失）", () => {
            const parent = [{ op: "$exists", value: true }];
            const child = [{ op: "$eq", value: undefined }];
            assert.strictEqual(hasConditionConflict(parent, child), true);
        });

        it("$exists:false 与 $eq:undefined → 不冲突", () => {
            const parent = [{ op: "$exists", value: false }];
            const child = [{ op: "$eq", value: undefined }];
            assert.strictEqual(hasConditionConflict(parent, child), false);
        });
    });

    describe("1.6 相同条件不冲突", () => {
        it("两个完全一样的 $gte:5 → false", () => {
            const parent = [{ op: "$gte", value: 5 }];
            const child = [{ op: "$gte", value: 5 }];
            assert.strictEqual(hasConditionConflict(parent, child), false);
        });

        it("两个 $eq:5 → false", () => {
            const parent = [{ op: "$eq", value: 5 }];
            const child = [{ op: "$eq", value: 5 }];
            assert.strictEqual(hasConditionConflict(parent, child), false);
        });
    });

    describe("1.7 unsupported op 永远不冲突", () => {
        it("$regex 与 $eq 不判定冲突", () => {
            const parent = [{ op: "$regex", value: "x" }];
            const child = [{ op: "$eq", value: 5 }];
            assert.strictEqual(hasConditionConflict(parent, child), false);
        });

        it("$regex 与 $regex 不判定冲突", () => {
            const parent = [{ op: "$regex", value: "a" }];
            const child = [{ op: "$regex", value: "b" }];
            assert.strictEqual(hasConditionConflict(parent, child), false);
        });
    });

    describe("1.8 空数组 / undefined conditions → false", () => {
        it("parent 空、child 有条件 → 不冲突", () => {
            assert.strictEqual(hasConditionConflict([], [{ op: "$eq", value: 5 }]), false);
        });

        it("parent 有条件、child 空 → 不冲突", () => {
            assert.strictEqual(hasConditionConflict([{ op: "$eq", value: 5 }], []), false);
        });

        it("两边都空 → 不冲突", () => {
            assert.strictEqual(hasConditionConflict([], []), false);
        });
    });

    describe("1.9 ObjectId / Date 冲突检测（valueEqual）", () => {
        it("Date 相等则不冲突", () => {
            const d = new Date(1000);
            const parent = [{ op: "$eq", value: d }];
            const child = [{ op: "$eq", value: new Date(1000) }];
            assert.strictEqual(hasConditionConflict(parent, child), false);
        });

        it("Date 不等则冲突", () => {
            const parent = [{ op: "$eq", value: new Date(1000) }];
            const child = [{ op: "$eq", value: new Date(2000) }];
            assert.strictEqual(hasConditionConflict(parent, child), true);
        });

        it("ObjectId-like（toHexString）相等则不冲突", () => {
            const oid = makeObjectIdLike("507f191e810c19729de860ea");
            const parent = [{ op: "$eq", value: oid }];
            const child = [{ op: "$eq", value: makeObjectIdLike("507f191e810c19729de860ea") }];
            assert.strictEqual(hasConditionConflict(parent, child), false);
        });

        it("ObjectId-like 不等则冲突", () => {
            const parent = [{ op: "$eq", value: makeObjectIdLike("507f191e810c19729de860ea") }];
            const child = [{ op: "$eq", value: makeObjectIdLike("507f191e810c19729de860eb") }];
            assert.strictEqual(hasConditionConflict(parent, child), true);
        });

        it("$oid EJSON 与 ObjectId-like 相等则不冲突", () => {
            const oid = makeObjectIdLike("507f191e810c19729de860ea");
            const ejson = { $oid: "507f191e810c19729de860ea" };
            const parent = [{ op: "$eq", value: oid }];
            const child = [{ op: "$eq", value: ejson }];
            assert.strictEqual(hasConditionConflict(parent, child), false);
        });

        it("数组值用 valueEqual：相等不冲突", () => {
            const arr = [1, 2];
            const parent = [{ op: "$eq", value: arr }];
            const child = [{ op: "$eq", value: [1, 2] }];
            assert.strictEqual(hasConditionConflict(parent, child), false);
        });

        it("数组值不等则冲突", () => {
            const parent = [{ op: "$eq", value: [1, 2] }];
            const child = [{ op: "$eq", value: [1, 2, 3] }];
            assert.strictEqual(hasConditionConflict(parent, child), true);
        });

        it("深对象 valueEqual 相等不冲突", () => {
            const obj = { a: 1, b: { c: 2 } };
            const parent = [{ op: "$eq", value: obj }];
            const child = [{ op: "$eq", value: { a: 1, b: { c: 2 } } }];
            assert.strictEqual(hasConditionConflict(parent, child), false);
        });

        it("null 与 null 不冲突", () => {
            const parent = [{ op: "$eq", value: null }];
            const child = [{ op: "$eq", value: null }];
            assert.strictEqual(hasConditionConflict(parent, child), false);
        });
    });

    describe("1.10 $ne 与 $exists / $in 互斥规则补充", () => {
        it("$ne:null 与 $exists:false → 冲突（$ne:null 要求字段存在且非 null）", () => {
            const parent = [{ op: "$ne", value: null }];
            const child = [{ op: "$exists", value: false }];
            assert.strictEqual(hasConditionConflict(parent, child), true);
        });

        it("$ne:null 与 $exists:true → 不冲突", () => {
            const parent = [{ op: "$ne", value: null }];
            const child = [{ op: "$exists", value: true }];
            assert.strictEqual(hasConditionConflict(parent, child), false);
        });

        it("$ne:null 与 $eq:null → 冲突", () => {
            const parent = [{ op: "$ne", value: null }];
            const child = [{ op: "$eq", value: null }];
            assert.strictEqual(hasConditionConflict(parent, child), true);
        });

        it("$ne:5 vs $in:[3,5,7] → 冲突（$in 候选只包含被排除值）", () => {
            const parent = [{ op: "$ne", value: 5 }];
            const child = [{ op: "$in", value: [5] }];
            assert.strictEqual(hasConditionConflict(parent, child), true);
        });

        it("$ne:5 vs $in:[3,7] → 不冲突", () => {
            const parent = [{ op: "$ne", value: 5 }];
            const child = [{ op: "$in", value: [3, 7] }];
            assert.strictEqual(hasConditionConflict(parent, child), false);
        });

        it("$ne:5 vs $nin:[3,5,7] → 不冲突（始终可能存在交集）", () => {
            const parent = [{ op: "$ne", value: 5 }];
            const child = [{ op: "$nin", value: [3, 5, 7] }];
            assert.strictEqual(hasConditionConflict(parent, child), false);
        });
    });

});
