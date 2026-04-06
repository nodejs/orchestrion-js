# Changelog

## [0.12.0](https://github.com/nodejs/orchestrion-js/compare/code-transformer-v0.11.0...code-transformer-v0.12.0) (2026-04-06)


### Features

* **transformer:** add objectName+propertyName selector to #fromFunctionQuery ([#58](https://github.com/nodejs/orchestrion-js/issues/58)) ([3f0e14d](https://github.com/nodejs/orchestrion-js/commit/3f0e14dc7ea3ff6d022918d67f865f801532502a))


### Bug Fixes

* Preserve Promise subclass return values in wrapPromise ([#57](https://github.com/nodejs/orchestrion-js/issues/57)) ([d59a4e6](https://github.com/nodejs/orchestrion-js/commit/d59a4e60c068cdb95c8d2a71b76f61ce6112b53a))
* Updated `Transformer.#visit` to skip visiting VariableDeclarator nodes ([#55](https://github.com/nodejs/orchestrion-js/issues/55)) ([b494f56](https://github.com/nodejs/orchestrion-js/commit/b494f56c57ec33c6ad1995da54a880dec7415d71))

## [0.11.0](https://github.com/nodejs/orchestrion-js/compare/code-transformer-v0.10.0...code-transformer-v0.11.0) (2026-03-27)


### Features

* Rewrite orchestrion in javascript ([#41](https://github.com/nodejs/orchestrion-js/issues/41)) ([2069006](https://github.com/nodejs/orchestrion-js/commit/2069006efd6f1d31ae44f77c4c7eb1e69a73f945))


### Bug Fixes

* Fixed `tracePromise` to handle returning result when function being wrapped is not a promise ([#46](https://github.com/nodejs/orchestrion-js/issues/46)) ([e864993](https://github.com/nodejs/orchestrion-js/commit/e864993c60f4915c3806cd4b2691b19658aef05b))
* Updated `release-please` to handle publishing only javascript code ([#48](https://github.com/nodejs/orchestrion-js/issues/48)) ([b682f31](https://github.com/nodejs/orchestrion-js/commit/b682f318d72d58aca098b14b7c0ccb22f4035f68))
* Updated regular expression for creating the tracing channel variable ([#45](https://github.com/nodejs/orchestrion-js/issues/45)) ([fc0aaa1](https://github.com/nodejs/orchestrion-js/commit/fc0aaa14a5f1c87df0f7e08ee251701b2d9ada89))

## [0.10.0](https://github.com/nodejs/orchestrion-js/compare/code-transformer-v0.9.0...code-transformer-v0.10.0) (2026-03-06)


### Features

* Convert windows path to unix path before comparing against ModuleMatcher file_path value. ([#40](https://github.com/nodejs/orchestrion-js/issues/40)) ([da7b7cb](https://github.com/nodejs/orchestrion-js/commit/da7b7cb1cc7d3feb6bdfddd28d6905807b001d2e))
* Match more class declarations for export alias check ([#37](https://github.com/nodejs/orchestrion-js/issues/37)) ([804a9c6](https://github.com/nodejs/orchestrion-js/commit/804a9c6b91bc82bd5c1b61976544f097aa02f5e9))

## [0.9.0](https://github.com/nodejs/orchestrion-js/compare/code-transformer-v0.8.2...code-transformer-v0.9.0) (2026-02-26)


### Features

* Add support for matching export alias ([#29](https://github.com/nodejs/orchestrion-js/issues/29)) ([2169e27](https://github.com/nodejs/orchestrion-js/commit/2169e27fc29ad89cc8b6bbc4ece3be59ab0c87a6))
* Added support for wrapping private class methods ([#33](https://github.com/nodejs/orchestrion-js/issues/29)) ([22d069d](https://github.com/nodejs/orchestrion-js/commit/22d069d23ea5fd1a4bc21f572b8febd6efae9c72))

## [0.8.2](https://github.com/apm-js-collab/orchestrion-js/compare/code-transformer-v0.8.1...code-transformer-v0.8.2) (2025-09-26)


### Bug Fixes

* Properly assign `async` keyword only to wrapped functions that had `async` keyword on original ([#50](https://github.com/apm-js-collab/orchestrion-js/issues/50)) ([0495589](https://github.com/apm-js-collab/orchestrion-js/commit/04955898ee1ce3a280f0d029e1fb605b198a3217))

## [0.8.1](https://github.com/apm-js-collab/orchestrion-js/compare/code-transformer-v0.8.0...code-transformer-v0.8.1) (2025-09-24)


### Bug Fixes

* Hardcode wrapped arrow functions to not specify `async` key to avoid wrapping non-native promises ([#48](https://github.com/apm-js-collab/orchestrion-js/issues/48)) ([8b43c92](https://github.com/apm-js-collab/orchestrion-js/commit/8b43c9260efeb5602185b80b6ff827790fa1ee43))

## [0.8.0](https://github.com/apm-js-collab/orchestrion-js/compare/code-transformer-v0.7.2...code-transformer-v0.8.0) (2025-09-19)


### Features

* Inline wasm binary ([#46](https://github.com/apm-js-collab/orchestrion-js/issues/46)) ([9da6297](https://github.com/apm-js-collab/orchestrion-js/commit/9da6297762dbb7dc46e11a9d62fa8b1b462ba17d))
* Load wasm lazily ([#45](https://github.com/apm-js-collab/orchestrion-js/issues/45)) ([399e942](https://github.com/apm-js-collab/orchestrion-js/commit/399e942fae21d9f16125eba20113c81940d191ff))

## [0.7.2](https://github.com/apm-js-collab/orchestrion-js/compare/code-transformer-v0.7.1...code-transformer-v0.7.2) (2025-09-12)


### Bug Fixes

* Ensure build before publish ([#41](https://github.com/apm-js-collab/orchestrion-js/issues/41)) ([e196dcf](https://github.com/apm-js-collab/orchestrion-js/commit/e196dcf02ba0eac36811180f271db7ef1dc789db))

## [0.7.1](https://github.com/apm-js-collab/orchestrion-js/compare/code-transformer-v0.7.0...code-transformer-v0.7.1) (2025-09-11)

### Bug Fixes

* `versionRange` TypeScript definition ([#35](https://github.com/apm-js-collab/orchestrion-js/issues/35)) ([89cff5a](https://github.com/apm-js-collab/orchestrion-js/commit/89cff5a80bc1149c0bf0b930bf785c75b1d6ac2f))

## 0.7.0

- feat: Sourcemap support (#16)
- feat: Update all dependencies (#24)
- feat: Include module version in event args (#23)

### Bug Fixes

* `versionRange` TypeScript definition ([#35](https://github.com/apm-js-collab/orchestrion-js/issues/35)) ([89cff5a](https://github.com/apm-js-collab/orchestrion-js/commit/89cff5a80bc1149c0bf0b930bf785c75b1d6ac2f))

## 0.6.0

- fix: Allow for argumentation mutation in complex argument functions (#19)

## 0.5.0

- fix: Allow injecting into functions nested in functions (#17)

## 0.4.0

- feat: Error when code injection fails (#9)
- feat: Allow `unknown` module type (#11)
- fix: `wasm-pack` should be in `devDependencies` (#12)
- fix: Use uniquely named local variables (#13)

## 0.3.0

- fix: Handle `module.exports = class Foo` when locating classes (#7)

## 0.2.0

- fix: Ensure `channel_name` doesn't cause invalid JavaScript identifiers (#4)
- fix: Don't check for matching sync/async function type (#5)

## 0.1.1

- Initial publish of the temporary package.
