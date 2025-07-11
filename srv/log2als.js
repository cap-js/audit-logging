const cds = require('@sap/cds')

const AuditLog2RESTv2 = require('./log2restv2')
const AuditLog2RESTv3 = require('./log2restv3')

// for local development, use vcap.json to set VCAP_SERVICES
// const vcap = require('./vcap.json')
// process.env.VCAP_SERVICES = JSON.stringify(vcap)

const credentials = process.env.VCAP_SERVICES || {}
const isV3 = JSON.parse(credentials)["user-provided"].some(obj => obj.tags.includes('auditlog-ng')) || {}

if(isV3) {
    module.exports = AuditLog2RESTv3
} else {
    module.exports = AuditLog2RESTv2
}