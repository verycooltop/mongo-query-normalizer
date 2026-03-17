import type { FieldCondition } from "../ast/types";
import { areValuesEqual } from "./utils";

function isNumberOrDate(v: unknown): v is number | Date {
    return typeof v === "number" || v instanceof Date;
}

function toNum(v: number | Date): number {
    return v instanceof Date ? v.getTime() : v;
}

/**
 * 判断两条同字段条件是否互斥。
 */
export function twoConditionsConflict(a: FieldCondition, b: FieldCondition): boolean {
    if (a.op === "$eq" && b.op === "$eq") {
        return !areValuesEqual(a.value, b.value);
    }

    if (a.op === "$eq" || b.op === "$eq") {
        const eq = a.op === "$eq" ? a : b;
        const other = a.op === "$eq" ? b : a;
        const v = eq.value;
        if (other.op === "$gt" || other.op === "$gte" || other.op === "$lt" || other.op === "$lte") {
            if (!isNumberOrDate(v) || !isNumberOrDate(other.value)) {
                return false;
            }
            const cv = other.value as number | Date;
            const nv = toNum(v);
            const nc = toNum(cv);
            if (other.op === "$gt") {
                return nv <= nc;
            }
            if (other.op === "$gte") {
                return nv < nc;
            }
            if (other.op === "$lt") {
                return nv >= nc;
            }
            if (other.op === "$lte") {
                return nv > nc;
            }
        }
        if (other.op === "$in" || other.op === "$nin") {
            const arr = Array.isArray(other.value) ? other.value : [other.value];
            const found = arr.some((x) => areValuesEqual(v, x));
            if (other.op === "$in") {
                return !found;
            }
            if (other.op === "$nin") {
                return found;
            }
        }
        if (other.op === "$exists") {
            const exists = Boolean(other.value);

            if (v === undefined) {
                return exists === true;
            }
            if (v === null) {
                return false;
            }
            if (exists === false) {
                return true;
            }
            return false;
        }
        if (other.op === "$ne") {
            return areValuesEqual(v, other.value);
        }
    }

    const cmpOps = ["$gt", "$gte", "$lt", "$lte"] as const;
    if (cmpOps.includes(a.op as (typeof cmpOps)[number]) && cmpOps.includes(b.op as (typeof cmpOps)[number])) {
        if (!isNumberOrDate(a.value) || !isNumberOrDate(b.value)) {
            return false;
        }
        const na = toNum(a.value as number | Date);
        const nb = toNum(b.value as number | Date);
        const aop = a.op as (typeof cmpOps)[number];
        const bop = b.op as (typeof cmpOps)[number];
        if ((aop === "$gt" || aop === "$gte") && (bop === "$lt" || bop === "$lte")) {
            return na > nb || (na === nb && (aop === "$gt" || bop === "$lt"));
        }
        if ((aop === "$lt" || aop === "$lte") && (bop === "$gt" || bop === "$gte")) {
            return nb > na || (nb === na && (bop === "$gt" || aop === "$lt"));
        }
    }

    if (a.op === "$exists" && a.value === false) {
        if (
            (b.op === "$eq" && b.value !== null) ||
            b.op === "$in" ||
            b.op === "$gt" ||
            b.op === "$gte" ||
            b.op === "$lt" ||
            b.op === "$lte"
        ) {
            return true;
        }
    }
    if (b.op === "$exists" && b.value === false) {
        if (
            (a.op === "$eq" && a.value !== null) ||
            a.op === "$in" ||
            a.op === "$gt" ||
            a.op === "$gte" ||
            a.op === "$lt" ||
            a.op === "$lte"
        ) {
            return true;
        }
    }

    if ((a.op === "$in" && b.op === "$nin") || (a.op === "$nin" && b.op === "$in")) {
        const inArr = (a.op === "$in" ? a.value : b.value) as unknown[];
        const ninArr = (a.op === "$nin" ? a.value : b.value) as unknown[];
        const allInBanned = inArr.length > 0 && inArr.every((x) => ninArr.some((y) => areValuesEqual(x, y)));
        return allInBanned;
    }

    if (a.op === "$exists" && b.op === "$exists") {
        return a.value !== b.value;
    }

    if (a.op === "$ne" && b.op === "$exists") {
        if (b.value === false && a.value === null) {
            return true;
        }
        return false;
    }
    if (b.op === "$ne" && a.op === "$exists") {
        if (a.value === false && b.value === null) {
            return true;
        }
        return false;
    }

    if (
        (a.op === "$ne" && b.op === "$in") ||
        (a.op === "$in" && b.op === "$ne")
    ) {
        const ne = a.op === "$ne" ? a : b;
        const inp = a.op === "$in" ? a : b;
        const inArr = Array.isArray(inp.value) ? inp.value : [inp.value];
        if (inArr.length === 0) {
            return false;
        }
        const allEqualExcluded = inArr.every((x) => areValuesEqual(x, ne.value));
        return allEqualExcluded;
    }

    return false;
}

/**
 * 判断同一字段上父条件与子条件是否冲突。
 *
 * @param parent - 父级该字段的条件列表
 * @param child - 当前节点的条件列表
 * @returns 若存在互斥则为 true
 */
export function hasConditionConflict(parent: FieldCondition[], child: FieldCondition[]): boolean {
    for (const pc of parent) {
        for (const cc of child) {
            if (twoConditionsConflict(pc, cc)) {
                return true;
            }
        }
    }
    return false;
}
