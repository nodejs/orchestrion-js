import { create } from '../lib/index.js'
import builtinTransforms from '../lib/transforms.js'
import { describe, test } from 'node:test'
import assert from 'node:assert'
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SourceMapConsumer } from 'source-map'

const __dirname = dirname(fileURLToPath(import.meta.url))

const TEST_MODULE_NAME = 'undici'
const TEST_MODULE_VERSION = '0.0.1'
const TEST_MODULE_PATH = 'index.mjs'
const WINDOWS_MODULE_PATH = 'lib/index.mjs'
const WINDOWS_MODULE_REGEX = /lib\/index\.m?js/

function runTest (testName, configs, { mjs = false, filePath = TEST_MODULE_PATH, dcModule, customTransforms = {} } = {}) {
  const ext = mjs ? 'mjs' : 'js'
  const testDir = join(__dirname, testName)

  const instrumentedJs = join(testDir, 'instrumented.js')
  const instrumentedMjs = join(testDir, 'instrumented.mjs')
  if (existsSync(instrumentedJs)) rmSync(instrumentedJs)
  if (existsSync(instrumentedMjs)) rmSync(instrumentedMjs)

  const instrumentor = create(configs, dcModule)
  for (const [name, fn] of Object.entries(customTransforms)) {
    instrumentor.addTransform(name, fn)
  }
  const transformer = instrumentor.getTransformer(TEST_MODULE_NAME, TEST_MODULE_VERSION, filePath)

  const code = readFileSync(join(testDir, `mod.${ext}`), 'utf-8')
  const moduleType = mjs ? 'esm' : 'cjs'

  try {
    const transformed = transformer.transform(code, moduleType)
    writeFileSync(join(testDir, `instrumented.${ext}`), transformed.code)
  } catch {
    // Injection failure — do not write instrumented file
  }

  const result = spawnSync('node', [`test.${ext}`], { cwd: testDir, stdio: 'pipe' })
  if (result.status !== 0) {
    const output = (result.stdout?.toString() || '') + (result.stderr?.toString() || '')
    throw new Error(`node test.${ext} exited with ${result.status}:\n${output}`)
  }
  assert.equal(result.status, 0)
}

describe('arguments_mutation', () => {
  test('instruments multiple function declarations', () => {
    runTest('arguments_mutation', [
      {
        channelName: 'fetch_simple',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { functionName: 'fetch_simple', kind: 'Sync' },
      },
      {
        channelName: 'fetch.complex',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { functionName: 'fetch_complex', kind: 'Sync' },
      },
    ])
  })
})

describe('class_expression_cjs', () => {
  test('instruments async class method on class expression', () => {
    runTest('class_expression_cjs', [
      {
        channelName: 'Undici:fetch',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { className: 'Undici', methodName: 'fetch', kind: 'Async' },
      },
    ])
  })
})

describe('class_method_cjs', () => {
  test('instruments async class method', () => {
    runTest('class_method_cjs', [
      {
        channelName: 'Undici:fetch',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { className: 'Undici', methodName: 'fetch', kind: 'Async' },
      },
    ])
  })
})

describe('static_block_cjs', () => {
  test('instruments class method when class body has static init blocks', () => {
    runTest('static_block_cjs', [
      {
        channelName: 'Undici:fetch',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { className: 'Undici', methodName: 'fetch', kind: 'Async' },
      },
    ])
  })
})

describe('constructor_cjs', () => {
  test('instruments class constructor (cjs)', () => {
    runTest('constructor_cjs', [
      {
        channelName: 'Undici_constructor',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { className: 'Undici' },
      },
    ])
  })
})

describe('constructor_mjs', () => {
  test('instruments class constructor (mjs)', () => {
    runTest('constructor_mjs', [
      {
        channelName: 'Undici_constructor',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { className: 'Undici' },
      },
    ], { mjs: true })
  })
})

describe('decl_cjs', () => {
  test('instruments async function declaration (cjs)', () => {
    runTest('decl_cjs', [
      {
        channelName: 'fetch.decl',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { functionName: 'fetch', kind: 'Async' },
      },
    ])
  })
})

describe('decl_mjs', () => {
  test('instruments async function declaration (mjs)', () => {
    runTest('decl_mjs', [
      {
        channelName: 'fetch_decl',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { functionName: 'fetch', kind: 'Async' },
      },
    ], { mjs: true })
  })
})

