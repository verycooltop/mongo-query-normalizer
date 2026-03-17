import { ASTNodeBuilder } from "../ast/builders";
import { isFalseNode, isFieldNode, isLogicalNode, isTrueNode } from "../ast/guards";
import type { FieldCondition, FieldNode, LogicalNode, SelectorAST } from "../ast/types";
import {
    isConditionsImpossible,
    isParentChildImpossible,
    tightenWithParent,
} from "./conflicts-and-tighten";
import { areValuesEqual } from "./utils";

type FieldConditionMap = Map<string, FieldCondition[]>;

/**
 * simplify（AST → AST）：
 * 原则：顶层/父级条件为最高优先级；所有子分支条件的值都与父级进行匹配、合并、裁剪，确保子分支不与上层冲突。
 * 1. context 记录「所有父级」的 base 条件（base = FieldNode 条件）
 * 2. 在 `$and` 内对子节点做“sibling constraint propagation”：每个子节点看到的是 parent + siblings（不包含 self）
 * 3. 分支冲突剪枝：与 context 冲突的 FieldNode 直接返回 false
 * 4. 收紧时若合并结果等价于父级单值（如 $eq），则只保留单值约束，不输出冗余的 $in
 * 5. 基础逻辑化简：true/false 传播、AND/OR 化简、AND flatten
 */
export function simplify(ast: SelectorAST): SelectorAST {
    const context: FieldConditionMap = new Map();
    return simplifyNode(ast, context);
}

function simplifyNode(node: SelectorAST, context: FieldConditionMap): SelectorAST {
    if (isTrueNode(node) || isFalseNode(node)) {
        return node;
    }

    if (isFieldNode(node)) {
        return simplifyFieldNode(node, context);
    }

    if (isLogicalNode(node)) {
        switch (node.op) {
            case "$and":
                return simplifyAnd(node, context);
            case "$or":
                return simplifyOr(node, context);
            case "$nor":
                return simplifyNor(node, context);
        }
    }

    return node;
}

function simplifyFieldNode(node: FieldNode, context: FieldConditionMap): SelectorAST {
    if (isConditionsImpossible(node.conditions)) {
        return ASTNodeBuilder.falseNode();
    }

    const parent = context.get(node.field);
    if (!parent) {
        return node;
    }

    if (isParentChildImpossible(parent, node.conditions)) {
        return ASTNodeBuilder.falseNode();
    }

    const tightened = tightenWithParent(parent, node.conditions);
    if (tightened.impossible) {
        return ASTNodeBuilder.falseNode();
    }
    if (tightened.changed && tightened.conditions.length === 0) {
        return ASTNodeBuilder.trueNode();
    }
    return tightened.changed ? { ...node, conditions: tightened.conditions } : node;
}

function simplifyAnd(node: LogicalNode, context: FieldConditionMap): SelectorAST {
    // 预聚合本层所有 FieldNode 条件，用于 sibling 传播
    const layerAll = new Map<string, FieldCondition[]>();
    for (const child of node.children) {
        if (!isFieldNode(child)) {
            continue;
        }
        const existing = layerAll.get(child.field) ?? [];
        layerAll.set(child.field, [...existing, ...child.conditions]);
    }

    const resultChildren: SelectorAST[] = [];

    for (const child of node.children) {
        const childContext = isFieldNode(child)
            ? buildSiblingContext(context, layerAll, child)
            : buildLayerContext(context, layerAll);
        const simplified = simplifyNode(child, childContext);

        if (isFalseNode(simplified)) {
            return ASTNodeBuilder.falseNode();
        }
        if (isTrueNode(simplified)) {
            continue;
        }

        if (isFieldNode(simplified)) {
            resultChildren.push(simplified);
            continue;
        }

        if (isLogicalNode(simplified) && simplified.op === "$and") {
            resultChildren.push(...simplified.children);
            continue;
        }

        resultChildren.push(simplified);
    }

    if (resultChildren.length === 0) {
        return ASTNodeBuilder.trueNode();
    }
    if (resultChildren.length === 1) {
        return resultChildren[0];
    }
    return ASTNodeBuilder.logical("$and", resultChildren);
}

