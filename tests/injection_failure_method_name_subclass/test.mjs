import { existsSync } from 'node:fs'
import { assert } from '../common/preamble.js'

const instrumented = existsSync('./instrumented.mjs')
assert.strictEqual(instrumented, false, 'instrumented.mjs should not exist')
