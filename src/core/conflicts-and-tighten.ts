import type { FieldCondition } from "../ast/types";
import type { TightenResult } from "./conditions";
import { tightenChildConditionsByParent } from "./conditions";
import { hasConditionConflict } from "./conflicts";

/**
 * 判断同一字段上的一组条件是否自相冲突（不可满足）。
 */
export function isConditionsImpossible(conditions: FieldCondition[]): boolean {
    return hasConditionConflict(conditions, conditions);
}

/**
 * 判断父级条件与子级条件是否冲突。
 */
export function isParentChildImpossible(
    parent: FieldCondition[],
    child: FieldCondition[]
): boolean {
    return hasConditionConflict(parent, child);
}

/**
 * 在父级条件约束下收紧子级条件（取交集），并判断合并后是否不可能满足。
 */
export function tightenWithParent(
    parent: FieldCondition[],
    child: FieldCondition[]
): TightenResult {
    return tightenChildConditionsByParent(parent, child);
}
