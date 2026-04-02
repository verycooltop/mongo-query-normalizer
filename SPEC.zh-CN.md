# Mongo Query Normalizer — 规格说明

`mongo-query-normalizer` 的**行为向**规格：可测试、可分层，定位为 **normalizer**，不是执行计划优化器。

---

## 1. 目标

1. 将 MongoDB **查询对象**解析为内部 **AST**。  
2. 按 **level** 启用规范化步骤，**默认最保守**。  
3. 编译回普通对象并附带 **可观测 meta**。

对已建模算子（§7），在满足条件下追求：

```
match(query, doc) == match(normalized(query), doc)
```

若在 `predicate` 及以上层级下可证明**不可满足**，编译结果可为：

```
normalized(query) = IMPOSSIBLE_SELECTOR
```

当前实现中 `IMPOSSIBLE_SELECTOR` 为：`{ _id: { $exists: false } }`（常规集合上canonical 空集过滤器）。

**重要保守边界：** 在缺乏 schema 的前提下，规范化器不得仅基于以下信息就推断不可满足、并输出 `IMPOSSIBLE_SELECTOR`：

- `$eq`/`$in` 的“未命中包含关系”（即 `eq ∉ in`）
- 点路径（dotted path）在 multikey 场景下的局部矛盾（例如 `$and` 合取的点路径谓词，可能由不同数组元素分别满足）

这类推断对 multikey（数组）字段并不可靠。

---

## 2. 对外边界

对外契约仅 **`normalizeQuery`**、**`resolveNormalizeOptions`** 及包入口导出的**类型**。AST、parse、compile、规则与 pass **不**保证 semver 稳定。

**默认：** `resolveNormalizeOptions()` 的 `level` 为 **`"shape"`**。

---

## 3. 固定管线

单次 `normalizeQuery`：

```
parseQuery
→（外圈多轮）稳定化：normalizeShape / normalizePredicate+simplify / normalizeScope+simplify / canonicalize
→ compileQuery → parseQuery（一次内部 BSON 往返，使 AST 与编译后的字段归组对齐；再跑一轮稳定化）
→ detectCommonPredicatesInOr（仅 scope、可选；observe-only：告警/轨迹，不改写结构）
→ canonicalize
→ compileQuery
```

各阶段均有轮次上限；未收敛时可在 `meta.warnings` 中记录（需 `observe.collectWarnings`）。

---

## 4. 熔断策略

一旦 **bailout**，最终用于 compile 的节点 **回退为 beforeNode**（该次调用的 parse 结果），即：

- `meta.bailedOut === true` 时，**不**采用中间规范化结果作为输出基础。

---

## 5. AST 模型（摘要）

- `LogicalNode` — `$and` / `$or` 与子节点列表  
- `FieldNode` — 字段名与谓词列表  
- `TrueNode` / `FalseNode`  
- `OpaqueNode` — 原始片段透传  

（具体字段属实现细节，行为以本文与测试为准。）

---

## 6. Level 与规则

### 6.1 `shape`（默认）

仅安全结构规范化；**不**做谓词级合并；**不**将矛盾收敛为 `FalseNode`。

### 6.2 `predicate`

在 `shape` 上增加：同字段去重、可合并谓词合并、以及**在无 schema 前提下可证明安全**的矛盾折叠（例如同值的 `$eq` 与 `$ne`）。

**特别说明：** 在 `normalizePredicate` 中，`$and` 下**同名 field 的直接子 `FieldNode`** 可能先合并再进入谓词规范化；但若合并后同一**非点路径**字段上会出现**两个及以上互异的 `$eq` 值**，则**保留**为多条 `$and` 子句，避免编译成单一对象字段值（相对 Mongo 的 `$and` 合取会**错误放宽**）。**未知字段基数**（多键/数组语义）按**保守**处理：互斥的多个 `$eq`、`$eq` 与 range、`$in` 与 range、多个 `$in`、不相交的 range 组合**不会**在本层判为不可满足。

### 6.3 `scope`

在 `predicate` 上增加 **scope 规范化**，主能力为：

