import { create } from '../lib/index.js'
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

describe('injection_failure_method_name', () => {
  test('does not write instrumented file when no injection points found', () => {
    runTest('injection_failure_method_name', [
      {
        channelName: 'injection_failure_method_name',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { className: 'Foo', methodName: 'nonExistentMethod', kind: 'Async' },
      },
    ], { mjs: true })
  })
})

describe('injection_failure_method_name_sub_class', () => {
  test('does not write instrumented file when no injection points found', () => {
    runTest('injection_failure_method_name_subclass', [
      {
        channelName: 'injection_failures_subclass_method_name',
        module: { name: TEST_MODULE_NAME, versionRange: '>=0.0.1', filePath: TEST_MODULE_PATH },
        functionQuery: { className: 'Base', methodName: 'nonExistentMethod', kind: 'Async' },
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
