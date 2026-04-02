"use strict";

/**
 * 未知字段基数下，同字段 $and 兄弟在真实 Mongo 上的语义夹具：
 * 满足全部兄弟 / 缺一项 / 标量 / 超集数组 — normalize 前后 find 一致。
 */

const { ObjectId } = require("mongodb");
const { getTestCollection, clearTestCollection } = require("../../helpers/mongo-fixture.js");
const { assertSemanticEquivalence } = require("../../helpers/assert-semantic-equivalence.js");

describe("regression / cases · 数组边界 · 同字段 $and 兄弟", function () {
    this.timeout(120000);

    const seed = 90404;
    const normalizeOptions = { level: "predicate" };
    const sort = { _id: 1 };
    const skip = 0;
    const limit = 50;

    async function runWithDocs(rawQuery, docs) {
        const coll = getTestCollection();
        await clearTestCollection();
        await coll.insertMany(docs);
        await assertSemanticEquivalence({
            collection: coll,
            rawQuery,
            normalizeOptions,
            sort,
            skip,
            limit,
            seed,
            docs,
        });
    }

    describe("多个 eq（字符串 uids）", () => {
        const uidDocs = () => [
            { _id: new ObjectId(), uids: ["1", "2", "3"] },
            { _id: new ObjectId(), uids: ["1", "2"] },
            { _id: new ObjectId(), uids: "1" },
            { _id: new ObjectId(), uids: ["0", "1", "2", "3"] },
        ];

        it("should match Mongo before/after normalize for $and of two uids eq", async function () {
            await runWithDocs({ $and: [{ uids: "1" }, { uids: "2" }] }, uidDocs());
        });

        it("should match Mongo before/after normalize for $and of three uids eq", async function () {
            await runWithDocs({ $and: [{ uids: "1" }, { uids: "2" }, { uids: "3" }] }, uidDocs());
        });

        it("should match Mongo when duplicate eq literal appears in $and", async function () {
            await runWithDocs({ $and: [{ uids: "1" }, { uids: "1" }, { uids: "2" }] }, uidDocs());
        });
    });

    describe("多个 eq（数值 a）", () => {
        const aDocs = () => [
            { _id: new ObjectId(), a: [1, 2, 3] },
            { _id: new ObjectId(), a: [1, 2] },
            { _id: new ObjectId(), a: 1 },
            { _id: new ObjectId(), a: [0, 1, 2, 3] },
        ];

        it("should match Mongo for three distinct numeric eq on a", async function () {
            await runWithDocs({ $and: [{ a: 1 }, { a: 2 }, { a: 3 }] }, aDocs());
        });
    });

    describe("eq + $in", () => {
        const aDocs = () => [
            { _id: new ObjectId(), a: [1, 2, 3] },
            { _id: new ObjectId(), a: [1, 3] },
            { _id: new ObjectId(), a: 1 },
            { _id: new ObjectId(), a: [0, 1, 2, 3, 4] },
        ];

        it("should match Mongo for eq + $in + eq sandwich", async function () {
            await runWithDocs({ $and: [{ a: 1 }, { a: { $in: [1, 2, 3] } }, { a: 2 }] }, aDocs());
        });

        it("should match Mongo for two eq + disjoint $in", async function () {
            const docs = () => [
                { _id: new ObjectId(), a: [1, 2, 5] },
                { _id: new ObjectId(), a: [1, 2, 3] },
                { _id: new ObjectId(), a: 1 },
                { _id: new ObjectId(), a: [0, 1, 2, 5, 9] },
            ];
            await runWithDocs({ $and: [{ a: 1 }, { a: 2 }, { a: { $in: [5, 6] } }] }, docs());
        });
    });

    describe("多个 $in（plain a，数组语义）", () => {
        const inPairDocs = () => [
            { _id: new ObjectId(), a: [1, 2] },
            { _id: new ObjectId(), a: [1] },
            { _id: new ObjectId(), a: 2 },
            { _id: new ObjectId(), a: [0, 1, 2] },
        ];

        it("should match Mongo for two disjoint $in on same field", async function () {
            await runWithDocs({ $and: [{ a: { $in: [1] } }, { a: { $in: [2] } }] }, inPairDocs());
        });

        const inTripleDocs = () => [
            { _id: new ObjectId(), a: [1, 2, 3] },
            { _id: new ObjectId(), a: [1, 2] },
            { _id: new ObjectId(), a: 1 },
            { _id: new ObjectId(), a: [0, 1, 2, 3] },
        ];

        it("should match Mongo for three singleton $in on same field", async function () {
            await runWithDocs(
                { $and: [{ a: { $in: [1] } }, { a: { $in: [2] } }, { a: { $in: [3] } }] },
                inTripleDocs(),
            );
        });
    });

    describe("eq + range", () => {
        const rangeDocs = () => [
            { _id: new ObjectId(), a: [1, -1] },
            { _id: new ObjectId(), a: [1, 0] },
            { _id: new ObjectId(), a: 1 },
            { _id: new ObjectId(), a: [1, -1, 2] },
        ];

        it("should match Mongo for eq + $lt", async function () {
            await runWithDocs({ $and: [{ a: 1 }, { a: { $lt: 0 } }] }, rangeDocs());
        });

        it("should match Mongo for eq + $gt + $lt", async function () {
            await runWithDocs({ $and: [{ a: 1 }, { a: { $gt: 10 } }, { a: { $lt: 0 } }] }, rangeDocs());
        });

        it("should match Mongo for two eq + $lt", async function () {
            await runWithDocs({ $and: [{ a: 1 }, { a: 2 }, { a: { $lt: 0 } }] }, rangeDocs());
        });
    });

    describe("range + range", () => {
        const disjointRangeDocs = () => [
            { _id: new ObjectId(), a: [4, 2] },
            { _id: new ObjectId(), a: [6, 1] },
            { _id: new ObjectId(), a: 4 },
            { _id: new ObjectId(), a: [10, 1, 2] },
        ];

        it("should match Mongo for $gt + $lt disjoint intervals", async function () {
            await runWithDocs({ $and: [{ a: { $gt: 5 } }, { a: { $lt: 3 } }] }, disjointRangeDocs());
        });

        const neRangeDocs = () => [
            { _id: new ObjectId(), a: [11, -1, 7] },
            { _id: new ObjectId(), a: [11, -1] },
            { _id: new ObjectId(), a: 5 },
            { _id: new ObjectId(), a: [11, -1, 5, 0] },
        ];

        it("should match Mongo for $gt + $lt + $ne", async function () {
            await runWithDocs(
                { $and: [{ a: { $gt: 10 } }, { a: { $lt: 0 } }, { a: { $ne: 5 } }] },
                neRangeDocs(),
            );
        });
    });
});
