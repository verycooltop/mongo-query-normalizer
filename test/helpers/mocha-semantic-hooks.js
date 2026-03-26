"use strict";

const { startSharedMongo, stopSharedMongo } = require("./mongo-fixture");

/** 供 mocha --require：语义测试共享 MongoMemoryServer，减少启动次数 */
module.exports = {
    mochaHooks: {
        async beforeAll() {
            this.timeout(120000);
            await startSharedMongo();
        },
        async afterAll() {
            await stopSharedMongo();
        },
    },
};
