const cds = require('@sap/cds')

const { POST, GET } = cds.test(__dirname)

const wait = require('util').promisify(setTimeout)

describe('AuditLogService API with kind audit-log-to-console', () => {
  let __log, _logs
  const _log = (...args) => {
    if (!(args.length === 2 && typeof args[0] === 'string' && args[0].match(/\[audit-log\]/i))) {
      // > not an audit log (most likely, anyway)
      return __log(...args)
    }

    _logs.push(args[1])
  }

  const ALICE = { username: 'alice', password: 'password' }

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

  describe('intercept audit logs', () => {
    let _intercept

    beforeAll(async () => {
      const als = cds.services['audit-log'] || (await cds.connect.to('audit-log'))

      const _log = als.log
      als.log = async function (event, data) {
        if (!_intercept) return _log.call(this, event, data)
      }
    })

    beforeEach(async () => {
      _intercept = undefined
    })

    test('intercept on', async () => {
      _intercept = true

      const response = await POST('/api/testLog', {}, { auth: ALICE })
      expect(response).toMatchObject({ status: 204 })
      expect(_logs.length).toBe(0)
    })

    test('intercept off', async () => {
      _intercept = false

      const response = await POST('/api/testLog', {}, { auth: ALICE })
      expect(response).toMatchObject({ status: 204 })
      expect(_logs.length).toBe(1)
      expect(_logs).toContainMatchObject({ user: 'alice', bar: 'baz' })
    })
  })
})