describe('decl_mjs_mismatched_type', () => {
  test('instruments async function declaration in mjs with mismatched module type', () => {
    runTest('decl_mjs_mismatched_type', [
      {
        channelName: 'fetch_decl',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { functionName: 'fetch', kind: 'Async' },
      },
    ], { mjs: true })
  })
})

describe('expr_cjs', () => {
  test('instruments async function expression (cjs)', () => {
    runTest('expr_cjs', [
      {
        channelName: 'fetch_expr',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { expressionName: 'fetch', kind: 'Async' },
      },
    ])
  })
})

describe('expr_mjs', () => {
  test('instruments async function expression (mjs)', () => {
    runTest('expr_mjs', [
      {
        channelName: 'fetch_expr',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { expressionName: 'fetch', kind: 'Async' },
      },
    ], { mjs: true })
  })
})

describe('index_cjs', () => {
  test('instruments class method by index', () => {
    runTest('index_cjs', [
      {
        channelName: 'Undici_fetch',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { className: 'Undici', methodName: 'fetch', kind: 'Async', index: 2 },
      },
    ])
  })
})

describe('injection_failure', () => {
  test('does not write instrumented file when no injection points found', () => {
    runTest('injection_failure', [
      {
        channelName: 'some_expr',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { expressionName: 'some', kind: 'Async' },
      },
    ], { mjs: true })
  })
})

describe('multiple_class_method_cjs', () => {
  test('instruments multiple class methods', () => {
    runTest('multiple_class_method_cjs', [
      {
        channelName: 'Undici_fetch1',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { className: 'Undici', methodName: 'fetch1', kind: 'Async' },
      },
      {
        channelName: 'Undici_fetch2',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { className: 'Undici', methodName: 'fetch2', kind: 'Async' },
      },
    ])
  })
})

describe('multiple_load_cjs', () => {
  test('instruments class method across multiple loads', () => {
    runTest('multiple_load_cjs', [
      {
        channelName: 'Undici_fetch',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { className: 'Undici', methodName: 'fetch', kind: 'Async' },
      },
    ])
  })
})

describe('nested_functions', () => {
  test('instruments sync function declaration with nested functions', () => {
    runTest('nested_functions', [
      {
        channelName: 'nested_fn',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { functionName: 'addHook', kind: 'Sync' },
      },
    ])
  })
})

describe('object_method_cjs', () => {
  test('instruments async object method', () => {
    runTest('object_method_cjs', [
      {
        channelName: 'Undici_fetch',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { methodName: 'fetch', kind: 'Async' },
      },
    ])
  })
})

describe('private_method_cjs', () => {
  test('instruments async private class method', () => {
    runTest('private_method_cjs', [
      {
        channelName: 'TestClass:testMe',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { className: 'TestClass', privateMethodName: 'testMe', kind: 'Async' },
      },
    ])
  })
})

describe('callback_cjs', () => {
  test('instruments callback-style function', () => {
    runTest('callback_cjs', [
      {
        channelName: 'fetch.cb',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { functionName: 'fetch', kind: 'Callback' },
      },
    ])
  })
})

describe('callback_promise_sync_cjs', () => {
  test('instruments function covering callback, promise, and sync paths', () => {
    runTest('callback_promise_sync_cjs', [
      {
        channelName: 'fetch.auto',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { functionName: 'fetch', kind: 'Auto' },
      },
    ])
  })
})

describe('instance_method_subclass_cjs', () => {
  test('instruments inherited method via constructor patching on subclass', () => {
    runTest('instance_method_subclass_cjs', [
      {
        channelName: 'Base_fetch',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { className: 'Base', methodName: 'fetch', kind: 'Async' },
      },
    ])
  })
})

describe('windows_path', () => {
  test('instruments with windows-style file path', () => {
    runTest('windows_path', [
      {
        channelName: 'fetch_decl',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: WINDOWS_MODULE_PATH },
        functionQuery: { functionName: 'fetch', kind: 'Async' },
      },
    ], { filePath: 'lib\\index.mjs' })
  })
})

describe('windows_path_regex', () => {
  test('instruments with windows-style file path matching regex', () => {
    runTest('windows_path', [
      {
        channelName: 'fetch_decl',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: WINDOWS_MODULE_REGEX },
        functionQuery: { functionName: 'fetch', kind: 'Async' },
      },
    ], { filePath: 'lib\\index.mjs' })
  })
})

