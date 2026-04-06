/**
 * Unless explicitly stated otherwise all files in this repository are licensed under the Apache-2.0 License.
 * This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2025 Datadog, Inc.
 **/
'use strict'

// Mimics the mariadb v2 pattern: query methods are arrow functions
// assigned to `this` inside a function constructor.
function Connection (opts) {
  this._query = async () => {
    return 42
  }
}

module.exports = { Connection }
