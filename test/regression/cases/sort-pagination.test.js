"use strict";

/**
 * 回归沉淀目录：每个文件聚焦一类历史失败场景。
 * 从 property / 语义测试失败时复制 formatFailureContext 输出，并在此固化。
 */

const { ObjectId } = require("mongodb");
const { getTestCollection, clearTestCollection } = require("../../helpers/mongo-fixture.js");
const { assertSemanticEquivalence } = require("../../helpers/assert-semantic-equivalence.js");

describe("regression / cases · sort 与分页", function () {
    this.timeout(60000);

    const seed = 42;

    it("多字段 sort + skip + limit：缺失 profile.level 与 null status 混排仍与 Mongo 一致", async function () {
        const coll = getTestCollection();
        await clearTestCollection();
        const docs = [
            {
                _id: new ObjectId(),
                score: 10,
                priority: 2,
                archived: false,
                ownerId: 1,
                createdAt: new Date("2024-01-10T00:00:00.000Z"),
                tags: ["alpha"],
            },
            {
                _id: new ObjectId(),
                score: 10,
                priority: 1,
                archived: false,
                ownerId: 2,
                status: null,
                createdAt: new Date("2024-01-11T00:00:00.000Z"),
                tags: [],
                profile: { level: 5, region: "us" },
            },
            {
                _id: new ObjectId(),
                score: 5,
                priority: 3,
                archived: true,
                ownerId: 3,
                status: "open",
                createdAt: new Date("2024-01-09T00:00:00.000Z"),
                tags: ["beta"],
                profile: { level: 1, region: "emea" },
            },
        ];
        await coll.insertMany(docs);

        await assertSemanticEquivalence({
            collection: coll,
            rawQuery: {
                $and: [{ score: { $gte: 0 } }, { $or: [{ archived: false }, { status: "open" }] }],
            },
            normalizeOptions: { level: "predicate" },
            sort: { "profile.level": 1, score: -1, _id: 1 },
            skip: 1,
            limit: 2,
            seed,
            docs,
        });
    });

    it("path 冲突查询 + 扩展 sort：normalize 不改变命中顺序", async function () {
        const coll = getTestCollection();
        await clearTestCollection();
        const a = new ObjectId();
        const b = new ObjectId();
        const docs = [
            {
                _id: a,
                score: 1,
                archived: false,
                ownerId: 10,
                createdAt: new Date("2024-06-01T00:00:00.000Z"),
                tags: ["gamma"],
                profile: { level: 3, region: "us" },
            },
            {
                _id: b,
                score: 2,
                archived: false,
                ownerId: 20,
                createdAt: new Date("2024-06-02T00:00:00.000Z"),
                tags: ["gamma"],
                profile: { level: 3, region: "emea" },
            },
        ];
        await coll.insertMany(docs);

        await assertSemanticEquivalence({
            collection: coll,
            rawQuery: { $and: [{ profile: { level: 3, region: "us" } }, { "profile.level": 3 }] },
            normalizeOptions: { level: "predicate" },
            sort: { ownerId: -1, _id: 1 },
            skip: 0,
            limit: 5,
            seed,
            docs,
        });
    });
});