describe('export_alias_mjs', () => {
  test('instruments async function declaration via export alias (mjs)', () => {
    runTest('export_alias_mjs', [
      {
        channelName: 'fetch_alias',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { functionName: 'fetchAliased', kind: 'Async', isExportAlias: true },
      },
    ], { mjs: true })
  })
})

describe('export_alias_class_mjs', () => {
  test('instruments async class method via export alias (mjs)', () => {
    runTest('export_alias_class_mjs', [
      {
        channelName: 'Undici:fetch',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { className: 'Undici', methodName: 'fetch', kind: 'Async', isExportAlias: true },
      },
    ], { mjs: true })
  })
})

describe('const_class_export_alias_mjs', () => {
  test('instruments async class method via export alias on const class expression (mjs)', () => {
    runTest('const_class_export_alias_mjs', [
      {
        channelName: 'Undici:fetch',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { className: 'Undici', methodName: 'fetch', kind: 'Async', isExportAlias: true },
      },
    ], { mjs: true })
  })
})

describe('let_class_export_alias_mjs', () => {
  test('instruments async class method via export alias on let class expression (mjs)', () => {
    runTest('let_class_export_alias_mjs', [
      {
        channelName: 'Undici:fetch',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { className: 'Undici', methodName: 'fetch', kind: 'Async', isExportAlias: true },
      },
    ], { mjs: true })
  })
})

describe('var_class_export_alias_mjs', () => {
  test('instruments async class method via export alias on var class expression (mjs)', () => {
    runTest('var_class_export_alias_mjs', [
      {
        channelName: 'Undici:fetch',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { className: 'Undici', methodName: 'fetch', kind: 'Async', isExportAlias: true },
      },
    ], { mjs: true })
  })
})

describe('var_named_class_export_alias_mjs', () => {
  test('instruments async class method via export alias on named var class expression (mjs)', () => {
    runTest('var_named_class_export_alias_mjs', [
      {
        channelName: 'Undici:fetch',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { className: 'Undici', methodName: 'fetch', kind: 'Async', isExportAlias: true },
      },
    ], { mjs: true })
  })
})

describe('ast_query_cjs', () => {
  test('instruments using a raw astQuery selector (cjs)', () => {
    runTest('ast_query_cjs', [
      {
        channelName: 'fetch_ast_query',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        astQuery: 'FunctionDeclaration[id.name="fetch"][async]',
        functionQuery: { kind: 'Async' },
      },
    ])
  })
})

describe('mutable_result_cjs', () => {
  test('lets a subscriber substitute the synchronous return value via message.result', () => {
    runTest('mutable_result_cjs', [
      {
        channelName: 'create_mutable',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { functionName: 'create', kind: 'Sync' },
      },
      {
        channelName: 'compute_mutable',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { functionName: 'compute', kind: 'Sync' },
      },
      {
        channelName: 'boom_mutable',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { functionName: 'boom', kind: 'Sync' },
      },
    ])
  })
})

describe('mutable_result_async_cjs', () => {
  test('lets a subscriber substitute a native Promise result, but not a thenable result', () => {
    runTest('mutable_result_async_cjs', [
      {
        channelName: 'load_mutable',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { functionName: 'load', kind: 'Async' },
      },
      {
        channelName: 'load_thenable_mutable',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { functionName: 'loadThenable', kind: 'Async' },
      },
    ])
  })
})

describe('ast_query_returned_arrow_cjs', () => {
  test('instruments an anonymous arrow returned by a factory via astQuery', () => {
    runTest('ast_query_returned_arrow_cjs', [
      {
        channelName: 'decorator_apply',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        astQuery: 'FunctionDeclaration[id.name="Decorator"] ReturnStatement > ArrowFunctionExpression',
        functionQuery: { kind: 'Sync' },
      },
    ])
  })

  test('reports the astQuery selector when no injection points are found', () => {
    const instrumentor = create([
      {
        channelName: 'no_match',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        astQuery: 'FunctionDeclaration[id.name="doesNotExist"]',
        functionQuery: { kind: 'Sync' },
      },
    ])
    const transformer = instrumentor.getTransformer(TEST_MODULE_NAME, TEST_MODULE_VERSION, TEST_MODULE_PATH)
    assert.throws(
      () => transformer.transform('function fetch () { return 42 }', 'cjs'),
      /doesNotExist/
    )
  })
})

