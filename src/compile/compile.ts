import { IMPOSSIBLE_SELECTOR, type Query } from "../types";
import { isFieldNode, isFalseNode, isLogicalNode, isOpaqueNode, isTrueNode } from "../ast/guards";
import type { FieldNode, LogicalNode, OpaqueNode, QueryNode } from "../ast/types";
import type { NormalizeContext } from "../normalize-context";
import { isPlainObject } from "../parse/plain-object";

export function compileQuery(node: QueryNode, _normalizeContext: NormalizeContext): Query {
    return compileNode(node, _normalizeContext) as Query;
}

function compileNode(node: QueryNode, normalizeContext: NormalizeContext): Record<string, unknown> {
    if (isLogicalNode(node)) {
        return compileLogicalNode(node, normalizeContext);
    }

    if (isFieldNode(node)) {
        return compileFieldNode(node, normalizeContext);
    }

    if (isOpaqueNode(node)) {
        return compileOpaqueNode(node);
    }

    if (isTrueNode(node)) {
        return {};
    }

    if (isFalseNode(node)) {
        return compileFalseQuery();
    }

    return {};
}

function compileLogicalNode(node: LogicalNode, normalizeContext: NormalizeContext): Record<string, unknown> {
    const children = node.children.map((child) => compileNode(child, normalizeContext));

    return {
        [node.op]: children,
    } as Record<string, unknown>;
}

function compileFieldNode(node: FieldNode, _normalizeContext: NormalizeContext): Record<string, unknown> {
    if (node.predicates.length === 1 && node.predicates[0].op === "$eq") {
        return {
            [node.field]: node.predicates[0].value,
        } as Record<string, unknown>;
    }

    const opCounts = new Map<string, number>();
    for (const predicate of node.predicates) {
        if (predicate.op === "raw") {
            continue;
        }
        const op = predicate.op;
        opCounts.set(op, (opCounts.get(op) ?? 0) + 1);
    }
    const hasDuplicateOps = [...opCounts.values()].some((c) => c > 1);

    if (hasDuplicateOps) {
        const parts = node.predicates.map((predicate) =>
            compileFieldNode({ type: "field", field: node.field, predicates: [predicate] }, _normalizeContext)
        );
        return { $and: parts } as Record<string, unknown>;
    }

    const compiled: Record<string, unknown> = {};

    for (const predicate of node.predicates) {
        if (predicate.op === "raw") {
            const rawVal = predicate.value;
            if (isPlainObject(rawVal)) {
                Object.assign(compiled, rawVal as Record<string, unknown>);
            } else {
                return {
                    [node.field]: rawVal,
                } as Record<string, unknown>;
            }
            continue;
        }

        compiled[predicate.op] = predicate.value as unknown;
    }

    return {
        [node.field]: compiled,
    } as Record<string, unknown>;
}

function compileOpaqueNode(node: OpaqueNode): Record<string, unknown> {
    if (isPlainObject(node.raw)) {
        return node.raw as Record<string, unknown>;
    }
    return {};
}

function compileFalseQuery(): Record<string, unknown> {
    return { ...IMPOSSIBLE_SELECTOR } as Record<string, unknown>;
}
