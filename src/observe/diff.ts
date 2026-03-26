import { hashNode } from "../ast/hash";
import type { QueryNode } from "../ast/types";

export function hasNodeChanged(before: QueryNode, after: QueryNode): boolean {
    return hashNode(before) !== hashNode(after);
}

export function createHashPair(before: QueryNode, after: QueryNode): { beforeHash: string; afterHash: string } {
    return {
        beforeHash: hashNode(before),
        afterHash: hashNode(after),
    };
}
