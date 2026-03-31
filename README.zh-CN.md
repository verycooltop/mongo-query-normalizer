# Mongo Query Normalizer

[English](README.md) | **中文**

一个面向 **MongoDB 查询对象** 的**分层规范化**工具：强调**稳定、可控、可观测**，而不是激进改写或执行计划优化。

> **v0.1.0 版本边界：** 面向**一般生产流量**，请**只使用 `shape`**——在本版本中，它是我们**唯一**作此用途推荐的 level。其上的 **`predicate`、`logical`、`experimental`** 属于**预览 / 实验向**能力，更适合**离线分析、回放测试、语义校验与定向实验**，不宜无差别地作为全量在线请求的默认策略。

---

## 为什么需要它

- 查询 **结构** 在不同写法下容易发散。  
- 没有稳定层时，**对比、日志、回放** 成本高。  
- 需要一层 **低风险** 的 query normalization，默认行为要保守。

本库**不以**「自动让查询更快」或「替代 planner」作为卖点。

---

## 核心特性

- **按 level 分层**：`shape` → `predicate` → `logical` → `experimental`  
- **默认保守**：开箱仅 `shape`；在 **v0.1.0** 中，这也是**唯一**建议用于**一般生产环境**的 level  
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
2. 在默认 **`shape`** 路径上，API 面向 **v0.1.0** 的**一般生产用途**而设计；更高 level 不在此承诺范围内。  
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

## 测试

### 测试布局

本仓库按 **对外 API**、**规范化 level** 与 **跨 level 契约** 组织测试，并保留更深的语义与回归套件。

### 目录职责

#### `test/api/`

覆盖对外 API 与配置面。

适合放在此处的验证包括：

* `normalizeQuery` 的返回形态与顶层行为
* `resolveNormalizeOptions`
* 预览 / 警告边界行为
* 包导出

**不要**把「某一 level 专属的规范化行为」放在这里。

---

#### `test/levels/`

覆盖每个 `NormalizeLevel` 的行为边界。

当前 level：

* `shape`
* `predicate`
* `logical`
* `experimental`

每个 level 的测试文件宜聚焦四件事：

1. 该 level 的**正向能力**
2. 该 level **明确未启用**的行为
3. 与**相邻 level** 的对比
4. 少量**代表性契约**

断言上优先：

* 规范化后的 **query 结构**
* **跨 level 可观察的差异**
* **稳定的对外 meta**（如 `meta.level` 等）

尽量避免过度绑定：

* warning **逐字全文**
* 内部 **规则 ID 字符串**
* **子句顺序**（除非顺序本身就是契约的一部分）

---

#### `test/contracts/`

覆盖「应对所有 level 成立」的契约，或与单一 level 无关的默认行为。

适合放在此处的内容包括：

* 默认 level 行为
* 各 level 下的幂等
* 各 level 下的输出不变式
* 各 level 下的 opaque 子树保留

全 level 套件请配合 `test/helpers/level-contract-runner.js` 使用。

---

#### `test/semantic/`

对照真实执行行为做**语义等价**验证，确保规范化不改变含义。

该目录有意与 `levels/`、`contracts/` 分开。

---

#### `test/property/`

基于属性的随机测试与变形（metamorphic）行为。

适用于：

* 随机语义检查
* 变形不变式
* 较宽输入空间上的校验

**不要**把它当作表达「level 边界」的主战场。

---

#### `test/regression/`

已知历史失败与手工回归用例。

修复了一个不应再犯的 bug 时，把用例加在这里。

---

#### `test/performance/`

性能护栏或与复杂度相关的行为。

应聚焦性能相关预期，而非一般性的规范化结构细节。

---

### 辅助文件

#### `test/helpers/level-runner.js`

在指定 level 下执行 `normalizeQuery` 的共享封装。

#### `test/helpers/level-cases.js`

跨 level 测试共用的固定输入；优先把可复用的代表用例加在这里，避免在多个文件里复制同一段 fixture。

