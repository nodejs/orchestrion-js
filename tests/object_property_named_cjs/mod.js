/**
 * Unless explicitly stated otherwise all files in this repository are licensed under the Apache-2.0 License.
 * This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2025 Datadog, Inc.
 **/
'use strict'

// Named object pattern: async arrow function assigned to a property
// on a named identifier (not `this`).
const conn = {}
conn.query = async () => {
  return 42
}

module.exports = { conn }
