#!/usr/bin/env node
'use strict'

const { readFileSync } = require('fs')
const { resolve, basename } = require('path')
const { Transformer } = require('./lib/transformer.js')

function printUsage () {
  console.error(`Usage: npx @apm-js-collab/code-transformer <transformer.js> <source-file>

Arguments:
  transformer.js    Path to transformer configuration file
  source-file       Path to source file to transform (can be a node module path)

The transformer.js file should export one of:
  - An array of instrumentation configs
  - An object with { configs, dcModule?, customTransforms? }

Example transformer.js:
  module.exports = [{
    channelName: 'my-channel',
    module: { name: 'my-module', versionRange: '>=1.0.0', filePath: 'index.js' },
    functionQuery: { functionName: 'myFunction', kind: 'Async' }
  }]

The transformed code will be written to stdout.
`)
  process.exit(1)
}

function main () {
  const args = process.argv.slice(2)

  if (args.length !== 2) {
    printUsage()
  }

  const [transformerPath, sourceFilePath] = args

  // Resolve paths
  const absoluteTransformerPath = resolve(process.cwd(), transformerPath)
  const absoluteSourcePath = resolve(process.cwd(), sourceFilePath)

  // Load transformer configuration
  let transformerConfig
  try {
    transformerConfig = require(absoluteTransformerPath)
  } catch (error) {
    console.error(`Error loading transformer file: ${error.message}`)
    process.exit(1)
  }

  // Parse transformer config
  let configs
  let dcModule
  let customTransforms = {}

  if (Array.isArray(transformerConfig)) {
    configs = transformerConfig
  } else if (typeof transformerConfig === 'object' && transformerConfig.configs) {
    configs = transformerConfig.configs
    dcModule = transformerConfig.dcModule
    customTransforms = transformerConfig.customTransforms || {}
  } else {
    console.error('Transformer file must export an array of configs or an object with { configs, dcModule?, customTransforms? }')
    process.exit(1)
  }

  if (!Array.isArray(configs) || configs.length === 0) {
    console.error('Transformer must provide at least one config')
    process.exit(1)
  }

  // Read source file
  let sourceCode
  try {
    sourceCode = readFileSync(absoluteSourcePath, 'utf-8')
  } catch (error) {
    console.error(`Error reading source file: ${error.message}`)
    process.exit(1)
  }

  // Determine module type from file extension
  const moduleType = absoluteSourcePath.endsWith('.mjs') || absoluteSourcePath.endsWith('.mts')
    ? 'esm'
    : absoluteSourcePath.endsWith('.cjs') || absoluteSourcePath.endsWith('.cts')
      ? 'cjs'
      : 'unknown'

  // Extract module information from first config or use defaults
  const firstConfig = configs[0]
  const moduleName = firstConfig.module?.name || 'cli-module'
  const version = '1.0.0'
  const filePath = basename(absoluteSourcePath)

  // Create transformer and apply transformations
  try {
    // Create transformer directly with the configs
    const transformer = new Transformer(
      moduleName,
      version,
      filePath,
      configs,
      dcModule || 'diagnostics_channel',
      customTransforms
    )

    const result = transformer.transform(sourceCode, moduleType)

    // Output transformed code to stdout
    process.stdout.write(result.code)
  } catch (error) {
    console.error(`Error transforming code: ${error.message}`)
    process.exit(1)
  }
}

main()
