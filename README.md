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

### Mutating the Return Value

A subscriber can both observe or mutate a function's return value
via `message.result`. Reassigning `message.result` is useful when
a function returns another function (or object) that you need to
wrap, like a factory that returns a per-request handler.

For **synchronous** functions, reassign `message.result` in the
`end` handler:

```js
const instrumentation = {
    channelName: "create-handler",
    module: { name: "my-framework", versionRange: ">=1.0.0", filePath: "lib/router.js" },
    functionQuery: { methodName: "create", kind: "Sync" },
};
```

```js
const { tracingChannel } = require("node:diagnostics_channel");

tracingChannel("orchestrion:my-framework:create-handler").subscribe({
    end(message) {
        const original = message.result;
        // Replace the returned handler with a wrapped version.
        message.result = function wrapped(...args) {
            // ...start a span, etc.
            return original.apply(this, args);
        };
    },
});
```

For **asynchronous** functions, reassign `message.result` in the
`asyncEnd` handler to substitute the value the returned promise
resolves to — for example, to wrap a function the promise resolves
to:

```js
const instrumentation = {
    channelName: "load-handler",
    module: { name: "my-framework", versionRange: ">=1.0.0", filePath: "lib/router.js" },
    functionQuery: { methodName: "load", kind: "Async" },
};
```

```js
tracingChannel("orchestrion:my-framework:load-handler").subscribe({
    asyncEnd(message) {
        const original = message.result;
        message.result = function wrapped(...args) {
            // ...start a span, etc.
            return original.apply(this, args);
        };
    },
});
```

> [!INFO]
>
> Mutating the resolved value of an async function only works
> when it returns a native `Promise` (`value instanceof
> Promise`). Promise subclasses and other userland thenables are
> side-chained and returned to the caller unchanged so that their
> subclass-specific methods (e.g. `APIPromise.withResponse()`)
> remain accessible; their resolved value therefore **cannot** be
> mutated, and reassigning `message.result` for them has no
> effect.

On the throw path the original error still propagates; the
substituted return value only applies when the function returns (or
resolves) normally. If no subscriber reassigns `message.result`, the
original return value is preserved unchanged.

### AST Query

