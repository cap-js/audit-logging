const cds = require('@sap/cds')
const fs = require('fs')
const os = require('os')
const path = require('path')

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
const ALICE = { username: 'alice', password: 'password' }
const update_attributes = [{ name: 'foo', old: 'bar', new: 'baz' }]

const runTestSuite = () => {
  require('./tests')(POST)

  test('id flattening', async () => {
    expect(
      cds.services['audit-log'].flattenAndSortIdObject({ foo: 'bar', alpha: 'omega', ping: 'pong', fizz: 'buzz' })
    ).toBe('alpha:omega fizz:buzz foo:bar ping:pong')
  })

  test('writes log with multiple id attributes in object and data subject', async () => {
    const object = {
      type: 'foo.bar',
      id: { foo: 'bar', alpha: 'omega', ping: 'pong', fizz: 'buzz' }
    }
    const data_subject = { ...object, role: 'foo.bar' }
    const data = JSON.stringify({ object, data_subject, attributes: update_attributes })
    const res = await POST('/integration/passthrough', { event: 'PersonalDataModified', data }, { auth: ALICE })
    expect(res).toMatchObject({ status: 204 })
  })

  test('writes log without id attributes in object and data subject', async () => {
    const object = { type: 'foo.bar', id: {} }
    const data_subject = { ...object, role: 'foo.bar' }
    const data = JSON.stringify({ object, data_subject, attributes: update_attributes })
    const res = await POST('/integration/passthrough', { event: 'PersonalDataModified', data }, { auth: ALICE })
    expect(res).toMatchObject({ status: 204 })
  })

  test('rejects log with invalid data', async () => {
    await expect(
        POST('/integration/passthrough', { event: 'PersonalDataModified', data: '{}' }, { auth: ALICE })
    ).rejects.toThrow('Request failed with: 403 - Forbidden')
  })
}

const setupFile = async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcap-'));
  const filePath = path.join(dir, 'vcap.json');
  fs.writeFileSync(filePath, JSON.stringify(VCAP_SERVICES), 'utf8');
  process.env.VCAP_SERVICES_FILE_PATH = filePath;

  return () => {
    try {
      fs.unlinkSync(filePath)
      fs.rmdirSync(dir)
    } catch (err) {
        console.error('Error cleaning up temporary VCAP services file:', err);
    }
    delete process.env.VCAP_SERVICES_FILE_PATH;
  };
};

describe('Log to Audit Log Service NG with credentials from VCAP_SERVICES env var', () => {
  if (!VCAP_SERVICES['user-provided'][0].credentials)
    return test.skip('Skipping tests due to missing credentials', () => {})

  setupFile()

  runTestSuite()
})

describe('Log to Audit Log Service NG with credentials from VCAP_SERVICES_FILE_PATH', () => {
  if (!VCAP_SERVICES['user-provided'][0].credentials)
    return test.skip('Skipping tests due to missing credentials', () => {})


  runTestSuite()
})