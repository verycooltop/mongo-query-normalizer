import type { SelectorAST } from "./ast/types";
import type { Selector } from "./types";
import { canonicalize, fieldConditionNormalize, normalize, predicateMerge, simplify } from "./core";
import { compileSelector } from "./operations/compile";
import { parseSelector } from "./operations/parse";

/**
 * 仅对 AST 做重写（不 parse、不 compile），便于复用 AST 重写逻辑或做 AST 级测试/模糊测试。
 * 管线：normalize → predicateMerge → fieldConditionNormalize → simplify → canonicalize。
 *
 * @param ast - 已解析的选择器 AST
 * @returns 重写后的 AST，语义等价
 */
export function rewriteAst(ast: SelectorAST): SelectorAST {
    const normalized = normalize(ast);
    const merged = predicateMerge(normalized);
    const fieldNormalized = fieldConditionNormalize(merged);
    const simplified = simplify(fieldNormalized);
    return canonicalize(simplified);
}

/**
 * 重写 MongoDB 查询/过滤条件：先递归修剪分支（冲突舍弃、合并同类项），再按结合律打平并规范化；
 *
 * @param selector - 原始选择器
 * @returns 重写后的选择器，语义等价或更严
 */
export function rewriteQuerySelector(selector: Selector): Selector {
    const ast = parseSelector(selector);
    const canonical = rewriteAst(ast);
    return compileSelector(canonical);
}