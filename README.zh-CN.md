# Mongo Query Normalizer

[English](README.md) | **中文**

一个面向 **MongoDB 查询对象** 的**分层规范化**工具：强调**稳定、可控、可观测**，而不是激进改写或执行计划优化。

---

## 为什么需要它

- 查询 **结构** 在不同写法下容易发散。  
- 没有稳定层时，**对比、日志、回放** 成本高。  
- 需要一层 **低风险** 的 query normalization，默认行为要保守。

本库**不以**「自动让查询更快」或「替代 planner」作为卖点。

---

## 核心特性

- **按 level 分层**：`shape` → `predicate` → `logical` → `experimental`  
- **默认安全**：默认仅 `shape`；在 **v0.1.0** 中，这也是**唯一**建议用于**一般生产环境**的 level  
- **可观测的 `meta`**：变更、规则、告警、哈希、可选统计  
- **稳定 / 幂等**（相同 options、未熔断时）  
- **不透明（opaque）回退**：不支持的算子以透传为主，不做完整语义改写  

---

## 安装

```bash
npm install mongo-query-normalizer
```

---

## 快速开始

```ts
import { normalizeQuery } from "mongo-query-normalizer";

const result = normalizeQuery({
    $and: [{ status: "open" }, { $and: [{ priority: { $gte: 1 } }] }],
});

console.log(result.query);
console.log(result.meta);
```

---

## 默认行为说明

- **默认 `level` 为 `shape`**（见 `resolveNormalizeOptions()`）。  
- 默认**不会**做激进的谓词合并或逻辑上提。  
- 默认目标是 **稳定与可观测**，不是「智能优化」。  

---

## 生产环境建议（v0.1.0）

- **一般生产流量**请使用 **`shape`**；在 **v0.1.0** 中，这是**唯一**建议用于该场景的 level。  
- `shape` 之上的 **`predicate`、`logical`、`experimental`** 属于**预览 / 不稳定**能力面，宜在**明确接受预览语义**的前提下，用于**离线分析**、**回放测试**、**语义验证**与**定向实验**，不宜作为全量在线请求的默认策略。  
- 若启用**非 `shape`** 的 level，每次调用都会在 **`meta.warnings`** 中写入一条 **v0.1.0 版本边界说明**。在**非生产**环境（`NODE_ENV !== "production"`）下，还会在进程内对**同一 level 至多输出一次**与之对应的 **`console.warn`**，便于本地开发看到同样提示，又避免重复刷屏。  

---

## Level 说明

### `shape`（默认）

**推荐用于线上主路径**；在 **v0.1.0** 中，亦是**唯一**建议用于**一般生产环境**的层级。只做安全结构规范化，例如：

- flatten logical  
- remove empty logical  
- collapse single-child logical  
- dedupe logical children  
- canonical ordering  

### `predicate`

**预览能力**：在 **v0.1.0** 中**不建议**作为一般生产环境的默认选择。在 `shape` 之上增加**保守**谓词整理：

- 同字段谓词去重  
- 可建模的比较类谓词合并  
- 明确矛盾收敛为不可满足过滤器  
- 在 `normalizePredicate` 中，**`$and` 下同名 field 的直接子 `FieldNode` 会先合并**，以便检出诸如 `{ $and: [{ a: 1 }, { a: 2 }] }` 的矛盾  

### `logical`

**预览能力**：在 **v0.1.0** 中**不建议**作为一般生产环境的默认选择。在 `predicate` 之上：

- **检测** `$or` 中的公共谓词（默认**只检测**，默认**不上提**）  

### `experimental`

**实验 / 预览层**：在 **v0.1.0** 中**不建议**作为一般生产环境的默认选择。

- 可在规则开启时对 `$or` 做 **hoist** 等实验性变换；**禁止**作为线上全量默认  

---

## `meta` 说明

