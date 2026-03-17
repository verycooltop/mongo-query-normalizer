# mongo-query-rewriter

[English](README.md) | **中文**

一个 MongoDB 查询重写器，用于规范化、简化和冲突解决。

---

## 安装

```bash
npm install mongo-query-rewriter
```

---

## 简单示例

```js
const { rewriteQuerySelector } = require("mongo-query-rewriter");

// 冗余的 $and、同字段条件会被合并
const selector = {
    $and: [
        { status: "active" },
        { score: { $gte: 0 } },
        { score: { $lte: 100 } },
    ],
};
const rewritten = rewriteQuerySelector(selector);
// → { $and: [ { status: "active" }, { score: { $gte: 0, $lte: 100 } } ] }

// 冲突条件会变成「不可满足」选择器
const impossible = rewriteQuerySelector({
    $and: [{ a: 1 }, { a: 2 }],
});
// → { _id: { $exists: false } }  (IMPOSSIBLE_SELECTOR)
```

---

## API

### `rewriteQuerySelector(selector)`

- **参数：** `selector` — 任意 MongoDB 过滤对象（与官方 `FilterQuery` 同形）。
- **返回：** 规范化后的选择器，语义等价或更严。不会修改传入的 `selector`。

在把条件交给 MongoDB 前调用即可，例如：`collection.find(rewriteQuerySelector(filter))`。

### `rewriteAst(ast)`

只对选择器的 AST 做重写（不解析、不编译）。适用于已有 AST 的高级用法（如从 operations 层的 `parseSelector` 得到）。一般使用者只需用 `rewriteQuerySelector`。

### `IMPOSSIBLE_SELECTOR`

常量：`{ _id: { $exists: false } }`。当选择器不可满足（如同一字段上的条件冲突）时会返回该值。可用 `result === IMPOSSIBLE_SELECTOR` 判断后跳过查询或短路。

### 类型：`Selector`

TypeScript 中的 MongoDB 选择器类型，与驱动里的 `FilterQuery` 兼容。使用方式：

```ts
import type { Selector } from "mongo-query-rewriter";
```

---

## 说明

- **可能返回更严的条件**：某些场景下输出会比输入更“收紧”（作为查询条件使用是安全的，但可能匹配更少文档）。
- **不可满足时**：返回 `IMPOSSIBLE_SELECTOR`。
- **幂等**：重复调用结果不变。

---

## 许可证

ISC。见 [LICENSE](LICENSE)。
