/**
 * Unless explicitly stated otherwise all files in this repository are licensed under the Apache-2.0 License.
 * This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2025 Datadog, Inc.
 **/
import { existsSync } from 'node:fs'
import { assert } from '../common/preamble.js'

const instrumented = existsSync('./instrumented.js')
assert.strictEqual(instrumented, false, 'instrumented.js should not exist')
