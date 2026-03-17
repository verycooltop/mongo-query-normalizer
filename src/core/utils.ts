type ObjectIdLike = {
    _bsontype?: unknown;
    toHexString?: () => string;
    equals?: (other: unknown) => boolean;
};

type EjsonObjectId = { $oid: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isObjectIdLike(value: unknown): value is ObjectIdLike {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const obj = value as ObjectIdLike;
    return obj._bsontype === "ObjectId" || typeof obj.toHexString === "function" || typeof obj.equals === "function";
}

function isEjsonObjectId(value: unknown): value is EjsonObjectId {
    if (!isPlainObject(value)) {
        return false;
    }
    return Object.keys(value).length === 1 && typeof (value as Record<string, unknown>)["$oid"] === "string";
}

function objectIdHex(value: unknown): string | undefined {
    if (isEjsonObjectId(value)) {
        return value.$oid.toLowerCase();
    }
    if (isObjectIdLike(value) && typeof value.toHexString === "function") {
        return value.toHexString().toLowerCase();
    }
    if (typeof value === "string" && /^[0-9a-f]{24}$/i.test(value)) {
        return value.toLowerCase();
    }
    return undefined;
}

/**
 * 深度比较两个值是否相等（含 Date、ObjectId-like、数组、对象），用于去重与交集等。
 *
 * @param left - 任意值
 * @param right - 任意值
 * @returns 是否相等
 */
export function areValuesEqual(left: unknown, right: unknown): boolean {
    if (left === right) {
        return true;
    }

    if (left instanceof Date && right instanceof Date) {
        return left.getTime() === right.getTime();
    }

    const leftHex = objectIdHex(left);
    const rightHex = objectIdHex(right);
    if (leftHex !== undefined && rightHex !== undefined) {
        return leftHex === rightHex;
    }

    if (isObjectIdLike(left) && isObjectIdLike(right)) {
        if (typeof left.equals === "function") {
            return left.equals(right);
        }
        if (typeof right.equals === "function") {
            return right.equals(left);
        }
        if (typeof left.toHexString === "function" && typeof right.toHexString === "function") {
            return left.toHexString() === right.toHexString();
        }
        return false;
    }

    if (Array.isArray(left) && Array.isArray(right)) {
        if (left.length !== right.length) {
            return false;
        }
        for (let i = 0; i < left.length; i += 1) {
            if (!areValuesEqual(left[i], right[i])) {
                return false;
            }
        }
        return true;
    }

    if (typeof left === "object" && left !== null && typeof right === "object" && right !== null) {
        const leftKeys = Object.keys(left as object).sort();
        const rightKeys = Object.keys(right as object).sort();
        if (leftKeys.length !== rightKeys.length) {
            return false;
        }
        for (let i = 0; i < leftKeys.length; i += 1) {
            if (leftKeys[i] !== rightKeys[i]) {
                return false;
            }
            const key = leftKeys[i];
            if (!areValuesEqual((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key])) {
                return false;
            }
        }
        return true;
    }

    return false;
}

/**
 * 数组去重（使用 areValuesEqual 比较）。
 *
 * @param items - 待去重数组
 * @returns 去重后的新数组
 */
export function deduplicateByValue<T>(items: T[]): T[] {
    const result: T[] = [];
    for (const item of items) {
        if (!result.some((x) => areValuesEqual(x, item))) {
            result.push(item);
        }
    }
    return result;
}

