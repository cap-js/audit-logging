const cds = require('@sap/cds')

cds.env.requires['audit-log'] = {
  kind: 'audit-log-to-library',
  impl: '../../srv/log2library',
  credentials: process.env.ALS_CREDS_STANDARD && JSON.parse(process.env.ALS_CREDS_STANDARD)
}

describe('Log to Audit Log Service via library with standard plan', () => {
  if (!cds.env.requires['audit-log'].credentials)
    return test.skip('Skipping tests due to missing credentials', () => {})

  require('./tests')
})