#### `test/helpers/level-contract-runner.js`

全 level 契约套件共用的 `LEVELS` 与 `forEachLevel` 等辅助逻辑。

---

### 新增测试时的规则

#### 新增一条规范化规则时

先问：

* 是否属于对外 API 行为？→ 加到 `test/api/`
* 是否仅在某一 level 启用？→ 加到 `test/levels/`
* 是否应对所有 level 成立？→ 加到 `test/contracts/`
* 是否关乎语义保持或随机验证？→ 加到 `test/semantic/` 或 `test/property/`
* 是否针对曾坏过的场景的修复？→ 加到 `test/regression/`

---

#### 新增一个 level 时

至少完成：

1. 新增 `test/levels/<level>-level.test.js`
2. 在 `test/helpers/level-contract-runner.js` 中注册该 level
3. 确保全 level 契约套件会跑到它
4. 至少补一条与相邻 level 的**对照**用例

---

### 测试风格建议

宜：

* 用**基于示例**的用例表达 level 边界
* 断言 **query 形状**
* 做**相邻 level 对照**
* **共享**代表性 fixture

忌：

* 把 level 测试绑死在易变的实现细节上
* 同一 fixture 只改断言表面、重复堆砌
* 把「默认 level」契约塞进某个具体 level 文件
* 把导出/API 测试与规范化行为测试混在同一文件语义里

---

### 实用对照

* `api/`：**库怎么用**
* `levels/`：**每一层做与不做**
* `contracts/`：**哪些必须恒真**
* `semantic` / `property` / `regression` / `performance`：**正确、稳健、效率是否仍成立**

---

### npm 脚本与 property 测试工具链

随机语义测试使用 **`mongodb-memory-server`** 与 **`fast-check`**，在固定文档 schema 与受限算子集合下，对比 normalize 前后真实 `find` 结果（相同 `sort` / `skip` / `limit`，投影 `{ _id: 1 }`），并断言 **`_id` 顺序一致**、返回 **`query` 幂等**；对 opaque 算子仅要求**不崩溃、第二次 normalize 稳定**。生成器见 `test/helpers/arbitraries.js`；**`FC_SEED` / `FC_RUNS` 默认值统一由 `test/helpers/fc-config.js` 管理**（也由 `arbitraries.js` 再导出）。

* **`npm run test`**：先 build，再 `test:unit`，再 `test:semantic`。
* **`npm run test:api`**：仅 `test/api/**/*.test.js`。
* **`npm run test:levels`**：`test/levels/**/*.test.js` 与 `test/contracts/*.test.js`。
* **`npm run test:unit`**：除 `test/semantic/**`、`test/regression/**`、`test/property/**` 外的 `test/**/*.test.js`（含 `test/api/**`、`test/levels/**`、`test/contracts/**`、`test/performance/**` 等单元侧用例）。
* **`npm run test:semantic`**：语义 + 回归 + property（环境变量未设时的默认见 `fc-config.js`）。
* **`npm run test:semantic:quick`**：降低 **`FC_RUNS`（脚本内为 45）** 并设 **`FC_SEED=42`**，仍包含 `test/regression/**` 与 `test/property/**`。
* **`npm run test:semantic:ci`**：面向 CI（脚本内 `FC_RUNS=200`、`FC_SEED=42`）。

可通过 **`FC_SEED`**、**`FC_RUNS`**、可选 **`FC_QUICK=1`** 覆盖 property 参数（见 `fc-config.js`）。**property 失败如何复现、何时沉淀成固定用例**：见 [`test/REGRESSION.md`](test/REGRESSION.md)。

主随机语义等价**不包含**全文、地理、复杂 `$expr`、`$where`、聚合、collation 等；opaque 算子契约见 **`test/contracts/opaque-operators.all-levels.test.js`**。

---

## 延伸阅读

- [SPEC.zh-CN.md](SPEC.zh-CN.md)  
- [docs/CANONICAL_FORM.md](docs/CANONICAL_FORM.md)  
