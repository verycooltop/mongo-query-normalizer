import type { NodeStats, ResolvedNormalizeOptions } from "./types";

export interface NormalizeContext {
    options: ResolvedNormalizeOptions;
    appliedRules: string[];
    skippedRules: string[];
    warnings: string[];
    bailedOut: boolean;
    bailoutReason?: string;
    beforeHash?: string;
    afterHash?: string;
    beforeStats?: NodeStats;
    afterStats?: NodeStats;
    depth: number;
}

export function createNormalizeContext(options: ResolvedNormalizeOptions): NormalizeContext {
    return {
        options,
        appliedRules: [],
        skippedRules: [],
        warnings: [],
        bailedOut: false,
        bailoutReason: undefined,
        beforeHash: undefined,
        afterHash: undefined,
        beforeStats: undefined,
        afterStats: undefined,
        depth: 0,
    };
}
