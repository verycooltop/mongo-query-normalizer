export function isComparableScalar(value: unknown): value is number | string | boolean | Date {
    return (
        typeof value === "number" ||
        typeof value === "string" ||
        typeof value === "boolean" ||
        value instanceof Date
    );
}

/**
 * @returns -1 | 0 | 1，或 null 表示不可比较
 */
export function compareScalarValues(a: unknown, b: unknown): -1 | 0 | 1 | null {
    if (!isComparableScalar(a) || !isComparableScalar(b)) {
        return null;
    }

    if (a.constructor !== b.constructor) {
        return null;
    }

    const av = a instanceof Date ? a.getTime() : a;
    const bv = b instanceof Date ? b.getTime() : b;

    if (av < bv) {
        return -1;
    }
    if (av > bv) {
        return 1;
    }
    return 0;
}
