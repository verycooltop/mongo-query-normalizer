import type { FieldPredicate, QueryNode } from "./types";

export function hashPredicate(p: FieldPredicate): string {
    return `op:${p.op}|opaque:${p.opaque ? 1 : 0}|v:${serializeValue(p.value)}`;
}

export function hashNode(node: QueryNode): string {
    switch (node.type) {
        case "true":
            return "T";
        case "false":
            return "F";
        case "opaque":
            return `O:${node.reason ?? ""}:${serializeValue(node.raw)}`;
        case "field": {
            const parts = node.predicates.map(hashPredicate).sort();
            return `F:${node.field}(${parts.join("\u001f")})`;
        }
        case "logical": {
            const childKeys = node.children.map(hashNode).sort();
            return `L:${node.op}(${childKeys.join("\u001f")})`;
        }
        default:
            return "U";
    }
}

function serializeValue(value: unknown): string {
    if (value === undefined) {
        return "u";
    }
    if (value === null) {
        return "n";
    }
    if (typeof value === "number") {
        if (Object.is(value, -0)) {
            return "num:-0";
        }
        if (!Number.isFinite(value)) {
            return `num:${String(value)}`;
        }
        return `num:${value}`;
    }
    if (typeof value === "boolean") {
        return `b:${value}`;
    }
    if (typeof value === "string") {
        return `s:${JSON.stringify(value)}`;
    }
    if (value instanceof Date) {
        return `d:${value.toISOString()}`;
    }
    if (value instanceof RegExp) {
        return `r:${value.source}\u0000${value.flags}`;
    }
    if (Array.isArray(value)) {
        return `a:[${value.map(serializeValue).join("\u001f")}]`;
    }
    if (typeof value === "object") {
        const o = value as Record<string, unknown>;
        const keys = Object.keys(o).sort();
        const inner = keys.map((k) => `${JSON.stringify(k)}:${serializeValue(o[k])}`).join("\u001f");
        return `o:{${inner}}`;
    }
    return `x:${String(value)}`;
}