The name-based `FunctionQuery` variants cover the common cases
(named functions, class/object methods, expressions). When you
need to target a node they can't express, such as an **anonymous
function returned by a factory** (a decorator factory, a
per-request handler), you can set `astQuery` to a raw
[esquery](https://github.com/estools/esquery) selector instead.

When present, `astQuery` chooses the nodes to instrument and
takes precedence over `functionQuery`'s matching fields;
`functionQuery` then only supplies behaviour (`kind`, `index`,
`callbackIndex`) and may be omitted (it defaults to `kind:
"Sync"`).

For example, to instrument the decorator returned by a factory:

```js
function Injectable(options) {
    return (target) => { /* applied to the decorated class */ };
}
```

```js
const instrumentation = {
    channelName: "injectable-apply",
    module: { name: "@nestjs/common", versionRange: ">=8.0.0", filePath: "decorators/core/injectable.decorator.js" },
    // Match the arrow returned from `Injectable`. There is no name to target!
    astQuery: 'FunctionDeclaration[id.name="Injectable"] ReturnStatement > ArrowFunctionExpression',
    functionQuery: { kind: "Sync" },
};
```

The channel then fires each time the decorator is applied, with
the decorated target available as `message.arguments[0]`, which a
subscriber can mutate, for example to wrap prototype methods.

An `astQuery` is used verbatim, so it can match any node,
including ones the name-based variants don't expose, such as
anonymous or deeply nested functions. (Both name-based and
`astQuery` matching work on synchronous and async functions
alike.)

If an `astQuery` matches no nodes, the "failed to find injection
points" error includes the selector so it can be debugged.

### Custom Transforms

The built-in operators (`traceSync`, `tracePromise`,
`traceCallback`, `traceAuto`, selected by `functionQuery.kind`)
cover diagnostics-channel tracing. When you need to rewrite a
matched node differently, register a custom operator with
`matcher.addTransform(name, fn)` and reference it from a config's
`transform` field. When `transform` is set it takes precedence
over `functionQuery.kind`.

A custom transform receives the same arguments an esquery
traversal yields, plus the merged instrumentation state, and
mutates the matched node in place:

```ts
type CustomTransform = (state, node, parent, ancestry) => void;
```

- `state` - the config merged with runtime fields
  (`moduleVersion`, `moduleType`, `operator`, the resolved
  `functionQuery`, …).
- `node` - the matched AST node (the function/expression selected
  by `functionQuery` or `astQuery`).
- `parent`, `ancestry` - the parent node and full ancestor chain
  (root last); `ancestry[ancestry.length - 1]` is the `Program`.

A custom transform fully owns how `node` is rewritten. It is not
required to inject a tracing channel at all.

```js
const matcher = codeTransformer.create([
    {
        channelName: "fetch",
        module: { name: "my-module", versionRange: ">=1.0.0", filePath: "index.js" },
        functionQuery: { functionName: "fetch", kind: "Sync" },
        transform: "myCustomTransform",
    },
]);

matcher.addTransform("myCustomTransform", (state, node) => {
    // Mutate the matched node's AST however you need.
    node.body.body.unshift(/* an ESTree statement */);
});
```

(The CLI accepts the same transforms via the `customTransforms`
field of a configuration module. See: [CLI Tool](#cli-tool).)

### API Reference

```ts
type ModuleType = "esm" | "cjs" | "unknown";
type FunctionKind = "Sync" | "Async" | "Callback" | "Auto";
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
        callbackIndex?: number;
        isExportAlias?: boolean;
    }
    | // Match method on objects
    { methodName: string; kind: FunctionKind; index?: number | null; callbackIndex?: number }
    | // Match standalone function
    { functionName: string; kind: FunctionKind; index?: number | null; callbackIndex?: number; isExportAlias?: boolean }
    | // Match arrow function or function expression
    { expressionName: string; kind: FunctionKind; index?: number | null; callbackIndex?: number; isExportAlias?: boolean };
    | // Match private class methods
    { className: string; privateMethodName: string; kind: FunctionKind; index?: number | null; callbackIndex?: number };
```

#### **`ModuleMatcher`**

```ts
type ModuleMatcher = {
    /** Module name */
    name: string; 
    /** Matching semver range */
    versionRange: string;
    /** 
     * Relative Unix-style path to the file from the module root (e.g. "lib/index.js") 
     * Or a regular expression to test against the Unix-style path.
     */
    filePath: string | RegExp;
};
```

#### **`InstrumentationConfig`**

```ts
// Behaviour-only fields, used when `astQuery` does the matching.
type FunctionBehavior = {
    kind?: FunctionKind;
    index?: number | null;
    callbackIndex?: number;
};

type InstrumentationConfig =
    | {
        channelName: string; // Name of the diagnostics channel
        module: ModuleMatcher;
        functionQuery: FunctionQuery; // Name-based matching
        astQuery?: string; // Raw esquery selector; takes precedence over functionQuery matching
        transform?: string; // Name of a custom transform registered via addTransform
    }
    | {
        channelName: string;
        module: ModuleMatcher;
        astQuery: string; // Raw esquery selector chooses the node(s)
        functionQuery?: FunctionBehavior; // Behaviour only; matching fields ignored
        transform?: string;
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

```ts
addTransform(name: string, fn: CustomTransform): void;
```

Registers a custom transform operator under `name`, referenced
from a config's `transform` field. See [Custom
Transforms](#custom-transforms).

- `name` - Operator name (also used as the config's `transform`
  value).
- `fn` - `(state, node, parent, ancestry) => void`; mutates the
  matched node.

#### **`Transformer`**

```ts
transform(code: string | Buffer, moduleType: ModuleType, sourcemap?: string | undefined): TransformOutput;
```

Transforms the code, injecting tracing as configured.

Returns `{ code, map }`. `map` will be undefined if no sourcemap was supplied.

- `code` - The JavaScript code to transform.
- `moduleType` - The type of module being transformed.
- `sourcemap` - Optional existing source map for the code.

## CLI Tool

The package includes a CLI tool for applying transformations to source files:

```bash
npx @apm-js-collab/code-transformer transformer.js source-file.js
```

### CLI Usage

The CLI tool takes two arguments:
1. `transformer.js` - A file that exports instrumentation configuration(s)
2. `source-file.js` - The source file to transform (can be any path, including node_modules)

The transformed code is written to stdout, which you can redirect to a file or pipe to other commands.

### CLI Example

Create a transformer configuration file:

```javascript
// my-transformer.js
module.exports = [{
  channelName: 'my-fetch-channel',
  module: {
    name: 'my-module',
    versionRange: '>=1.0.0',
    filePath: 'index.js'
  },
  functionQuery: {
    functionName: 'fetch',
    kind: 'Async'
  }
}]
```

Apply the transformation:

```bash
npx @apm-js-collab/code-transformer my-transformer.js lib/index.js > instrumented.js
```

The transformer configuration file can also export an object with additional options:

```javascript
module.exports = {
  configs: [/* array of configs */],
  dcModule: './custom-diagnostics-channel.js', // optional custom dc module
  customTransforms: {  // optional custom transform functions
    myCustomTransform: (state, node) => {
      // custom AST transformation logic
    }
  }
}
```

## License

See LICENSE
