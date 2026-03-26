"use strict";

const { MongoMemoryServer } = require("mongodb-memory-server");
const { MongoClient } = require("mongodb");

const DB_NAME = "mongo_query_normalizer_semantic";
const COLL_NAME = "items";

let server;
let client;

/** 启动共享内存 Mongo（由 mocha semantic hooks 调用一次）。 */
async function startSharedMongo() {
    if (client) {
        return;
    }
    server = await MongoMemoryServer.create();
    client = new MongoClient(server.getUri());
    await client.connect();
}

function getTestCollection() {
    if (!client) {
        throw new Error("Mongo fixture not started; load test/helpers/mocha-semantic-hooks.js via mocha --require");
    }
    return client.db(DB_NAME).collection(COLL_NAME);
}

/** 关闭 server 与 client。 */
async function stopSharedMongo() {
    if (client) {
        await client.close();
        client = undefined;
    }
    if (server) {
        await server.stop();
        server = undefined;
    }
}

async function clearTestCollection() {
    await getTestCollection().deleteMany({});
}

module.exports = {
    startSharedMongo,
    stopSharedMongo,
    getTestCollection,
    clearTestCollection,
    DB_NAME,
    COLL_NAME,
};
