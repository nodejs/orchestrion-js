const { readFileSync, writeFileSync } = require('node:fs')

const wasm = readFileSync('./pkg/orchestrion_js_bg.wasm')
const wasmBase64 = wasm.toString('base64')

let js = readFileSync('./pkg/orchestrion_js.js', 'utf8')

js = js.replace(/const path[\S\s]+readFileSync\(path\)/, `const bytes = Buffer.from('${wasmBase64}', 'base64')`)

writeFileSync('./pkg/orchestrion_js.js', js)
