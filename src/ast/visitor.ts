import type { SelectorAST } from "./types";

export function visit(node: SelectorAST, fn: (node: SelectorAST) => SelectorAST): SelectorAST {
    const next = fn(node);

    if (next.type === "logical") {
        const children = next.children.map((child) => visit(child, fn));
        return { ...next, children };
    }

    return next;
}
