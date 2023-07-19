const cds = require('@sap/cds')

// FIXME: why is this needed?
cds.env.requires['audit-log'] = {
  kind: 'audit-log-to-restv2',
  impl: '../../srv/log2restv2',
  credentials: process.env.ALS_CREDS_OAUTH2 && JSON.parse(process.env.ALS_CREDS_OAUTH2)
}

describe('Log to Audit Log Service via REST v2 with oauth2 plan', () => {
  if (!cds.env.requires['audit-log'].credentials)
    return test.skip('Skipping tests due to missing credentials', () => {})

  // required for tests to exit correctly (cf. token expiration timeouts)
  jest.useFakeTimers()

  require('./tests')
})
