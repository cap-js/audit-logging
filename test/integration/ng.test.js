const cds = require('@sap/cds')

const { POST } = cds.test().in(__dirname)

cds.env.requires['audit-log'].kind = 'audit-log-to-restv3'
cds.env.requires['audit-log'].impl = '@cap-js/audit-logging/srv/log2restv3'
// cds.env.requires['audit-log'].credentials = process.env.VCAP_SERVICES && JSON.stringify(vcap)
// for local test, use vcap.json to set VCAP_SERVICES
// const vcap = require('../../vcap.json')
// process.env.VCAP_SERVICES = JSON.stringify(vcap)
// console.log(cds.env.requires['audit-log'])

describe('Log to Audit Log Service NG ', () => {
  require('./tests')(POST)
})
