# Changelog

All notable changes to this project will be documented in this file.

Chinese version: [CHANGELOG.zh-CN.md](CHANGELOG.zh-CN.md).

## [0.1.0] - 2026-03-30

Initial public release of `mongo-query-normalizer`.

### Added

* Published the initial level-based normalization API:

  * `shape`
  * `predicate`
  * `logical`
  * `experimental`
* Exposed observable normalization metadata via `meta`, including change flags, rule traces, warnings, hashes, and optional stats.
* Added non-production console warnings for non-`shape` levels to reduce accidental misuse during development.

### Clarified

* `shape` is the **only recommended production level** in `v0.1.0`.
* The default behavior remains `level: "shape"`.
* `predicate`, `logical`, and `experimental` are published as **preview / experimental surfaces** for:

  * offline analysis
  * replay testing
  * semantic validation
  * targeted experiments
* Higher levels are **not recommended for general production traffic** in `v0.1.0`.
* `mongo-query-normalizer` should be understood as a **safe, observable, shape-first normalizer**, not a MongoDB query planner or optimizer.

### Notes

* README guidance was strengthened to make the `v0.1.0` stability boundary more explicit.
* Non-`shape` levels now add a warning to `meta.warnings`.
* Non-`shape` levels also emit a once-per-level `console.warn` in non-production environments.
* Production-readiness beyond `shape` is intentionally left out of the `v0.1.0` compatibility promise.
