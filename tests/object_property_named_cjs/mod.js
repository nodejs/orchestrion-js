'use strict'

// Named object pattern: async arrow function assigned to a property
// on a named identifier (not `this`).
const conn = {}
conn.query = async () => {
  return 42
}

module.exports = { conn }
