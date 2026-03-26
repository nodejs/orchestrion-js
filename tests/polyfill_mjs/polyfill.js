/**
 * Unless explicitly stated otherwise all files in this repository are licensed under the Apache-2.0 License.
 * This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2025 Datadog, Inc.
 **/
const dc = require('node:diagnostics_channel')
const api = {}
api.tracingChannel = dc.tracingChannel
api.tracingChannel.polyfilled = true
module.exports = api
