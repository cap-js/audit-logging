const cds = require('@sap/cds')

const AuditLog2Console = require('./log2console')
const AuditLog2RESTv3 = require('./log2restv3')

// for local development, use vcap.json to set VCAP_SERVICES
// const vcap = require('./vcap.json')
// process.env.VCAP_SERVICES = JSON.stringify(vcap)

const credentials = process.env.VCAP_SERVICES || {}
const isV3 = JSON.parse(credentials)["VCAP_SERVICES"]["user-provided"].some(obj => obj.tags.includes('auditlog-ng')) || {}

if(isV3) {
    module.exports = AuditLog2RESTv3
} else {
    module.exports = AuditLog2Console
}