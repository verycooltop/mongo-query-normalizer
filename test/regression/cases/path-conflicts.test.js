"use strict";

/**
 * 路径冲突：父路径与子路径（点记法）同时出现时，normalize 不得改变 Mongo 匹配与排序后的 _id 顺序。
 * 中间节点为缺失 / null / 标量 / 数组 / 对象时，以 mongodb-memory-server 行为为准。
 */

const { ObjectId } = require("mongodb");
const { getTestCollection, clearTestCollection } = require("../../helpers/mongo-fixture.js");
const { assertSemanticEquivalence } = require("../../helpers/assert-semantic-equivalence.js");

describe("regression / cases · 路径冲突", function () {
    this.timeout(90000);

    const seed = 42;

    it("a 与 a.b：子文档同时满足父对象与点路径（Mongo：二者同时约束同一嵌套结构）", async function () {
        const coll = getTestCollection();
        await clearTestCollection();
        const match = {
            _id: new ObjectId(),
            score: 1,
            archived: false,
            ownerId: 1,
            createdAt: new Date("2024-01-01T00:00:00.000Z"),
            a: { b: 7 },
        };
        const wrongB = {
            _id: new ObjectId(),
            score: 2,
            archived: false,
            ownerId: 2,
            createdAt: new Date("2024-01-02T00:00:00.000Z"),
            a: { b: 99 },
        };
        await coll.insertMany([match, wrongB]);

        await assertSemanticEquivalence({
            collection: coll,
            rawQuery: { $and: [{ a: { b: 7 } }, { "a.b": 7 }] },
            normalizeOptions: { level: "predicate" },
            sort: { score: 1, _id: 1 },
            skip: 0,
            limit: 10,
            seed,
            docs: [match, wrongB],
        });
    });

    it("a.b 与 a.b.c：更深层点路径与中间对象共存", async function () {
        const coll = getTestCollection();
        await clearTestCollection();
        const ok = {
            _id: new ObjectId(),
            score: 0,
            archived: false,
            ownerId: 1,
            createdAt: new Date("2024-02-01T00:00:00.000Z"),
            a: { b: { c: 2 } },
        };
        const bad = {
            _id: new ObjectId(),
            score: 1,
            archived: false,
            ownerId: 2,
            createdAt: new Date("2024-02-02T00:00:00.000Z"),
            a: { b: { c: 9 } },
        };
        await coll.insertMany([ok, bad]);

        await assertSemanticEquivalence({
            collection: coll,
            rawQuery: { $and: [{ "a.b": { c: 2 } }, { "a.b.c": 2 }] },
            normalizeOptions: { level: "predicate" },
            sort: { ownerId: -1, _id: 1 },
            skip: 0,
            limit: 5,
            seed,
            docs: [ok, bad],
        });
    });

    it("profile 与 profile.level：对象前缀与点路径同现", async function () {
        const coll = getTestCollection();
        await clearTestCollection();
        const d1 = {
            _id: new ObjectId(),
            score: 10,
            archived: false,
            ownerId: 3,
            createdAt: new Date("2024-03-01T00:00:00.000Z"),
            profile: { level: 4, region: "us" },
        };
        const d2 = {
            _id: new ObjectId(),
            score: 11,
            archived: false,
            ownerId: 4,
            createdAt: new Date("2024-03-02T00:00:00.000Z"),
            profile: { level: 9, region: "us" },
        };
        await coll.insertMany([d1, d2]);

        await assertSemanticEquivalence({
            collection: coll,
            rawQuery: { $and: [{ profile: { level: 4, region: "us" } }, { "profile.level": 4 }] },
            normalizeOptions: { level: "predicate" },
            sort: { score: -1, _id: 1 },
            skip: 0,
            limit: 10,
            seed,
            docs: [d1, d2],
        });
    });

    it("profile.level 与 profile.meta.rank：跨层路径组合", async function () {
        const coll = getTestCollection();
        await clearTestCollection();
        const hit = {
            _id: new ObjectId(),
            score: 5,
            archived: false,
            ownerId: 10,
            createdAt: new Date("2024-04-01T00:00:00.000Z"),
            profile: { level: 2, region: "emea", meta: { rank: 50 } },
        };
        const missRank = {
            _id: new ObjectId(),
            score: 6,
            archived: false,
            ownerId: 11,
            createdAt: new Date("2024-04-02T00:00:00.000Z"),
            profile: { level: 2, region: "emea", meta: { rank: 1 } },
        };
        await coll.insertMany([hit, missRank]);

        await assertSemanticEquivalence({
            collection: coll,
            rawQuery: { $and: [{ "profile.level": 2 }, { "profile.meta.rank": { $gte: 40 } }] },
            normalizeOptions: { level: "predicate" },
            sort: { "profile.meta.rank": -1, _id: 1 },
            skip: 0,
            limit: 10,
            seed,
            docs: [hit, missRank],
        });
    });

    it("中间节点缺失：a 不存在时点路径 a.b 与父键 a 的合取", async function () {
        const coll = getTestCollection();
        await clearTestCollection();
        const noA = {
            _id: new ObjectId(),
            score: 1,
            archived: false,
            ownerId: 1,
            createdAt: new Date("2024-05-01T00:00:00.000Z"),
        };
        const hasA = {
            _id: new ObjectId(),
            score: 2,
            archived: false,
            ownerId: 2,
            createdAt: new Date("2024-05-02T00:00:00.000Z"),
            a: { b: 1 },
        };
        await coll.insertMany([noA, hasA]);

        await assertSemanticEquivalence({
            collection: coll,
            rawQuery: { $and: [{ a: { b: 1 } }, { "a.b": 1 }] },
            normalizeOptions: { level: "predicate" },
            sort: { ownerId: 1, _id: 1 },
            skip: 0,
            limit: 10,
            seed,
            docs: [noA, hasA],
        });
    });

    it("中间节点 null：Mongo 将 null 视为类型化值，子路径通常无法同时满足对象子句", async function () {
        const coll = getTestCollection();
        await clearTestCollection();
        const aNull = {
            _id: new ObjectId(),
            score: 0,
            archived: false,
            ownerId: 1,
            createdAt: new Date("2024-06-01T00:00:00.000Z"),
            a: null,
        };
        const aObj = {
            _id: new ObjectId(),
            score: 1,
            archived: false,
            ownerId: 2,
            createdAt: new Date("2024-06-02T00:00:00.000Z"),
            a: { b: 3 },
        };
        await coll.insertMany([aNull, aObj]);

        await assertSemanticEquivalence({
            collection: coll,
            rawQuery: { $and: [{ a: { b: 3 } }, { "a.b": 3 }] },
            normalizeOptions: { level: "predicate" },
            sort: { score: 1, _id: 1 },
            skip: 0,
            limit: 10,
            seed,
            docs: [aNull, aObj],
        });
    });

    it("中间节点标量：a 为数字时点路径 a.b 不参与匹配", async function () {
        const coll = getTestCollection();
        await clearTestCollection();
        const scalar = {
            _id: new ObjectId(),
            score: 0,
            archived: false,
            ownerId: 1,
            createdAt: new Date("2024-07-01T00:00:00.000Z"),
            a: 5,
        };
        const nested = {
            _id: new ObjectId(),
            score: 1,
            archived: false,
            ownerId: 2,
            createdAt: new Date("2024-07-02T00:00:00.000Z"),
            a: { b: 5 },
        };
        await coll.insertMany([scalar, nested]);

        await assertSemanticEquivalence({
            collection: coll,
            rawQuery: { $and: [{ a: { b: 5 } }, { "a.b": 5 }] },
            normalizeOptions: { level: "predicate" },
            sort: { ownerId: 1, _id: 1 },
            skip: 0,
            limit: 10,
            seed,
            docs: [scalar, nested],
        });
    });

    it("中间节点数组：数组元素为对象时可匹配 elem 与点路径", async function () {
        const coll = getTestCollection();
        await clearTestCollection();
        const arrDoc = {
            _id: new ObjectId(),
            score: 0,
            archived: false,
            ownerId: 1,
            createdAt: new Date("2024-08-01T00:00:00.000Z"),
            a: [{ b: 8 }, { b: 9 }],
        };
        await coll.insertMany([arrDoc]);

        await assertSemanticEquivalence({
            collection: coll,
            rawQuery: { $and: [{ "a.b": 8 }, { a: { $elemMatch: { b: 8 } } }] },
            normalizeOptions: { level: "predicate" },
            sort: { _id: 1 },
            skip: 0,
            limit: 5,
            seed,
            docs: [arrDoc],
        });
    });

    it("路径冲突 + skip/limit + 多字段排序：验证 _id 顺序", async function () {
        const coll = getTestCollection();
        await clearTestCollection();
        const docs = [
            {
                _id: new ObjectId(),
                score: 20,
                priority: 1,
                archived: false,
                ownerId: 100,
                createdAt: new Date("2024-09-01T00:00:00.000Z"),
                profile: { level: 1, region: "us" },
            },
            {
                _id: new ObjectId(),
                score: 20,
                priority: 0,
                archived: false,
                ownerId: 50,
                createdAt: new Date("2024-09-02T00:00:00.000Z"),
                profile: { level: 1, region: "emea" },
            },
            {
                _id: new ObjectId(),
                score: 10,
                priority: 2,
                archived: false,
                ownerId: 200,
                createdAt: new Date("2024-09-03T00:00:00.000Z"),
                profile: { level: 1, region: "apac" },
            },
        ];
        await coll.insertMany(docs);

        await assertSemanticEquivalence({
            collection: coll,
            rawQuery: { $and: [{ profile: { level: 1 } }, { "profile.region": { $in: ["us", "emea", "apac"] } }] },
            normalizeOptions: { level: "predicate" },
            sort: { score: -1, priority: 1, ownerId: 1, _id: 1 },
            skip: 1,
            limit: 2,
            seed,
            docs,
        });
    });
});