1. **继承约束传播** — phase-1 白名单字段约束自祖先与 `$and` 兄弟合并入子节点的 `ConstraintSet`（受策略开关约束）。  
2. **保守分支剪枝** — `allowBranchPruning` 开启时，分支可满足性沿用与谓词层一致的**保守**字段 bundle 分析（默认不做 schema 假设）。仅当该分析给出**已建模矛盾**（例如继承 `$eq` 与分支同值 `$ne`）时才剪枝；仅因「标量视角」下的 `$eq`/`range`/`$in` 冲突不足以在多键语义下判不可满足。关闭剪枝时记录策略跳过类 trace 并保留分支。  
3. **覆盖消除（coverage elimination）** — 在 `allowConstraintCoverageElimination` 且继承元数据干净时，可移除被继承约束覆盖的局部冗余约束（**场景狭窄**，以实现与测试为准）。

**可选、仅观测：** `rules.detectCommonPredicatesInOr` 开启时对 `$or` 内公共谓词做**检测**（warnings / 可选轨迹），**不属于** scope 核心传播叙事，**不做**结构上提或改写。

### 6.4 Scope 层契约（保守边界）

- **继承 allowlist：** 仅 phase-1 抽取规则下的约束进入继承集；其余算子/片段在抽取层**拒绝**（开启 scope trace 时记录 rejection），AST **保留**原样。  
- **字段 bundle 拒绝：** `exists`、`$ne`、`$nin`、opaque 片段及不支持的复合形状不作为约束源；兄弟合并跳过不可抽取部分，**不**放宽语义。  
- **不支持的继承元数据：** 继承集标记 `hasUnsupportedSemantics` 时，对该处**跳过覆盖消除**；`bailoutOnUnsupportedScopeMix` 为真时可能直接 **bailout**（见 §4）。  
- **覆盖消除：** 仅覆盖**已验证的狭窄情形**（如同字段继承 `$eq` 与局部冗余 `$eq` 一致），**不**声称对任意算子的一般冗余消除。  
- **分支剪枝：** 仅当继承与分支字段 bundle 经谓词局部规范化**报告矛盾**时执行；策略关闭 ⇒ **不**剪枝；剪枝**不**在 predicate 之外新增谓词级合并。

---

## 7. 已建模 vs opaque

**已建模**（可走合并/矛盾路径）：至少包含实现所支持的 `$eq`、`$ne`、`$gt`、`$gte`、`$lt`、`$lte`、`$in`、`$nin`、`$exists` 等。

**opaque / 支持有限**：尤其 **`$nor`**、**`$regex`**、**`$elemMatch`**、**`$expr`**、**`$not`**、geo/text、未知 `$` 算子等——以透传或部分处理为主，**不保证**完整语义改写。

---

## 8. compile 策略

- `TrueNode` → `{}`  
- `FalseNode` → `IMPOSSIBLE_SELECTOR`  
- `OpaqueNode` → 按实现原样透传  
- `FieldNode` / `LogicalNode` → 对应 BSON 查询形状  
- **同一 `FieldNode` 上重复建模算子**（同一字段对象内同一 `$` 键出现多次，例如两个 `$in`）：编译为 `{ $and: [ { 字段: { $in: … } }, … ] }`，避免 BSON 重复键被覆盖为单一值。  

---

## 9. 非目标

- 不做 MongoDB **planner** 或索引优化。  
- 不追求覆盖全部 Mongo 算子。  
- **不做** `$or` 公共谓词的结构上提（scope 下仅为检测）。

---

## 10. 不变量（无熔断时）

- 已建模算子上对可满足查询的**语义保持**（§1）。  
- **幂等性**：相同 options 下多次规范化应稳定。  
- **不修改**调用方传入的 query 对象。  

---

## 11. 测试要求

应覆盖：默认 `shape`、`predicate` / `scope` 显式开启（含已支持 vs opaque 保留）、`meta` 字段、熔断回退、幂等。可选：对接真实 MongoDB 做差分回归。语义测试可通过 `MONGODB_BINARY`、`MONGOD_BINARY` 或 `MONGOMS_SYSTEM_BINARY` 指定本机 `mongod`，以减少在线拉取二进制。
