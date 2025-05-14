const cds = require('@sap/cds')

const { axios, POST, GET } = cds.test().in(__dirname)

// do not throw for 4xx responses
axios.defaults.validateStatus = () => true

cds.env.requires['audit-log'] = {
  kind: 'audit-log-to-console',
  impl: '../../srv/log2console',
  outboxed: true
}

const wait = require('node:timers/promises').setTimeout

describe('AuditLogService API', () => {
  let __log, _logs
  const _log = (...args) => {
    if (!(args.length === 2 && typeof args[0] === 'string' && args[0].match(/\[audit-log\]/i))) {
      // > not an audit log (most likely, anyway)
      return __log(...args)
    }

    _logs.push(args[1])
  }

  const ALICE = { username: 'alice', password: 'password' }
  const BOB = { username: 'bob', password: 'password' }

  beforeAll(() => {
    __log = global.console.log
    global.console.log = _log
  })

  afterAll(() => {
    global.console.log = __log
  })

  beforeEach(async () => {
    await POST('/api/resetSequence', {}, { auth: ALICE })
    _logs = []
  })

  describe('default', () => {
    test('emit is deferred', async () => {
      const response = await POST('/api/testEmit', {}, { auth: ALICE })
      expect(response).toMatchObject({ status: 204 })
      await wait(42)
      const {
        data: { value: sequence }
      } = await GET('/api/getSequence()', { auth: ALICE })
      expect(sequence).toEqual(['request succeeded', 'audit log logged'])
      expect(_logs.length).toBe(1)
      expect(_logs).toContainMatchObject({ user: 'alice', bar: 'baz' })
    })

    test('send is immediate', async () => {
      const response = await POST('/api/testSend', {}, { auth: ALICE })
      expect(response).toMatchObject({ status: 204 })
      await wait(42)
      const {
        data: { value: sequence }
      } = await GET('/api/getSequence()', { auth: ALICE })
      expect(sequence).toEqual(['audit log logged', 'request succeeded'])
      expect(_logs.length).toBe(1)
      expect(_logs).toContainMatchObject({ user: 'alice', bar: 'baz' })
    })
  })

  describe('new', () => {
    test('log is deferred', async () => {
      const response = await POST('/api/testLog', {}, { auth: ALICE })
      expect(response).toMatchObject({ status: 204 })
      await wait(42)
      const {
        data: { value: sequence }
      } = await GET('/api/getSequence()', { auth: ALICE })
      expect(sequence).toEqual(['request succeeded', 'audit log logged'])
      expect(_logs.length).toBe(1)
      expect(_logs).toContainMatchObject({ user: 'alice', bar: 'baz' })
    })

    test('logSync is immediate', async () => {
      const response = await POST('/api/testLogSync', {}, { auth: ALICE })
      expect(response).toMatchObject({ status: 204 })
      await wait(42)
      const {
        data: { value: sequence }
      } = await GET('/api/getSequence()', { auth: ALICE })
      expect(sequence).toEqual(['audit log logged', 'request succeeded'])
      expect(_logs.length).toBe(1)
      expect(_logs).toContainMatchObject({ user: 'alice', bar: 'baz' })
    })
  })

  test('the default inspect depth of 2 is enough', async () => {
    const audit = await cds.connect.to('audit-log')
    await audit.log('foo', { data_subject: { ID: { bar: 'baz' } } })
    expect(_logs).toContainMatchObject({ data_subject: { ID: { bar: 'baz' } } })
  })

  describe('common log entry fields', () => {
    test('are automatically filled', async () => {
      await cds.tx({ tenant: 'bar' }, async () => {
        const audit = await cds.connect.to('audit-log')
        await audit.log('foo', {})
      })
      expect(_logs).toContainMatchObject({
        uuid: expect.any(String),
        tenant: 'bar',
        user: 'anonymous',
        time: expect.any(Date)
      })
    })

    test('can be provided manually', async () => {
      const time = new Date('2021-01-01T00:00:00.000Z')
      await cds.tx({ tenant: 'bar' }, async () => {
        const audit = await cds.connect.to('audit-log')
        await audit.log('foo', { uuid: 'baz', tenant: 'baz', user: 'baz', time })
      })
      expect(_logs).toContainMatchObject({
        uuid: 'baz',
        tenant: 'baz',
        user: 'baz',
        time
      })
    })

    test('tenant can be undefined', async () => {
      await cds.tx({ tenant: 'bar' }, async () => {
        const audit = await cds.connect.to('audit-log')
        await audit.log('foo', { uuid: 'baz', tenant: undefined, user: 'baz' })
      })
      expect(_logs).toContainMatchObject({
        uuid: 'baz',
        tenant: undefined,
        user: 'baz'
      })
    })
  })

  describe('custom log 403', () => {
    test('early reject', async () => {
      const response = await GET('/api/Books', { auth: BOB })
      expect(response).toMatchObject({ status: 403 })
      expect(_logs.length).toBe(1)
      expect(_logs).toContainMatchObject({ user: 'bob', ip: '::1' })
    })

    test('late reject', async () => {
      const response = await GET('/api/Books', { auth: ALICE })
      expect(response).toMatchObject({ status: 403 })
      expect(_logs.length).toBe(1)
      expect(_logs).toContainMatchObject({ user: 'alice', ip: '::1' })
    })

    test('early reject in batch', async () => {
      const response = await POST(
        '/api/$batch',
        { requests: [{ method: 'GET', url: '/Books', id: 'r1' }] },
        { auth: BOB }
      )
      expect(response).toMatchObject({ status: 403 })
      expect(_logs.length).toBeGreaterThan(0) //> coding in ./srv/server.js results in 2 logs on @sap/cds^7
      expect(_logs).toContainMatchObject({ user: 'bob', ip: '::1' })
    })

    test('late reject in batch', async () => {
      const response = await POST(
        '/api/$batch',
        { requests: [{ method: 'GET', url: '/Books', id: 'r1' }] },
        { auth: ALICE }
      )
      expect(response).toMatchObject({ status: 200 })
      expect(response.data.responses[0]).toMatchObject({ status: 403 })
      expect(_logs.length).toBe(1)
      expect(_logs).toContainMatchObject({ user: 'alice', ip: '::1' })
    })
  })
})
