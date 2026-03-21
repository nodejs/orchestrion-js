# Orchestrion-JS / `@apm-js-collab/code-transformer`

This is a library to aid in instrumenting Node.js libraries at build or load
time.

It uses an AST walker to inject code that calls Node.js
[`TracingChannel`](https://nodejs.org/api/diagnostics_channel.html#class-tracingchannel).

You likely don't want to use this library directly; instead, consider using:

- [`@apm-js-collab/tracing-hooks/`](https://github.com/apm-js-collab/tracing-hooks/)
  - ESM and `require` hooks to instrument modules as they are loaded.
- [`apm-js-collab/code-transformer-bundler-plugins`](https://github.com/apm-js-collab/code-transformer-bundler-plugins)
  - Bundler plugins for webpack, Vite, Rollup and esbuild to instrument modules
    at build time.

## JavaScript

`@apm-js-collab/code-transformer` exposes the library.

### Usage

```javascript
import * as codeTransformer from "@apm-js-collab/code-transformer";

// The full instrumentation config
const instrumentation = {
    // The name of the diagnostics channel
    channelName: "my-channel",
    // Define the module you'd like to inject tracing channels into
    module: {
        name: "my-module",
        versionRange: ">=1.0.0",
        filePath: "./dist/index.js",
    },
    // Define the function you'd like to instrument
    // (e.g., match a method named 'foo' that returns a Promise)
    functionQuery: {
        methodName: "fetch",
        kind: "Async",
    },
};

// Create an InstrumentationMatcher with an array of instrumentation configs
const matcher = codeTransformer.create([instrumentation]);

// Get a transformer for a specific module
const transformer = matcher.getTransformer(
    "my-module",
    "1.2.3",
    "./dist/index.js",
);

if (transformer === undefined) {
    throw new Error("No transformer found for module");
}

// Transform code
const inputCode = "async function fetch() { return 42; }";
const result = transformer.transform(inputCode, "unknown");
console.log(result.code);
```

### Export Aliases

When a module re-exports a function or class under a different name using
`export { local as exported }`, you can target the **exported** name in your
`FunctionQuery` by setting `isExportAlias: true`. The transformer will resolve
the alias to the local declaration before matching.

For example, given:

```js
function f(url) { return fetch(url); }
export { f as fetchAliased };
```

You can target `fetchAliased` in your config:

```js
const instrumentation = {
    channelName: "my-channel",
    module: { name: "my-module", versionRange: ">=1.0.0", filePath: "./index.mjs" },
    functionQuery: { functionName: "fetchAliased", kind: "Async", isExportAlias: true },
};
```

This also works for class exports (e.g., `export { MyClass as PublicClass }`).

### API Reference

```ts
type ModuleType = "esm" | "cjs" | "unknown";
type FunctionKind = "Sync" | "Async";
```

#### **`FunctionQuery` Variants**

```ts
type FunctionQuery =
    | // Match class constructor
    { className: string; index?: number | null; isExportAlias?: boolean }
    | // Match class method
    {
        className: string;
        methodName: string;
        kind: FunctionKind;
        index?: number | null;
        isExportAlias?: boolean;
    }
    | // Match method on objects
    { methodName: string; kind: FunctionKind; index?: number | null }
    | // Match standalone function
    { functionName: string; kind: FunctionKind; index?: number | null; isExportAlias?: boolean }
    | // Match arrow function or function expression
    { expressionName: string; kind: FunctionKind; index?: number | null; isExportAlias?: boolean };
    | // Match private class methods
    { className: string; privateMethodName: string; kind: FunctionKind; index?: number | null };
```

#### **`ModuleMatcher`**

```ts
type ModuleMatcher = {
    name: string; // Module name
    versionRange: string; // Matching semver range
    filePath: string; // Relative Unix-style path to the file from the module root (e.g. "lib/index.js")
};
```

#### **`InstrumentationConfig`**

```ts
type InstrumentationConfig = {
    channelName: string; // Name of the diagnostics channel
    module: ModuleMatcher;
    functionQuery: FunctionQuery;
};
```

### Functions

```ts
create(configs: InstrumentationConfig[], dcModule?: string | null): InstrumentationMatcher;
```

Create a matcher for one or more instrumentation configurations.

- `configs` - Array of instrumentation configurations.
- `dcModule` - Optional module to import `diagnostics_channel` API from.

#### **`InstrumentationMatcher`**

```ts
getTransformer(moduleName: string, version: string, filePath: string): Transformer | undefined;
```

Gets a transformer for a specific module and file.

Returns a `Transformer` for the given module, or `undefined` if there were no
matching instrumentation configurations.

- `moduleName` - Name of the module.
- `version` - Version of the module.
- `filePath` - Relative Unix-style path to the file from the module root (e.g. `"lib/index.js"`). Windows-style backslash paths are also accepted and will be normalized automatically.

#### **`Transformer`**

```ts
transform(code: string | Buffer, moduleType: ModuleType, sourcemap?: string | undefined): TransformOutput;
```

Transforms the code, injecting tracing as configured.

Returns `{ code, map }`. `map` will be undefined if no sourcemap was supplied.

- `code` - The JavaScript code to transform.
- `moduleType` - The type of module being transformed.
- `sourcemap` - Optional existing source map for the code.

## License

See LICENSE
