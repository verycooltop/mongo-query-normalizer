"use strict";

/**
 * 统一执行 find：projection 仅 _id，并应用 sort / skip / limit。
 * @returns {Promise<string[]>} _id 的字符串形式，顺序与游标一致
 */
async function runFindIds(collection, filter, { sort, skip, limit }) {
    const cursor = collection
        .find(filter, { projection: { _id: 1 } })
        .sort(sort)
        .skip(skip)
        .limit(limit);
    const docs = await cursor.toArray();
    return docs.map((d) => d._id.toString());
}

module.exports = { runFindIds };
