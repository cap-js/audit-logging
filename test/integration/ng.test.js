const cds = require('@sap/cds')

const { POST } = cds.test().in(__dirname)

cds.env.requires['audit-log'].kind = 'audit-log-to-alsng'
cds.env.requires['audit-log'].impl = '@cap-js/audit-logging/srv/log2alsng'
const VCAP_SERVICES = {
  'user-provided': [
    {
      tags: ['auditlog-ng'],
      credentials: process.env.ALS_CREDS_NG && JSON.parse(process.env.ALS_CREDS_NG)
    }
  ]
}
process.env.VCAP_SERVICES = JSON.stringify(VCAP_SERVICES)

describe('Log to Audit Log Service NG ', () => {
  if (!VCAP_SERVICES['user-provided'][0].credentials)
    return test.skip('Skipping tests due to missing credentials', () => {})

  require('./tests')(POST)
})