describe('sync_name_match_cjs', () => {
  test('name-based queries match synchronous functions (the [async] token is structural)', () => {
    runTest('sync_name_match_cjs', [
      {
        channelName: 'fetch_expr_sync',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { expressionName: 'fetchExpr', kind: 'Sync' },
      },
      {
        channelName: 'client_query_sync',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { methodName: 'query', kind: 'Sync' },
      },
    ])
  })
})

describe('polyfill_cjs', () => {
  test('instruments with a custom dc module (cjs)', () => {
    runTest('polyfill_cjs', [
      {
        channelName: 'fetch_decl',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { functionName: 'fetch', kind: 'Async' },
      },
    ], { dcModule: './polyfill.js' })
  })
})

describe('polyfill_mjs', () => {
  test('instruments with a custom dc module (mjs)', () => {
    runTest('polyfill_mjs', [
      {
        channelName: 'fetch_decl',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { functionName: 'fetch', kind: 'Async' },
      },
    ], { mjs: true, dcModule: './polyfill.js' })
  })
})

describe('custom_transform_cjs', () => {
  test('applies a custom transform registered via addTransform', () => {
    runTest('custom_transform_cjs', [
      {
        channelName: 'fetch_custom',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { functionName: 'fetch', kind: 'Sync' },
        transform: 'myCustomTransform',
      },
    ], {
      customTransforms: {
        myCustomTransform (_state, node) {
          node.body.body.unshift({
            type: 'ExpressionStatement',
            expression: {
              type: 'AssignmentExpression',
              operator: '=',
              left: {
                type: 'MemberExpression',
                object: { type: 'Identifier', name: 'global' },
                property: { type: 'Identifier', name: '__customCalled' },
                computed: false,
                optional: false,
              },
              right: { type: 'Literal', value: true, raw: 'true' },
            },
          })
        },
      },
    })
  })
})

describe('custom_transform_override_cjs', () => {
  test('overrides a built-in transform invoked internally by another transform', () => {
    runTest('custom_transform_override_cjs', [
      {
        channelName: 'fetch_override',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { functionName: 'fetch', kind: 'Sync' },
      },
    ], {
      customTransforms: {
        // Not referenced by any config's `transform` field: it is only reached
        // through the built-in traceSync -> tracingChannelDeclaration chain.
        tracingChannelImport (state, node) {
          builtinTransforms.tracingChannelImport(state, node)
          node.body.unshift({
            type: 'ExpressionStatement',
            expression: {
              type: 'AssignmentExpression',
              operator: '=',
              left: {
                type: 'MemberExpression',
                object: { type: 'Identifier', name: 'global' },
                property: { type: 'Identifier', name: '__importOverridden' },
                computed: false,
                optional: false,
              },
              right: { type: 'Literal', value: true, raw: 'true' },
            },
          })
        },
      },
    })
  })
})

describe('custom_transform_defaults_cjs', () => {
  test('custom transforms can call built-in transforms via state.transforms.defaults', () => {
    runTest('custom_transform_defaults_cjs', [
      {
        channelName: 'fetch_defaults',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { functionName: 'fetch', kind: 'Sync' },
      },
    ], {
      customTransforms: {
        tracingChannelImport (state, node) {
          state.transforms.defaults.tracingChannelImport(state, node)
          node.body.unshift({
            type: 'ExpressionStatement',
            expression: {
              type: 'AssignmentExpression',
              operator: '=',
              left: {
                type: 'MemberExpression',
                object: { type: 'Identifier', name: 'global' },
                property: { type: 'Identifier', name: '__defaultTransformCalled' },
                computed: false,
                optional: false,
              },
              right: { type: 'Literal', value: true, raw: 'true' },
            },
          })
        },
      },
    })
  })
})

describe('buffer_input', () => {
  test('accepts a Buffer and produces the same output as a string', () => {
    const code = [
      'async function fetch (url) {',
      '  return 42;',
      '}',
      'module.exports = { fetch };',
    ].join('\n')

    const configs = [
      {
        channelName: 'fetch',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { functionName: 'fetch', kind: 'Async' },
      },
    ]

    const instrumentor = create(configs)
    const transformer = instrumentor.getTransformer(TEST_MODULE_NAME, TEST_MODULE_VERSION, TEST_MODULE_PATH)

    const fromString = transformer.transform(code, 'cjs')
    const fromBuffer = transformer.transform(Buffer.from(code), 'cjs')

    assert.equal(fromBuffer.code, fromString.code)
  })
})

