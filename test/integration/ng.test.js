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
    return test.skip('Skipping tests due to missing credentials', () => {
    })

  require('./tests')(POST)

  const ALICE = { username: 'alice', password: 'password' }
  const update_attributes = [{ name: 'foo', old: 'bar', new: 'baz' }]

  test('writes log with multiple id attributes in object and data subject', async () => {
    const object = {
      type: 'foo.bar',
      id: { alpha: 'omega', fizz: 'buzz', foo: 'bar', ping: 'pong' },
    }
    const data_subject = { ...object, role: 'foo.bar' }
    const data = JSON.stringify({ object, data_subject, attributes: update_attributes })

    const res = await POST('/integration/passthrough', { event: 'PersonalDataModified', data }, { auth: ALICE })
    expect(res).toMatchObject({ status: 204 })
  })

    test('writes log without id attributes in object and data subject', async () => {
      const object = { type: 'foo.bar', id: {} }
      const data_subject = { ...object, role: 'foo.bar' }

      const payload = JSON.stringify({ object, data_subject, attributes: update_attributes })
      const res = await POST(
          '/integration/passthrough',
          { event: 'PersonalDataModified', data: payload },
          { auth: ALICE }
      )

      expect(res).toMatchObject({ status: 204 })
    })

    test('rejects log with invalid data', async () => {
      await expect(
          POST('/integration/passthrough', { event: 'PersonalDataModified', data: '{}' }, { auth: ALICE })
      ).rejects.toThrow('Request failed with: 403 - Forbidden')
    })
})
