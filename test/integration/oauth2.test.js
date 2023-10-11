const cds = require('@sap/cds')

const { POST } = cds.test().in(__dirname)
const log = cds.test.log()

cds.env.requires['audit-log'] = {
  kind: 'audit-log-to-restv2',
  impl: '../../srv/log2restv2',
  credentials: process.env.ALS_CREDS_OAUTH2 && JSON.parse(process.env.ALS_CREDS_OAUTH2)
}

cds.env.log.levels['audit-log'] = 'debug'

// stay in provider account (i.e., use "$PROVIDER" and avoid x-zid header when fetching oauth2 token)
cds.env.requires.auth.users.alice.tenant = cds.env.requires['audit-log'].credentials.uaa.tenantid

describe('Log to Audit Log Service with oauth2 plan', () => {
  if (!cds.env.requires['audit-log'].credentials)
    return test.skip('Skipping tests due to missing credentials', () => {})

  // required for tests to exit correctly (cf. token expiration timeouts)
  jest.useFakeTimers()

  require('./tests')(POST)

  test('no tenant is handled correctly', async () => {
    const data = JSON.stringify({ data: { foo: 'bar' } })
    const res = await POST('/integration/passthrough', { event: 'SecurityEvent', data })
    expect(res).toMatchObject({ status: 204 })
    expect(log.output.match(/\$PROVIDER/)).toBeTruthy()
  })
})
