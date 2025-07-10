module.exports = POST => {
  const object = { type: 'foo.bar', id: { ID: 'bar' } }
  const data_subject = Object.assign({ id: 'foo.id', role: 'foo.bar' }, object)
  const create_attributes = [{ name: 'foo', new: 'baz', old: ''}]
  const update_attributes = [{ name: 'foo', old: 'bar', new: 'baz' }]
  const delete_attributes = [{ name: 'foo', old: 'bar', new: ''}]

  const ALICE = { username: 'alice', password: 'password' }

  test('sensitive data read', async () => {
    const data = JSON.stringify({ object, data_subject, attributes: [{ name: 'foo' }] })
    const res = await POST('/integration/passthrough', { event: 'SensitiveDataRead', data }, { auth: ALICE })
    expect(res).toMatchObject({ status: 204 })
  })

  describe('personal data modified', () => {
    test('create', async () => {
      const data = JSON.stringify({ object, data_subject, attributes: create_attributes })
      const res = await POST('/integration/passthrough', { event: 'PersonalDataModified', data }, { auth: ALICE })
      expect(res).toMatchObject({ status: 204 })
    })

    test('update', async () => {
      const data = JSON.stringify({ object, data_subject, attributes: update_attributes })
      const res = await POST('/integration/passthrough', { event: 'PersonalDataModified', data }, { auth: ALICE })
      expect(res).toMatchObject({ status: 204 })
    })

    test('delete', async () => {
      const data = JSON.stringify({ object, data_subject, attributes: delete_attributes })
      const res = await POST('/integration/passthrough', { event: 'PersonalDataModified', data }, { auth: ALICE })
      expect(res).toMatchObject({ status: 204 })
    })
  })

  describe('configuration modified', () => {
    test('create', async () => {
      const data = JSON.stringify({ object, attributes: create_attributes })
      const res = await POST('/integration/passthrough', { event: 'ConfigurationModified', data }, { auth: ALICE })
      expect(res).toMatchObject({ status: 204 })
    })

    test('update', async () => {
      const data = JSON.stringify({ object, attributes: update_attributes })
      const res = await POST('/integration/passthrough', { event: 'ConfigurationModified', data }, { auth: ALICE })
      expect(res).toMatchObject({ status: 204 })
    })

    test('delete', async () => {
      const data = JSON.stringify({ object, attributes: delete_attributes })
      const res = await POST('/integration/passthrough', { event: 'ConfigurationModified', data }, { auth: ALICE })
      expect(res).toMatchObject({ status: 204 })
    })
  })

  test('security event', async () => {
    const data = JSON.stringify({ data: 'foo: bar' })
    const res = await POST('/integration/passthrough', { event: 'SecurityEvent', data }, { auth: ALICE })
    expect(res).toMatchObject({ status: 204 })
  })
}
