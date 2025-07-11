const cds = require('@sap/cds')

const { POST } = cds.test().in(__dirname)

cds.env.requires['audit-log'].kind = 'audit-log-to-restv3'
cds.env.requires['audit-log'].impl = '@cap-js/audit-logging/srv/log2restv3'

describe('Log to Audit Log Service NG ', () => {
  require('./tests')(POST)
})
