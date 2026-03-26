import type { NormalizeLevel, NormalizeObserve, NormalizeRules, NormalizeSafety } from "../types";

export const DEFAULT_LEVEL: NormalizeLevel = "shape";

export const DEFAULT_SAFETY: NormalizeSafety = {
    maxNormalizeDepth: 32,
    maxNodeGrowthRatio: 1.5,
};

export const DEFAULT_OBSERVE: NormalizeObserve = {
    collectWarnings: true,
    collectMetrics: false,
};

const SORT_RULES: Pick<NormalizeRules, "sortLogicalChildren" | "sortFieldPredicates"> = {
    sortLogicalChildren: true,
    sortFieldPredicates: true,
};

const BASE_SHAPE_RULES: Pick<
    NormalizeRules,
    | "flattenLogical"
    | "removeEmptyLogical"
    | "collapseSingleChildLogical"
    | "dedupeLogicalChildren"
> = {
    flattenLogical: true,
    removeEmptyLogical: true,
    collapseSingleChildLogical: true,
    dedupeLogicalChildren: true,
};

const PREDICATE_RULES: Pick<
    NormalizeRules,
    "dedupeSameFieldPredicates" | "mergeComparablePredicates" | "collapseContradictions"
> = {
    dedupeSameFieldPredicates: true,
    mergeComparablePredicates: true,
    collapseContradictions: true,
};

const LOGICAL_EXTRA: Pick<NormalizeRules, "detectCommonPredicatesInOr"> = {
    detectCommonPredicatesInOr: true,
};

const EXPERIMENTAL_EXTRA: Pick<NormalizeRules, "hoistCommonPredicatesFromOr"> = {
    hoistCommonPredicatesFromOr: true,
};

function rulesForLevel(level: NormalizeLevel): NormalizeRules {
    const base: NormalizeRules = {
        ...BASE_SHAPE_RULES,
        dedupeSameFieldPredicates: false,
        mergeComparablePredicates: false,
        collapseContradictions: false,
        ...SORT_RULES,
        detectCommonPredicatesInOr: false,
        hoistCommonPredicatesFromOr: false,
    };

    if (level === "shape") {
        return base;
    }

    const withPredicate: NormalizeRules = {
        ...base,
        ...PREDICATE_RULES,
    };

    if (level === "predicate") {
        return withPredicate;
    }

    const withLogical: NormalizeRules = {
        ...withPredicate,
        ...LOGICAL_EXTRA,
    };

    if (level === "logical") {
        return withLogical;
    }

    return {
        ...withLogical,
        ...EXPERIMENTAL_EXTRA,
    };
}

export const DEFAULT_RULES_BY_LEVEL: Record<NormalizeLevel, NormalizeRules> = {
    shape: rulesForLevel("shape"),
    predicate: rulesForLevel("predicate"),
    logical: rulesForLevel("logical"),
    experimental: rulesForLevel("experimental"),
};