describe('source_map', () => {
  test('maps generated positions back to original line/column', () => {
    const originalCode = [
      'async function fetch (url) {',
      '  return 42;',
      '}',
      'module.exports = { fetch };',
    ].join('\n')

    // `42` starts at column 9 in `  return 42;` (0-indexed)
    const originalReturnLine = 2
    const originalReturnColumn = 9

    const instrumentor = create([
      {
        channelName: 'fetch_sm',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { functionName: 'fetch', kind: 'Async' },
      },
    ])
    const transformer = instrumentor.getTransformer(TEST_MODULE_NAME, TEST_MODULE_VERSION, TEST_MODULE_PATH)
    const { code: generatedCode, map } = transformer.transform(originalCode, 'cjs')

    assert.ok(map)

    const consumer = new SourceMapConsumer(JSON.parse(map))
    const generatedLines = generatedCode.split('\n')

    // Find the generated line containing `return 42` and the column of `42`
    const generatedLine = generatedLines.findIndex(l => l.includes('return 42')) + 1
    assert.equal(generatedLine > 0, true)
    const generatedColumn = generatedLines[generatedLine - 1].indexOf('42')

    const original = consumer.originalPositionFor({ line: generatedLine, column: generatedColumn })

    assert.equal(original.line, originalReturnLine)
    assert.equal(original.column, originalReturnColumn)
  })

  test('produces a valid sourcemap when an inputSourceMap is provided', () => {
    const code = 'export class Undici { async fetch (url) { return 42; } }'
    const inputSourceMap = { version: 3, sources: ['input.js'], mappings: 'AAAA', names: [] }

    const instrumentor = create([
      {
        channelName: 'Undici:fetch',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { className: 'Undici', methodName: 'fetch', kind: 'Async' },
      },
    ])
    const transformer = instrumentor.getTransformer(TEST_MODULE_NAME, TEST_MODULE_VERSION, TEST_MODULE_PATH)
    const { map } = transformer.transform(code, 'esm', inputSourceMap)

    assert.equal(JSON.parse(map).file, `${TEST_MODULE_NAME}/${TEST_MODULE_PATH}`)
  })
})

describe('wrap_promise_non_promise', () => {
  test('instruments sync function with wrapPromise and properly returns the result via context', () => {
    runTest('wrap_promise_non_promise', [
      {
        channelName: 'fetch_nonpromise',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { functionName: 'fetch', kind: 'Async' }
      }
    ])
  })
})

describe('promise_subclass', () => {
  test('instruments async function and preserves original Promise subclass return type', () => {
    runTest('promise_subclass', [
      {
        channelName: 'fetch_subclass',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { functionName: 'fetch', kind: 'Async' }
      }
    ])
  })
})

describe('IIFE with class', () => {
  test('instruments a class within a IIFE, variable same name as class', () => {
    runTest('iife_nested_class', [
      {
        channelName: 'register',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { className: 'Server', methodName: 'register', kind: 'Sync' }
      }
    ])
  })
})

describe('object_property_this_cjs', () => {
  test('instruments async arrow function assigned to this inside a function constructor', () => {
    runTest('object_property_this_cjs', [
      {
        channelName: 'Connection_query',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { objectName: 'this', propertyName: '_query', kind: 'Async' },
      },
    ])
  })
})

describe('object_property_this_generator_cjs', () => {
  test('instruments generator function assigned to this inside a function constructor', () => {
    runTest('object_property_this_generator_cjs', [
      {
        channelName: 'Connection_generate',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { objectName: 'this', propertyName: 'generate', kind: 'Sync' },
      },
    ])
  })
})

describe('object_property_named_cjs', () => {
  test('instruments async arrow function assigned to a named identifier property', () => {
    runTest('object_property_named_cjs', [
      {
        channelName: 'conn_query',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { objectName: 'conn', propertyName: 'query', kind: 'Async' },
      },
    ])
  })
})

