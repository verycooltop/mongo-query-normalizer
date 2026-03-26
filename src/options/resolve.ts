import type { NormalizeLevel, NormalizeOptions, ResolvedNormalizeOptions } from "../types";
import {
    DEFAULT_LEVEL,
    DEFAULT_OBSERVE,
    DEFAULT_RULES_BY_LEVEL,
    DEFAULT_SAFETY,
} from "./constants";

export function resolveNormalizeOptions(options?: NormalizeOptions): ResolvedNormalizeOptions {
    const level = resolveLevel(options?.level);

    return {
        level,
        rules: mergeRules(level, options?.rules),
        safety: mergeSafety(options?.safety),
        observe: mergeObserve(options?.observe),
    };
}

function resolveLevel(level?: NormalizeLevel): NormalizeLevel {
    return level ?? DEFAULT_LEVEL;
}

function mergeRules(level: NormalizeLevel, rules?: Partial<ResolvedNormalizeOptions["rules"]>) {
    return {
        ...DEFAULT_RULES_BY_LEVEL[level],
        ...(rules ?? {}),
    };
}

function mergeSafety(safety?: Partial<ResolvedNormalizeOptions["safety"]>) {
    return {
        ...DEFAULT_SAFETY,
        ...(safety ?? {}),
    };
}

function mergeObserve(observe?: Partial<ResolvedNormalizeOptions["observe"]>) {
    return {
        ...DEFAULT_OBSERVE,
        ...(observe ?? {}),
    };
}
