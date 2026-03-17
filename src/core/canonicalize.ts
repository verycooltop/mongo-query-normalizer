import type { IndexSpec } from "../types";
import type { FieldCondition, FieldNode, LogicalNode, SelectorAST } from "../ast/types";

/** Spec §11.4：Condition 规范顺序 */
const CONDITION_OP_ORDER: Record<string, number> = {
    $eq: 0,
    $gt: 1,
    $gte: 2,
    $lt: 3,
    $lte: 4,
    $in: 5,
    $nin: 6,
    $exists: 7,
    $ne: 8,
};

function conditionOrderScore(op: string): number {
    return CONDITION_OP_ORDER[op] ?? 999;
}

function sortFieldConditions(conditions: FieldCondition[]): FieldCondition[] {
    return [...conditions].sort(
        (a, b) =>
            conditionOrderScore(a.op) - conditionOrderScore(b.op) ||
            (a.op as string).localeCompare(b.op as string)
    );
}

/**
 * canonicalize（AST → AST）：
 * - Spec §11.1–11.2：$and children 稳定排序（fields 在前，indexSpecs 或字母序）
 * - Spec §11.4：FieldNode.conditions 按规范顺序排序
 * - 结构标准化：$and/$or 打平嵌套、单子节点折叠，保证进入 compile 的 AST 无需再改结构
 */
export function canonicalize(ast: SelectorAST, indexSpecs?: IndexSpec[]): SelectorAST {
    if (ast.type === "true" || ast.type === "false") {
        return ast;
    }

    if (ast.type === "field") {
        const node: FieldNode = { ...ast, conditions: sortFieldConditions(ast.conditions) };
        return node;
    }

    let children = ast.children.map((c) => canonicalize(c, indexSpecs));
    const op = (ast as LogicalNode).op;

    if (op === "$and") {
        children = children.flatMap((c) =>
            c.type === "logical" && c.op === "$and" ? c.children : [c]
        );
        if (children.length === 1) {
            return children[0];
        }
    }

    let node: LogicalNode = { ...ast, children };

    if (node.op === "$and") {
        node = sortAndChildren(node, indexSpecs);
    }

    return node;
}

function sortAndChildren(node: LogicalNode, indexSpecs?: IndexSpec[]): LogicalNode {
    const keyOrder = indexSpecs && indexSpecs.length > 0 ? buildIndexKeyOrder(indexSpecs) : undefined;

    const scored = node.children.map((c, i) => {
        if (c.type === "field") {
            const score = keyOrder?.get(c.field) ?? Number.MAX_SAFE_INTEGER;
            return { c, i, score, kind: 0, tiebreak: c.field };
        }
        // logical/true/false：放后面，保持稳定
        return { c, i, score: Number.MAX_SAFE_INTEGER, kind: 1, tiebreak: "" };
    });

    scored.sort(
        (a, b) =>
            a.score - b.score ||
            a.kind - b.kind ||
            a.tiebreak.localeCompare(b.tiebreak) ||
            a.i - b.i
    );

    return { ...node, children: scored.map((x) => x.c) };
}

function buildIndexKeyOrder(indexSpecs: IndexSpec[]): Map<string, number> {
    const map = new Map<string, number>();
    let cursor = 0;
    for (const spec of indexSpecs) {
        for (const field of Object.keys(spec.key)) {
            if (!map.has(field)) {
                map.set(field, cursor++);
            }
        }
    }
    return map;
}