describe('arrow_expr_args_cjs', () => {
  test('correctly forwards call-site arguments when wrapping an arrow function via expressionName', () => {
    runTest('arrow_expr_args_cjs', [
      {
        channelName: 'fetch_arrow_args',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { expressionName: 'fetch', kind: 'Async' },
      },
    ])
  })
})

describe('arrow_this_property_args_cjs', () => {
  test('correctly forwards call-site arguments when wrapping a this-assigned arrow function', () => {
    runTest('arrow_this_property_args_cjs', [
      {
        channelName: 'Connection_query_args',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { objectName: 'this', propertyName: '_query', kind: 'Async' },
      },
    ])
  })
})

describe('arrow_this_binding_cjs', () => {
  test('preserves lexical this and call-site arguments in wrapped arrow function', () => {
    runTest('arrow_this_binding_cjs', [
      {
        channelName: 'Connection_query_this',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { objectName: 'this', propertyName: '_query', kind: 'Async' },
      },
    ])
  })
})

describe('arrow_arguments_cjs', () => {
  test('arrow keeps outer arguments binding while regular function sees call-site arguments', () => {
    runTest('arrow_arguments_cjs', [
      {
        channelName: 'Connection_fetchArrow',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { objectName: 'this', propertyName: 'fetchArrow', kind: 'Async' },
      },
      {
        channelName: 'Connection_fetchFunction',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { objectName: 'this', propertyName: 'fetchFunction', kind: 'Async' },
      }
    ])
  })
})

describe('iterator_cjs', () => {
  test('instruments sync generator and patches next/throw/return on the returned iterator', () => {
    runTest('iterator_cjs', [
      {
        channelName: 'generate_iter',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { functionName: 'generate', kind: 'Sync', returnKind: 'Iterator' },
      },
      {
        channelName: 'generate_iter_async',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { functionName: 'generateFromPromise', kind: 'Async', returnKind: 'Iterator' },
      },
      {
        channelName: 'generate_iter_cb',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { functionName: 'generateCallback', kind: 'Callback', returnKind: 'Iterator' },
      },
      {
        channelName: 'generate_iter_auto',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { functionName: 'generateAuto', kind: 'Auto', returnKind: 'Iterator' },
      },
    ])
  })
})

describe('async_iterator_cjs', () => {
  test('instruments async generator and patches next/throw/return on the returned async iterator', () => {
    runTest('async_iterator_cjs', [
      {
        channelName: 'generate_async_iter',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { functionName: 'generate', kind: 'Sync', returnKind: 'AsyncIterator' },
      },
      {
        channelName: 'generate_async_iter_async',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { functionName: 'generateFromPromise', kind: 'Async', returnKind: 'AsyncIterator' },
      },
    ])
  })
})

