/**
 * MongoDB 查询对象（规范化入口的输入/输出形状）
 */
export type Query = Record<string, unknown>;

export type NormalizeLevel = "shape" | "predicate" | "logical" | "experimental";

export interface NormalizeRules {
    flattenLogical: boolean;
    removeEmptyLogical: boolean;
    collapseSingleChildLogical: boolean;
    dedupeLogicalChildren: boolean;
    dedupeSameFieldPredicates: boolean;
    mergeComparablePredicates: boolean;
    collapseContradictions: boolean;
    sortLogicalChildren: boolean;
    sortFieldPredicates: boolean;
    detectCommonPredicatesInOr: boolean;
    hoistCommonPredicatesFromOr: boolean;
}

export interface NormalizeSafety {
    maxNormalizeDepth: number;
    maxNodeGrowthRatio: number;
}

export interface NormalizeObserve {
    collectWarnings: boolean;
    collectMetrics: boolean;
}

export interface NormalizeOptions {
    level?: NormalizeLevel;
    rules?: Partial<NormalizeRules>;
    safety?: Partial<NormalizeSafety>;
    observe?: Partial<NormalizeObserve>;
}

export interface ResolvedNormalizeOptions {
    level: NormalizeLevel;
    rules: NormalizeRules;
    safety: NormalizeSafety;
    observe: NormalizeObserve;
}

export interface NodeStats {
    nodeCount: number;
    maxDepth: number;
    andCount: number;
    orCount: number;
}

/** 对外名称：`meta.stats` 中 before/after 的树统计。 */
export type NormalizeStats = NodeStats;

export interface NormalizeMeta {
    changed: boolean;
    level: NormalizeLevel;
    appliedRules: string[];
    skippedRules: string[];
    warnings: string[];
    bailedOut: boolean;
    bailoutReason?: string;
    beforeHash?: string;
    afterHash?: string;
    stats?: {
        before: NodeStats;
        after: NodeStats;
    };
}

export interface NormalizeResult<Q = Query> {
    query: Q;
    meta: NormalizeMeta;
}

/**
 * FalseNode 编译结果：不可满足选择器（与设计文档一致）
 */
export const IMPOSSIBLE_SELECTOR: Query = { $expr: { $eq: [1, 0] } } as Query;
