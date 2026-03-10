'use strict'

module.exports = [
  {
    ignores: [
      'tests/**/*' // TODO: Also lint tests
    ]
  },
  ...require('neostandard')({})
]