| 字段 | 含义 |
|------|------|
| `changed` | 输出相对输入是否变化（基于哈希） |
| `level` | 实际使用的规范化层级 |
| `appliedRules` / `skippedRules` | 规则应用轨迹 |
| `warnings` | 观察选项开启时的非致命告警；此外，只要解析后的 level **不是** `shape`，就会**始终**附带一条 **v0.1.0 边界说明**（**不**受 `observe.collectWarnings` 影响） |
| `bailedOut` | 是否触发安全熔断 |
| `bailoutReason` | 熔断原因 |
| `beforeHash` / `afterHash` | 前后稳定哈希 |
| `stats` | 可选的前后树统计（`observe.collectMetrics`） |

---

## 不支持 / opaque 行为

以下结构通常**只透传或不参与完整语义改写**，例如：

`$nor`、`$regex`、`$not`、`$elemMatch`、`$expr`、geo / text、未知算子等。

---

## 稳定性策略

**对外承诺**仅包括：

- `normalizeQuery`  
- `resolveNormalizeOptions`  
- 入口导出的 **类型**  

**不属于**对外契约：内部 AST、`parseQuery`、`compileQuery`、各 pass/rule、工具函数等，版本间可能变化。

---

## 必须明确的原则

1. 默认是 **`shape`**。  
2. 默认 **safe-by-default**；在 **v0.1.0** 中，**一般生产环境**仅建议 **`shape`**。  
3. **`predicate` 及以上**可能改变查询结构，但在已建模算子上追求 **语义等价**。  
4. **`experimental`** 仅用于实验或离线回放验证。  
5. **opaque** 节点不会被语义重写。  
6. 在未熔断时，输出应对相同 options 保持 **幂等**。  
7. 本库 **不是** MongoDB 的 planner optimizer。  

---

## 示例场景

- **线上主路径**：`normalizeQuery(query)`（默认 `shape`；**v0.1.0** 约定的生产侧默认路径）  
- **离线分析 / 回放测试 / 语义验证 / 定向实验**：仅在可接受预览语义，以及非 `shape` 时的 `meta.warnings` 边界说明（与非生产环境下按 level 一次性的 `console.warn`）时，再启用更高 level，例如：  

```ts
normalizeQuery(query, { level: "predicate" });
```  

---

## 对外 API

```ts
normalizeQuery(query, options?) => { query, meta }
resolveNormalizeOptions(options?) => ResolvedNormalizeOptions
```

类型：`NormalizeLevel`、`NormalizeOptions`、`NormalizeRules`、`NormalizeSafety`、`NormalizeObserve`、`ResolvedNormalizeOptions`、`NormalizeResult`、`NormalizeStats`。

---

## 语义测试（基于属性的随机测试）

使用 `mongodb-memory-server` 与 `fast-check`，在固定文档 schema 与受限算子集合下对比 normalize 前后真实 `find` 结果（相同 `sort` / `skip` / `limit`，投影 `{ _id: 1 }`），并校验返回 `query` 的幂等。生成器见 `test/helpers/arbitraries.js`，**fast-check 的 seed / runs 统一由 `test/helpers/fc-config.js` 读取**（勿在单测里硬编码默认值）。

- `npm run test:unit`：单元测试（含 `test/contracts`、`test/invariants`、`test/performance`）  
- `npm run test:semantic`：语义 + 全量回归 + property（默认 `FC_RUNS=200`，见 `fc-config.js`）  
- `npm run test:semantic:quick`：本地快速跑：**降低 `FC_RUNS`（当前脚本为 45）**，仍包含 `test/regression/**` 与 `test/property/**`  
- `npm run test:semantic:ci`：CI 较完整配置（脚本内 `FC_RUNS=200`、`FC_SEED=42`）

环境变量：`FC_SEED`、`FC_RUNS`；可选 `FC_QUICK=1` 在未设 `FC_RUNS` 时将默认 runs 降为 50（见 `fc-config.js`）。

**property 失败如何复现、何时沉淀成固定用例、命名与分类**：见 [`test/REGRESSION.md`](test/REGRESSION.md)。

主随机语义等价**不包含**全文、地理、复杂 `$expr`、`$where`、聚合、collation 等；opaque 算子契约见 `test/contracts/opaque-operators.test.js`。

---

## 延伸阅读

- [SPEC.zh-CN.md](SPEC.zh-CN.md)  
- [docs/CANONICAL_FORM.md](docs/CANONICAL_FORM.md)  
