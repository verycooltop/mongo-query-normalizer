# mongo-query-normalizer

[English](README.md) | **中文**

> 安全的 MongoDB 查询规范化器 —— **正确优先于「聪明」**

---

## ✨ 它能做什么

**把杂乱的 Mongo 查询，安全地变成干净、稳定、可预期的形态。**

```js
// 之前
{
  $and: [
    { status: "open" },
    { status: { $in: ["open", "closed"] } }
  ]
}

// 之后
{ status: "open" }
```

---

## ⚠️ 为什么重要

如果你在做动态查询，迟早会遇到：

* 重复条件
* 查询结构不一致
* 难以调试的过滤器
* 隐蔽的语义问题

多数工具会试图「优化」查询。

👉 本库做法不同：

> **只应用可证明安全的变换。**

---

## 🛡️ 设计上就安全

```js
// 不会简化（这是对的）
{
  $and: [
    { uids: "1" },
    { uids: "2" }
  ]
}
```

原因？

因为 MongoDB 数组可以同时满足两者：

```js
{ uids: ["1", "2"] }
```

---

## ❌ 这不是什么

* 不是查询优化器
* 不是索引顾问
* 不是性能工具

**绝不会猜测**：

* 字段基数
* schema 约束
* 数据分布

不确定 → **跳过**

---

## 🚀 快速开始

```ts
import { normalizeQuery } from "mongo-query-normalizer";

const { query } = normalizeQuery(inputQuery);
```

---

## 🧠 在架构中的位置

```text
Query Builder / ORM
        ↓
   normalizeQuery   ← （本库）
        ↓
      MongoDB
```

你不是要换掉构建器。
你是要**净化它的输出**。

---

## 🧩 适用场景

* 动态筛选 / 搜索 API
* BI / 报表系统
* 用户生成的查询
* 多团队、查询写法不一致的代码库
* 日志 / 缓存 / 对查询做 diff

---

## ⚙️ Levels

| Level       | 作用           | 安全级别   |
| ----------- | -------------- | ---------- |
| `shape`     | 结构规范化     | 🟢 最稳妥 |
| `predicate` | 安全的谓词简化 | 🟡         |
| `scope`     | 有限的约束传播 | 🟡         |

默认为 `shape`。

---

## 📦 输出

```ts
{
  query, // 规范化后的查询
  meta   // 调试 / 轨迹信息
}
```

---

## 🎯 设计理念

> 若某次改写可能出错，就不要做。

* 不做 schema 假设
* 不猜数组语义
* 不做不安全合并
* 输出确定
* 结果幂等

---

## 🔍 示例

```ts
const result = normalizeQuery({
  $and: [
    { status: "open" },
    { status: { $in: ["open", "closed"] } }
  ]
});

console.log(result.query);
// { status: "open" }
```

---

## 📚 文档

* [`SPEC.zh-CN.md`](SPEC.zh-CN.md) — 行为规格（[English](SPEC.md)）
* [`docs/normalization-matrix.zh-CN.md`](docs/normalization-matrix.zh-CN.md) — 规则覆盖（[English](docs/normalization-matrix.md)）
* [`docs/CANONICAL_FORM.md`](docs/CANONICAL_FORM.md) — 规范形态与幂等性（目前仅英文）
* [`CHANGELOG.zh-CN.md`](CHANGELOG.zh-CN.md) — 更新日志（[English](CHANGELOG.md)）
* [`test/REGRESSION.md`](test/REGRESSION.md) — 复现 property / 语义测试失败（目前仅英文）
* [`README.md`](README.md) — English README

---

## 🧪 测试

* 语义等价测试（真实 MongoDB）
* 基于属性的测试
* 回归套件

---

## ⭐ 理念

多数查询工具追求「聪明」。

本库追求**正确**。
