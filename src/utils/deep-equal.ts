function isPlainObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
}

export function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) {
        return true;
    }

    if (a instanceof Date && b instanceof Date) {
        return a.getTime() === b.getTime();
    }

    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) {
            return false;
        }
        return a.every((item, i) => deepEqual(item, b[i]));
    }

    if (isPlainObject(a) && isPlainObject(b)) {
        const aKeys = Object.keys(a).sort();
        const bKeys = Object.keys(b).sort();

        if (!deepEqual(aKeys, bKeys)) {
            return false;
        }

        return aKeys.every((key) => deepEqual(a[key], b[key]));
    }

    return false;
}
