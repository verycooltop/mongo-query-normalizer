import { andNode, fieldNode, falseNode, opaqueNode, orNode, trueNode } from "../ast/builders";
import type { FieldPredicate, QueryNode } from "../ast/types";
import type { NormalizeContext } from "../normalize-context";
import { shouldTreatAsOpaque } from "../utils/is-opaque";
import { isPlainObject } from "./plain-object";

export function parseQuery(query: unknown, _normalizeContext: NormalizeContext): QueryNode {
    if (!isPlainObject(query)) {
        return opaqueNode({}, "root query is not a plain object");
    }

    return parseRootObject(query as Record<string, unknown>, _normalizeContext);
}

function parseRootObject(input: Record<string, unknown>, normalizeContext: NormalizeContext): QueryNode {
    const children: QueryNode[] = [];

    for (const [key, value] of Object.entries(input)) {
        children.push(parseEntry(key, value, normalizeContext));
    }

    if (children.length === 0) {
        return trueNode();
    }

    if (children.length === 1) {
        return children[0];
    }

    return andNode(children);
}

function parseEntry(key: string, value: unknown, normalizeContext: NormalizeContext): QueryNode {
    if (key === "$and" || key === "$or") {
        return parseLogicalNode(key, value, normalizeContext);
    }

    if (key.startsWith("$")) {
        return opaqueNode({ [key]: value }, `unsupported top-level operator ${key}`);
    }

    return parseFieldNode(key, value, normalizeContext);
}

function parseLogicalNode(op: "$and" | "$or", value: unknown, normalizeContext: NormalizeContext): QueryNode {
    if (!Array.isArray(value)) {
        return opaqueNode({ [op]: value }, `${op} value is not array`);
    }

    const children = value.map((item) => {
        if (!isPlainObject(item)) {
            return opaqueNode(item, `${op} child is not plain object`);
        }
        return parseRootObject(item as Record<string, unknown>, normalizeContext);
    });

    if (op === "$and" && children.length === 0) {
        return trueNode();
    }

    if (op === "$or" && children.length === 0) {
        return falseNode();
    }

    return op === "$and" ? andNode(children) : orNode(children);
}

function parseFieldNode(field: string, value: unknown, normalizeContext: NormalizeContext): QueryNode {
    if (shouldTreatAsOpaque(value)) {
        return opaqueNode({ [field]: value }, `field ${field}: opaque operator object`);
    }

    const predicates = parseFieldPredicates(field, value, normalizeContext);

    if (predicates.length === 0) {
        return opaqueNode({ [field]: value }, `field ${field} produced no predicates`);
    }

    return fieldNode(field, predicates);
}

function isOperatorObject(value: unknown): boolean {
    return (
        !!value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.keys(value as object).some((k) => k.startsWith("$"))
    );
}

function parseFieldPredicates(field: string, value: unknown, _normalizeContext: NormalizeContext): FieldPredicate[] {
    if (!isOperatorObject(value)) {
        return [parseDirectEquality(value)];
    }

    const predicates: FieldPredicate[] = [];
    const obj = value as Record<string, unknown>;

    for (const [op, opValue] of Object.entries(obj)) {
        if (!op.startsWith("$")) {
            return [{ op: "raw", value, opaque: true }];
        }

        if (isOpaqueOperatorName(op)) {
            return [{ op: "raw", value, opaque: true }];
        }

        switch (op) {
            case "$eq":
            case "$ne":
            case "$in":
            case "$nin":
            case "$gt":
            case "$gte":
            case "$lt":
            case "$lte":
            case "$exists":
                predicates.push({ op, value: opValue });
                break;
            default:
                return [{ op: "raw", value, opaque: true }];
        }
    }

    return predicates;
}

function isOpaqueOperatorName(op: string): boolean {
    return (
        op === "$regex" ||
        op === "$not" ||
        op === "$elemMatch" ||
        op === "$expr" ||
        op === "$geoWithin" ||
        op === "$geoIntersects" ||
        op === "$near" ||
        op === "$nearSphere" ||
        op === "$text"
    );
}

function parseDirectEquality(value: unknown): FieldPredicate {
    return { op: "$eq", value };
}
