'use strict'

module.exports = [
  {
    ignores: [
      'tests/**/*instrumented.js',
      'tests/**/*instrumented.mjs'
    ]
  },

  ...require('neostandard')({}),

  {
    files: ['tests/**/*'],
    rules: {
      camelcase: 'off'
    }
  }
]
