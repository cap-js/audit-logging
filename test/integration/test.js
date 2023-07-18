const cds = require('@sap/cds')

const { POST } = cds.test(__dirname)

const object = { type: 'foo.bar', id: { foo: 'bar' } }
const data_subject = Object.assign({ role: 'foo.bar' }, object)
const attributes = [{ name: 'foo', old: 'bar', new: 'baz' }]

const ALICE = { username: 'alice', password: 'password' }

test('sensitive data read', async () => {
  const data = JSON.stringify({ object, data_subject, attributes: [{ name: 'foo' }] })
  const res = await POST('/api/passthrough', { event: 'SensitiveDataRead', data }, { auth: ALICE })
  expect(res).toMatchObject({ status: 204 })
})

test('personal data modified', async () => {
  const data = JSON.stringify({ object, data_subject, attributes })
  const res = await POST('/api/passthrough', { event: 'PersonalDataModified', data }, { auth: ALICE })
  expect(res).toMatchObject({ status: 204 })
})

test('configuration modified', async () => {
  const data = JSON.stringify({ object, attributes })
  const res = await POST('/api/passthrough', { event: 'ConfigurationModified', data }, { auth: ALICE })
  expect(res).toMatchObject({ status: 204 })
})

test('security event', async () => {
  const data = JSON.stringify({ data: { foo: 'bar' } })
  const res = await POST('/api/passthrough', { event: 'SecurityEvent', data }, { auth: ALICE })
  expect(res).toMatchObject({ status: 204 })
})
