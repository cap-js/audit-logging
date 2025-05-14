const cds = require('@sap/cds')

const AuditLog2RESTv2 = require('./log2restv2')
const AuditLog2RESTv3 = require('./log2restv3')

const { credentials } = cds.env.requires['audit-log']

if (!credentials) {
  // TODO: throw Error
} else if (credentials.url === 'https://api.auditlog.cf.sap.hana.ondemand.com:8081') {
  module.exports = AuditLog2RESTv2
} else {
  module.exports = AuditLog2RESTv3
}