function simplifyOr(node: LogicalNode, context: FieldConditionMap): SelectorAST {
    const resultChildren: SelectorAST[] = [];

    for (const child of node.children) {
        const simplified = simplifyNode(child, context);

        if (isTrueNode(simplified)) {
            return ASTNodeBuilder.trueNode();
        }
        if (isFalseNode(simplified)) {
            continue;
        }

        resultChildren.push(simplified);
    }

    if (resultChildren.length === 0) {
        return ASTNodeBuilder.falseNode();
    }
    if (resultChildren.length === 1) {
        return resultChildren[0];
    }
    return ASTNodeBuilder.logical("$or", resultChildren);
}

/**
 * $nor 子句的双通道化简：用空 context 做结构化简，用父级 context 判断是否可剪枝。
 * 返回保留的子节点列表，以及是否存在恒 true 子句（此时 NOR 恒 false）。
 */
function simplifyNorChildrenWithContext(
    children: SelectorAST[],
    context: FieldConditionMap
): { kept: SelectorAST[]; hasAlwaysTrue: boolean } {
    const kept: SelectorAST[] = [];
    const emptyContext = new Map<string, FieldCondition[]>();

    for (const child of children) {
        const childNoCtx = simplifyNode(child, emptyContext);
        if (isFalseNode(childNoCtx)) {
            continue;
        }
        const childWithCtx = simplifyNode(child, context);
        if (isFalseNode(childWithCtx)) {
            continue;
        }
        if (isTrueNode(childNoCtx)) {
            return { kept: [], hasAlwaysTrue: true };
        }
        kept.push(childNoCtx);
    }

    return { kept, hasAlwaysTrue: false };
}

function simplifyNor(node: LogicalNode, context: FieldConditionMap): SelectorAST {
    const { kept, hasAlwaysTrue } = simplifyNorChildrenWithContext(node.children, context);

    if (hasAlwaysTrue) {
        return ASTNodeBuilder.falseNode();
    }
    if (kept.length === 0) {
        return ASTNodeBuilder.trueNode();
    }
    if (kept.length === 1) {
        return ASTNodeBuilder.logical("$nor", [kept[0]]);
    }
    return ASTNodeBuilder.logical("$nor", [ASTNodeBuilder.logical("$or", kept)]);
}

function cloneContext(context: FieldConditionMap): FieldConditionMap {
    const next = new Map<string, FieldCondition[]>();
    for (const [k, v] of context) {
        next.set(k, [...v]);
    }
    return next;
}

function addToContext(context: FieldConditionMap, node: FieldNode): void {
    const existing = context.get(node.field) ?? [];
    context.set(node.field, [...existing, ...node.conditions]);
}

function buildLayerContext(parentContext: FieldConditionMap, layerAll: FieldConditionMap): FieldConditionMap {
    const next = cloneContext(parentContext);
    for (const [field, conds] of layerAll) {
        const existing = next.get(field) ?? [];
        next.set(field, [...existing, ...conds]);
    }
    return next;
}

function buildSiblingContext(
    parentContext: FieldConditionMap,
    layerAll: FieldConditionMap,
    self: FieldNode
): FieldConditionMap {
    const next = cloneContext(parentContext);
    const all = layerAll.get(self.field);
    if (!all) {
        return next;
    }

    const siblingsOnly = subtractConditions(all, self.conditions);
    if (siblingsOnly.length > 0) {
        const parentExisting = next.get(self.field) ?? [];
        next.set(self.field, [...parentExisting, ...siblingsOnly]);
    }
    return next;
}

function subtractConditions(all: FieldCondition[], sub: FieldCondition[]): FieldCondition[] {
    if (sub.length === 0) {
        return [...all];
    }
    const remaining = [...all];

    for (const s of sub) {
        const idx = remaining.findIndex((c) => c.op === s.op && areValuesEqual(c.value, s.value));
        if (idx >= 0) {
            remaining.splice(idx, 1);
        }
    }

    return remaining;
}
