import { falseNode } from "../../ast/builders";
import type { FalseNode } from "../../ast/types";
import type { FieldPredicate } from "../../ast/types";
import type { NormalizeContext } from "../../normalize-context";
import { addWarning } from "../../observe/warnings";
import { compareScalarValues, isComparableScalar } from "../../utils/compare-values";
import { deepEqual } from "../../utils/deep-equal";

export type MergePredicatesResult = FieldPredicate[] | FalseNode;

export function isMergeFalse(result: MergePredicatesResult): result is FalseNode {
    return typeof result === "object" && result !== null && "type" in result && result.type === "false";
}

export function mergePredicates(
    predicates: FieldPredicate[],
    normalizeContext: NormalizeContext,
    field: string
): MergePredicatesResult {
    let current: FieldPredicate[] = predicates;

    const afterEq = mergeEqPredicates(current, field, normalizeContext);
    if (isMergeFalse(afterEq)) {
        return afterEq;
    }
    current = afterEq;

    const afterIn = mergeInPredicates(current, field, normalizeContext);
    if (isMergeFalse(afterIn)) {
        return afterIn;
    }
    current = afterIn;

    const afterRange = mergeRangePredicates(current, field, normalizeContext);
    if (isMergeFalse(afterRange)) {
        return afterRange;
    }
    current = afterRange;

    const afterEqRange = collapseEqRangeConflict(current);
    if (isMergeFalse(afterEqRange)) {
        return afterEqRange;
    }

    return afterEqRange;
}

/** $eq 与 $gt/$gte/$lt/$lte 同字段不可同时满足时归为不可满足 */
function collapseEqRangeConflict(predicates: FieldPredicate[]): MergePredicatesResult {
    const eq = predicates.find((p) => p.op === "$eq");
    if (!eq || !isComparableScalar(eq.value)) {
        return predicates;
    }
    const v = eq.value;

    for (const p of predicates) {
        if (
            (p.op === "$gt" || p.op === "$gte" || p.op === "$lt" || p.op === "$lte") &&
            isComparableScalar(p.value)
        ) {
            const cmp = compareScalarValues(v, p.value);
            if (cmp === null) {
                continue;
            }
            if (p.op === "$lt" && cmp >= 0) {
                return falseNode();
            }
            if (p.op === "$lte" && cmp > 0) {
                return falseNode();
            }
            if (p.op === "$gt" && cmp <= 0) {
                return falseNode();
            }
            if (p.op === "$gte" && cmp < 0) {
                return falseNode();
            }
        }
    }

    return predicates;
}

function mergeEqPredicates(predicates: FieldPredicate[], field: string, _normalizeContext: NormalizeContext): MergePredicatesResult {
    const eqs = predicates.filter((p) => p.op === "$eq");

    if (eqs.length <= 1) {
        return predicates;
    }

    const first = eqs[0];

    for (let i = 1; i < eqs.length; i += 1) {
        if (!deepEqual(first.value, eqs[i].value)) {
            return falseNode();
        }
    }

    return [first, ...predicates.filter((p) => p.op !== "$eq")];
}

function mergeInPredicates(predicates: FieldPredicate[], field: string, normalizeContext: NormalizeContext): MergePredicatesResult {
    const eq = predicates.find((p) => p.op === "$eq");
    const ins = predicates.filter((p) => p.op === "$in");

    let current = predicates;

    if (ins.length > 0) {
        const normalizedIns = ins.map((p) => ({
            ...p,
            value: Array.isArray(p.value) ? Array.from(new Set(p.value as unknown[])) : p.value,
        }));

        current = [...predicates.filter((p) => p.op !== "$in"), ...normalizedIns];
    }

    if (eq) {
        const inPredicates = current.filter((p) => p.op === "$in");
        for (const inPredicate of inPredicates) {
            if (!Array.isArray(inPredicate.value)) {
                addWarning(normalizeContext, `field ${field}: $in value is not array`);
                return predicates;
            }

            const found = (inPredicate.value as unknown[]).some((item) => deepEqual(item, eq.value));
            if (!found) {
                return falseNode();
            }
        }
    }

    return current;
}

type RangeLower = { op: "$gt" | "$gte"; value: unknown };
type RangeUpper = { op: "$lt" | "$lte"; value: unknown };

function chooseStrongerLowerBound(lower: RangeLower | null, p: RangeLower): RangeLower {
    if (!lower) {
        return p;
    }
    const cmp = compareScalarValues(p.value, lower.value);
    if (cmp === null) {
        return lower;
    }
    if (cmp > 0) {
        return p;
    }
    if (cmp < 0) {
        return lower;
    }
    if (p.op === "$gt" && lower.op === "$gte") {
        return p;
    }
    if (p.op === "$gte" && lower.op === "$gt") {
        return lower;
    }
    return lower;
}

function chooseStrongerUpperBound(upper: RangeUpper | null, p: RangeUpper): RangeUpper {
    if (!upper) {
        return p;
    }
    const cmp = compareScalarValues(p.value, upper.value);
    if (cmp === null) {
        return upper;
    }
    if (cmp < 0) {
        return p;
    }
    if (cmp > 0) {
        return upper;
    }
    if (p.op === "$lt" && upper.op === "$lte") {
        return p;
    }
    if (p.op === "$lte" && upper.op === "$lt") {
        return upper;
    }
    return upper;
}

function mergeRangePredicates(predicates: FieldPredicate[], field: string, normalizeContext: NormalizeContext): MergePredicatesResult {
    let lower: RangeLower | null = null;
    let upper: RangeUpper | null = null;
    const others: FieldPredicate[] = [];

    for (const p of predicates) {
        if (p.op !== "$gt" && p.op !== "$gte" && p.op !== "$lt" && p.op !== "$lte") {
            others.push(p);
            continue;
        }

        if (!isComparableScalar(p.value)) {
            addWarning(normalizeContext, `field ${field}: predicate ${p.op} is not comparable`);
            return predicates;
        }

        if (p.op === "$gt" || p.op === "$gte") {
            lower = chooseStrongerLowerBound(lower, p as RangeLower);
        } else {
            upper = chooseStrongerUpperBound(upper, p as RangeUpper);
        }
    }

    if (lower && upper) {
        const cmp = compareScalarValues(lower.value, upper.value);

        if (cmp === 1) {
            return falseNode();
        }
        if (cmp === 0 && (lower.op === "$gt" || upper.op === "$lt")) {
            return falseNode();
        }
    }

    const merged: FieldPredicate[] = [...others];
    if (lower) {
        merged.push(lower);
    }
    if (upper) {
        merged.push(upper);
    }

    return merged;
}
