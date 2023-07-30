const cds = require('@sap/cds')

cds.env.requires['audit-log'] = {
  kind: 'audit-log-to-restv2',
  impl: '../../srv/log2restv2',
  credentials: process.env.ALS_CREDS_STANDARD && JSON.parse(process.env.ALS_CREDS_STANDARD)
}

describe('Log to Audit Log Service via REST v2 with standard plan', () => {
  if (!cds.env.requires['audit-log'].credentials)
    return test.skip('Skipping tests due to missing credentials', () => {})

  require('./tests')
})
