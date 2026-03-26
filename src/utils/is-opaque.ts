const OPAQUE_OPERATORS = new Set([
    "$regex",
    "$not",
    "$elemMatch",
    "$expr",
    "$geoWithin",
    "$geoIntersects",
    "$near",
    "$nearSphere",
    "$text",
]);

export function isOpaqueOperator(op: string): boolean {
    return OPAQUE_OPERATORS.has(op);
}

export function shouldTreatAsOpaque(value: unknown): boolean {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }

    for (const key of Object.keys(value as object)) {
        if (key.startsWith("$") && isOpaqueOperator(key)) {
            return true;
        }
    }

    return false;
}

export function getOpaqueReason(value: unknown): string {
    if (!value || typeof value !== "object") {
        return "value is not object";
    }

    for (const key of Object.keys(value as object)) {
        if (isOpaqueOperator(key)) {
            return `operator ${key} is treated as opaque`;
        }
    }

    return "unknown opaque structure";
}