describe('idempotency', () => {
  const M = { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH }

  const transform = (code, configs) =>
    create(configs)
      .getTransformer(TEST_MODULE_NAME, TEST_MODULE_VERSION, TEST_MODULE_PATH)
      .transform(code, 'cjs').code

  const cases = [
    ['class method (Async)', 'class Undici { async fetch (url) { return 42 } }\nmodule.exports = { Undici }\n',
      [{ channelName: 'Undici:fetch', module: M, functionQuery: { className: 'Undici', methodName: 'fetch', kind: 'Async' } }]],
    ['class method (Sync)', 'class Undici { fetch (url) { return 42 } }\nmodule.exports = { Undici }\n',
      [{ channelName: 'Undici:fetch', module: M, functionQuery: { className: 'Undici', methodName: 'fetch', kind: 'Sync' } }]],
    ['class method (Callback)', 'class Undici { fetch (url, cb) { cb(null, 42) } }\nmodule.exports = { Undici }\n',
      [{ channelName: 'Undici:fetch', module: M, functionQuery: { className: 'Undici', methodName: 'fetch', kind: 'Callback', callbackIndex: 1 } }]],
    ['function declaration (Async)', 'async function fetch (url) { return 42 }\nmodule.exports = { fetch }\n',
      [{ channelName: 'fetch', module: M, functionQuery: { functionName: 'fetch', kind: 'Async' } }]],
    ['function declaration (Sync)', 'function fetch (url) { return 42 }\nmodule.exports = { fetch }\n',
      [{ channelName: 'fetch', module: M, functionQuery: { functionName: 'fetch', kind: 'Sync' } }]],
    ['function declaration (Callback)', 'function fetch (url, cb) { cb(null, 42) }\nmodule.exports = { fetch }\n',
      [{ channelName: 'fetch', module: M, functionQuery: { functionName: 'fetch', kind: 'Callback', callbackIndex: 1 } }]],
    ['function expression (Async)', 'const fetch = async function fetch (url) { return 42 }\nmodule.exports = { fetch }\n',
      [{ channelName: 'fetch', module: M, functionQuery: { expressionName: 'fetch', kind: 'Async' } }]],
    ['instance method via constructor (Async)',
      'class Base {}\nBase.prototype.fetch = async function (url) { return 42 }\nclass Sub extends Base {}\nmodule.exports = { Sub }\n',
      [{ channelName: 'Base:fetch', module: M, functionQuery: { className: 'Base', methodName: 'fetch', kind: 'Async' } }]],
  ]

  const runStoresCount = (code) => code.split('.start.runStores(').length - 1

  for (const [label, code, configs] of cases) {
    test(`a second pass is a no-op: ${label}`, () => {
      const once = transform(code, configs)
      const twice = transform(once, configs)
      assert.equal(twice, once, 'second pass should not change already-instrumented output')
      assert.equal(runStoresCount(twice), runStoresCount(once))
    })
  }

  test('a second config with a different channel wraps independently without double-publishing to either channel', () => {
    const code = 'class Undici { async fetch (url) { return 42 } }\nmodule.exports = { Undici }\n'
    const once = transform(code, [{ channelName: 'chanA', module: M, functionQuery: { className: 'Undici', methodName: 'fetch', kind: 'Async' } }])
    const twice = transform(once, [{ channelName: 'chanB', module: M, functionQuery: { className: 'Undici', methodName: 'fetch', kind: 'Async' } }])

    // Both APMs coexist (both channels are wrapped) ...
    assert.equal(runStoresCount(twice), 2)
    // ... but neither channel is published to more than once, so no channel
    // double-fires (the actual duplicate-span bug is same-channel only).
    assert.equal(twice.split('tr_ch_apm$chanA.start.runStores(').length - 1, 1)
    assert.equal(twice.split('tr_ch_apm$chanB.start.runStores(').length - 1, 1)
  })

  test('does not re-wrap a channel that is nested under a different channel', () => {
    const code = 'class Undici { async fetch (url) { return 42 } }\nmodule.exports = { Undici }\n'
    const chan = (name) => [{ channelName: name, module: M, functionQuery: { className: 'Undici', methodName: 'fetch', kind: 'Async' } }]

    // chanA (innermost) -> chanB wraps over it -> chanA again: the second chanA
    // must be skipped even though chanA is no longer the outermost wrapper.
    const a = transform(code, chan('chanA'))
    const ab = transform(a, chan('chanB'))
    const aba = transform(ab, chan('chanA'))

    assert.equal(aba.split('tr_ch_apm$chanA.start.runStores(').length - 1, 1)
    assert.equal(aba.split('tr_ch_apm$chanB.start.runStores(').length - 1, 1)
    // Re-applying chanA to the already-chanA-wrapped output is a no-op.
    assert.equal(aba, ab)
  })

  test('runtime-patched instance method: same channel is idempotent, different channel coexists', () => {
    // Inherited/prototype method (not on the class body) is wrapped at runtime
    // inside the constructor.
    const code = 'class Base {}\nBase.prototype.fetch = async function (url) { return 42 }\nclass Sub extends Base {}\nmodule.exports = { Sub }\n'
    const chan = (name) => [{ channelName: name, module: M, functionQuery: { className: 'Base', methodName: 'fetch', kind: 'Async' } }]

    // Same channel twice is a no-op.
    const a = transform(code, chan('chanA'))
    assert.equal(transform(a, chan('chanA')), a)

    // A different channel adds its own patch (both APMs coexist) ...
    const ab = transform(a, chan('chanB'))
    assert.ok(ab.includes('tracingChannel("orchestrion:undici:chanA")'))
    assert.ok(ab.includes('tracingChannel("orchestrion:undici:chanB")'))
    // ... and each channel is still patched exactly once.
    assert.equal(ab.split('tr_ch_apm$chanA.start.runStores(').length - 1, 1)
    assert.equal(ab.split('tr_ch_apm$chanB.start.runStores(').length - 1, 1)
  })
})
