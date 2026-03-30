# 更新日志

本文件记录本项目的重要变更，与英文 [CHANGELOG.md](CHANGELOG.md) 语义对齐。

## [0.1.0] - 2026-03-30

`mongo-query-normalizer` 的首次公开发布。

### 新增

* 发布初始的分层规范化 API：

  * `shape`
  * `predicate`
  * `logical`
  * `experimental`
* 通过 `meta` 提供可观测的规范化元数据，包括变更标记、规则轨迹、告警、哈希与可选统计。
* 在非生产环境下，对非 `shape` level 输出控制台提示，以降低开发阶段误用的概率。

### 说明与边界

* 在 **v0.1.0** 中，**`shape` 是唯一建议用于一般生产环境的 level**。
* 默认行为仍为 `level: "shape"`。
* **`predicate`、`logical`、`experimental` 作为预览 / 实验能力发布**，适用于：

  * 离线分析
  * 回放测试
  * 语义验证
  * 定向实验
* 在 **v0.1.0** 中，**更高 level 不建议作为一般生产流量的默认选择**。
* 应将本库理解为**可观测、以 shape 为先的规范化层**，默认路径**偏保守、面向一般生产**，而非 MongoDB 查询规划器或优化器。

### 备注

* README 已加强表述，使 **v0.1.0 稳定性边界**更加明确。
* 非 `shape` level 会在每次调用的 **`meta.warnings`** 中写入边界提示。
* 非 `shape` level 在**非生产环境**下还会按 level **至多触发一次** `console.warn`。
* **v0.1.0** 的兼容性承诺**有意不包含**除 `shape` 外其他 level 的「生产就绪」保证。
