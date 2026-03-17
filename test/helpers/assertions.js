const assert = require("node:assert/strict");

/** 与实现保持一致：使用包导出的不可满足选择器常量（Spec §2.2） */
const { IMPOSSIBLE_SELECTOR } = require("../../dist/index.js");

function assertImpossibleSelector(actual, msg) {
    assert.deepEqual(actual, IMPOSSIBLE_SELECTOR, msg);
}

function assertNotImpossibleSelector(actual, msg) {
    assert.notDeepEqual(actual, IMPOSSIBLE_SELECTOR, msg);
}

function assertHasOwn(obj, key, msg) {
    assert.ok(obj && Object.prototype.hasOwnProperty.call(obj, key), msg ?? `应包含 key: ${String(key)}`);
}

function assertIsAndSelector(out, expectedLen, msg) {
    assertHasOwn(out, "$and", msg ?? "应为 $and 选择器");
    assert.ok(Array.isArray(out.$and), "$and 应为数组");
    if (expectedLen !== undefined) {
        assert.strictEqual(out.$and.length, expectedLen, "($and) 子句数量不符合预期");
    }
    return out.$and;
}

function getAndClauseByKey(andClauses, key) {
    return andClauses.find((c) => c && typeof c === "object" && !Array.isArray(c) && Object.prototype.hasOwnProperty.call(c, key));
}

function assertAndHasFieldClause(out, field, msg) {
    const andClauses = assertIsAndSelector(out);
    const clause = getAndClauseByKey(andClauses, field);
    assert.ok(clause, msg ?? `($and) 应包含字段子句: ${field}`);
    // 这个子句应当只表达该字段（避免夹带逻辑键或其他字段）
    assert.deepEqual(Object.keys(clause), [field], `字段子句 ${field} 不应包含其他 key`);
    return clause[field];
}

function assertAndHasLogicalClause(out, op, msg) {
    const andClauses = assertIsAndSelector(out);
    const clause = getAndClauseByKey(andClauses, op);
    assert.ok(clause, msg ?? `($and) 应包含逻辑子句: ${op}`);
    assert.deepEqual(Object.keys(clause), [op], `逻辑子句 ${op} 不应包含其他 key`);
    assert.ok(Array.isArray(clause[op]), `${op} 应为数组`);
    return clause[op];
}

/**
 * 测试用 ObjectId-like 工厂：不依赖 mongodb/bson 包。
 * - 兼容本项目 duck-typing：_bsontype / equals / toHexString
 */
function makeObjectIdLike(hex, mode = "hex") {
    if (mode === "equals") {
        return {
            _bsontype: "ObjectId",
            equals(other) {
                if (other && typeof other === "object" && typeof other.toHexString === "function") {
                    return other.toHexString() === hex;
                }
                if (other && typeof other === "object" && typeof other.equals === "function") {
                    // 让对方去比较本对象（避免循环依赖）
                    return other.equals({ toHexString: () => hex });
                }
                return false;
            },
            toHexString() {
                return hex;
            },
        };
    }
    return {
        _bsontype: "ObjectId",
        toHexString() {
            return hex;
        },
    };
}

module.exports = {
    IMPOSSIBLE_SELECTOR,
    assertImpossibleSelector,
    assertNotImpossibleSelector,
    assertIsAndSelector,
    assertAndHasFieldClause,
    assertAndHasLogicalClause,
    makeObjectIdLike,
};

