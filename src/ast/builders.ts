import type { FalseNode, FieldNode, FieldPredicate, LogicalNode, OpaqueNode, QueryNode, TrueNode } from "./types";

export function trueNode(): TrueNode {
    return { type: "true" };
}

export function falseNode(): FalseNode {
    return { type: "false" };
}

export function opaqueNode(raw: unknown, reason?: string): OpaqueNode {
    return { type: "opaque", raw, reason };
}

export function andNode(children: QueryNode[]): LogicalNode {
    return { type: "logical", op: "$and", children };
}

export function orNode(children: QueryNode[]): LogicalNode {
    return { type: "logical", op: "$or", children };
}

export function fieldNode(field: string, predicates: FieldPredicate[]): FieldNode {
    return { type: "field", field, predicates };
}
