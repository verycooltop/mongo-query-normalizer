import type { FieldNode, LogicalNode, SelectorAST } from "../ast/types";

/**
 * 同字段 FieldNode 一律合并，conditions 拼接后由 fieldConditionNormalize 做语义合并（如多 $in 取交）。
 */
export function canMergeFieldNodes(_existing: FieldNode, _incoming: FieldNode): boolean {
    return true;
}

/**
 * predicateMerge（AST → AST）：
 * - 只在 `$and` 内做同字段 FieldNode 合并（把 conditions 拼接到同一个 FieldNode）
 * - 不做逻辑推理/冲突检测（交给 simplify）
 */
export function predicateMerge(ast: SelectorAST): SelectorAST {
    if (ast.type !== "logical") {
        return ast;
    }

    const children = ast.children.map(predicateMerge);
    const node: LogicalNode = { ...ast, children };

    if (node.op !== "$and") {
        return node;
    }

    const byField = new Map<string, FieldNode>();
    const others: SelectorAST[] = [];

    for (const child of node.children) {
        if (child.type === "field") {
            const existing = byField.get(child.field);
            if (existing) {
                if (!canMergeFieldNodes(existing, child)) {
                    others.push(child);
                    continue;
                }
                byField.set(child.field, {
                    ...existing,
                    conditions: [...existing.conditions, ...child.conditions],
                });
            } else {
                byField.set(child.field, child);
            }
        } else {
            others.push(child);
        }
    }

    return { ...node, children: [...byField.values(), ...others] };
}
