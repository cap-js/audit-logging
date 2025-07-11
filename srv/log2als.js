const cds = require('@sap/cds')

const AuditLog2RESTv2 = require('./log2restv2')
const AuditLog2RESTv3 = require('./log2restv3')

const credentials = JSON.parse(process.env.VCAP_SERVICES) || {}
const isV3 = credentials['user-provided'].some(obj => obj.tags.includes('auditlog-ng')) || {}

if (isV3) {
  module.exports = AuditLog2RESTv3
} else {
  module.exports = AuditLog2RESTv2
}
