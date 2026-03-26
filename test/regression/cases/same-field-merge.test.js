"use strict";

/**
 * 同字段复杂合并：拦截 mergeComparable / dedupe / 矛盾折叠 在边界上改变 Mongo 语义或破坏幂等。
 * 分类：范围、集合、exists+null、$and 打散顺序、标量 vs 算子对象、重复子句与冗余嵌套。
 */

const { ObjectId } = require("mongodb");
const { getTestCollection, clearTestCollection } = require("../../helpers/mongo-fixture.js");
const { assertSemanticEquivalence } = require("../../helpers/assert-semantic-equivalence.js");

describe("regression / cases · 同字段合并", function () {
    this.timeout(90000);

    const seed = 42;

    function baseDoc(overrides) {
        return {
            _id: new ObjectId(),
            score: 50,
            priority: 2,
            archived: false,
            ownerId: 1,
            createdAt: new Date("2024-03-01T00:00:00.000Z"),
            status: "open",
            tags: ["alpha"],
            profile: { level: 5, region: "us" },
            ...overrides,
        };
    }

    it("范围：$gt+$gte+$lt+$lte 同对象合并后仍与 Mongo 一致", async function () {
        const coll = getTestCollection();
        await clearTestCollection();
        const hit = baseDoc({ score: 25 });
        const low = baseDoc({ _id: new ObjectId(), score: 5 });
        const high = baseDoc({ _id: new ObjectId(), score: 95 });
        await coll.insertMany([hit, low, high]);

        await assertSemanticEquivalence({
            collection: coll,
            rawQuery: { score: { $gt: 10, $gte: 9, $lt: 80, $lte: 90 } },
            normalizeOptions: { level: "predicate" },
            sort: { score: 1, _id: 1 },
            skip: 0,
            limit: 10,
            seed,
            docs: [hit, low, high],
        });
    });

    it("范围：冗余上下界（$gte 与 $gt 同时收紧）normalize 不改变命中集", async function () {
        const coll = getTestCollection();
        await clearTestCollection();
        const docs = [baseDoc({ score: 30 }), baseDoc({ _id: new ObjectId(), score: 15 })];
        await coll.insertMany(docs);

        await assertSemanticEquivalence({
            collection: coll,
            rawQuery: { $and: [{ score: { $gte: 10 } }, { score: { $gt: 20 } }] },
            normalizeOptions: { level: "predicate" },
            sort: { score: -1, _id: 1 },
            skip: 0,
            limit: 5,
            seed,
            docs,
        });
    });

    it("范围：表面可满足但实际矛盾（$gt 与 $lt 互斥）应整查询不可满足且 normalize 前后一致", async function () {
        const coll = getTestCollection();
        await clearTestCollection();
        const d1 = baseDoc({ score: 50 });
        const d2 = baseDoc({ _id: new ObjectId(), score: 3 });
        await coll.insertMany([d1, d2]);

        await assertSemanticEquivalence({
            collection: coll,
            rawQuery: { score: { $gt: 40, $lt: 10 } },
            normalizeOptions: { level: "predicate" },
            sort: { _id: 1 },
            skip: 0,
            limit: 20,
            seed,
            docs: [d1, d2],
        });
    });

    it("集合：$in + $nin 同字段分散在 $and 中", async function () {
        const coll = getTestCollection();
        await clearTestCollection();
        const open = baseDoc({ status: "open" });
        const closed = baseDoc({ _id: new ObjectId(), status: "closed" });
        const draft = baseDoc({ _id: new ObjectId(), status: "draft" });
        await coll.insertMany([open, closed, draft]);

        await assertSemanticEquivalence({
            collection: coll,
            rawQuery: {
                $and: [{ status: { $in: ["open", "closed"] } }, { status: { $nin: ["draft"] } }],
            },
            normalizeOptions: { level: "predicate" },
            sort: { status: 1, _id: 1 },
            skip: 0,
            limit: 10,
            seed,
            docs: [open, closed, draft],
        });
    });

    it("集合：$in 含多值 + $eq 收窄为单值", async function () {
        const coll = getTestCollection();
        await clearTestCollection();
        const d1 = baseDoc({ status: "open" });
        const d2 = baseDoc({ _id: new ObjectId(), status: "closed" });
        await coll.insertMany([d1, d2]);

        await assertSemanticEquivalence({
            collection: coll,
            rawQuery: { $and: [{ status: { $in: ["open", "closed", "draft"] } }, { status: "open" }] },
            normalizeOptions: { level: "predicate" },
            sort: { _id: 1 },
            skip: 0,
            limit: 5,
            seed,
            docs: [d1, d2],
        });
    });

    it("集合：$nin + $ne 叠加（防合并时扩大/缩小集合）", async function () {
        const coll = getTestCollection();
        await clearTestCollection();
        const a = baseDoc({ priority: 1 });
        const b = baseDoc({ _id: new ObjectId(), priority: 2 });
        const c = baseDoc({ _id: new ObjectId(), priority: 3 });
        await coll.insertMany([a, b, c]);

        await assertSemanticEquivalence({
            collection: coll,
            rawQuery: { $and: [{ priority: { $nin: [0, 4] } }, { priority: { $ne: 2 } }] },
            normalizeOptions: { level: "predicate" },
            sort: { priority: 1, _id: 1 },
            skip: 0,
            limit: 10,
            seed,
            docs: [a, b, c],
        });
    });

    it("存在性：$exists:true + $eq:null 仅匹配「字段存在且为 null」", async function () {
        const coll = getTestCollection();
        await clearTestCollection();
        const explicitNull = baseDoc({ status: null });
        const missingStatus = baseDoc({ _id: new ObjectId() });
        delete missingStatus.status;
        await coll.insertMany([explicitNull, missingStatus]);

        await assertSemanticEquivalence({
            collection: coll,
            rawQuery: { $and: [{ status: { $exists: true } }, { status: null }] },
            normalizeOptions: { level: "predicate" },
            sort: { _id: 1 },
            skip: 0,
            limit: 10,
            seed,
            docs: [explicitNull, missingStatus],
        });
    });

    it("存在性：$exists:true + $ne:null（字段缺失 / null / 标量 三类文档）", async function () {
        const coll = getTestCollection();
        await clearTestCollection();
        const miss = baseDoc({ _id: new ObjectId() });
        delete miss.priority;
        const nul = baseDoc({ _id: new ObjectId(), priority: null });
        const num = baseDoc({ _id: new ObjectId(), priority: 2 });
        await coll.insertMany([miss, nul, num]);

        await assertSemanticEquivalence({
            collection: coll,
            rawQuery: { $and: [{ priority: { $exists: true } }, { priority: { $ne: null } }] },
            normalizeOptions: { level: "predicate" },
            sort: { _id: 1 },
            skip: 0,
            limit: 10,
            seed,
            docs: [miss, nul, num],
        });
    });

    it("同字段拆在 $and 多子句：故意打乱顺序", async function () {
        const coll = getTestCollection();
        await clearTestCollection();
        const docs = [baseDoc({ score: 40 }), baseDoc({ _id: new ObjectId(), score: 60 })];
        await coll.insertMany(docs);

        await assertSemanticEquivalence({
            collection: coll,
            rawQuery: {
                $and: [{ score: { $lte: 70 } }, { score: { $gte: 30 } }, { score: { $ne: 55 } }],
            },
            normalizeOptions: { level: "predicate" },
            sort: { score: 1, _id: 1 },
            skip: 0,
            limit: 10,
            seed,
            docs,
        });
    });

    it("标量等值 vs 显式 $eq：语义须一致", async function () {
        const coll = getTestCollection();
        await clearTestCollection();
        const docs = [baseDoc({ ownerId: 42 }), baseDoc({ _id: new ObjectId(), ownerId: 43 })];
        await coll.insertMany(docs);

        await assertSemanticEquivalence({
            collection: coll,
            rawQuery: { $and: [{ ownerId: 42 }, { ownerId: { $eq: 42 } }] },
            normalizeOptions: { level: "predicate" },
            sort: { ownerId: 1, _id: 1 },
            skip: 0,
            limit: 5,
            seed,
            docs,
        });
    });

    it("重复子句 + 冗余 $and 嵌套：合并与去层后结果集不变", async function () {
        const coll = getTestCollection();
        await clearTestCollection();
        const docs = [baseDoc({ archived: false }), baseDoc({ _id: new ObjectId(), archived: true })];
        await coll.insertMany(docs);

        await assertSemanticEquivalence({
            collection: coll,
            rawQuery: {
                $and: [
                    { $and: [{ archived: false }, { archived: { $eq: false } }] },
                    { archived: false },
                ],
            },
            normalizeOptions: { level: "predicate" },
            sort: { _id: 1 },
            skip: 0,
            limit: 10,
            seed,
            docs,
        });
    });
});
