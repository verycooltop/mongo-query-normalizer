"use strict";

const { ObjectId } = require("mongodb");
const { getTestCollection, clearTestCollection } = require("../helpers/mongo-fixture.js");
const { assertSemanticEquivalence } = require("../helpers/assert-semantic-equivalence.js");

/**
 * 人工回归：由随机语义测试失败日志固化而来。
 * 每个 case 请保留：场景说明、原始问题点、预期（与 Mongo 执行一致 + 幂等）。
 * 更多按主题拆分的用例见 `test/regression/cases/`；沉淀规范见 `test/REGRESSION.md` 与 `cases/seeded-failure-template.js`。
 */
describe("regression / hand-crafted 语义用例", function () {
    this.timeout(60000);

    const seed = 42;

    it("基线：简单等值与 $and 包装在 predicate 下与 Mongo 一致", async function () {
        const coll = getTestCollection();
        await clearTestCollection();
        const id1 = new ObjectId();
        const id2 = new ObjectId();
        const createdAt = new Date("2024-06-01T00:00:00.000Z");
        const docs = [
            {
                _id: id1,
                status: "open",
                score: 10,
                priority: 2,
                archived: false,
                ownerId: 100,
                createdAt,
                tags: ["alpha"],
                profile: { level: 3, region: "us" },
            },
            {
                _id: id2,
                status: "closed",
                score: 5,
                archived: true,
                ownerId: 200,
                createdAt: new Date("2024-07-01T00:00:00.000Z"),
                tags: [],
                profile: { level: 1, region: "emea" },
            },
        ];
        await coll.insertMany(docs);

        await assertSemanticEquivalence({
            collection: coll,
            rawQuery: { $and: [{ status: "open" }, { score: { $gte: 5 } }] },
            normalizeOptions: { level: "predicate" },
            sort: { score: -1, _id: 1 },
            skip: 0,
            limit: 10,
            seed,
            docs,
        });
    });

    it("基线：shape 层不改变该过滤器的匹配结果", async function () {
        const coll = getTestCollection();
        await clearTestCollection();
        const id1 = new ObjectId();
        const docs = [
            {
                _id: id1,
                status: "draft",
                score: 0,
                archived: false,
                ownerId: 1,
                createdAt: new Date("2023-01-01T00:00:00.000Z"),
                tags: [],
                profile: { level: 0, region: "apac" },
            },
        ];
        await coll.insertMany(docs);

        await assertSemanticEquivalence({
            collection: coll,
            rawQuery: { $or: [{ status: "draft" }, { archived: true }] },
            normalizeOptions: { level: "shape" },
            sort: { _id: 1 },
            skip: 0,
            limit: 5,
            seed,
            docs,
        });
    });
});
