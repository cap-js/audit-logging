const cds = require('@sap/cds')

cds.env.requires['audit-log'] = {
  impl: 'MyAuditLogService.js'
}

// set cwd for resolving impl
cds.test(__dirname)

describe('Custom Implementation', () => {
  let __log, _logs
  const _log = (...args) => {
    if (!(args.length === 2 && typeof args[0] === 'string' && args[0].match(/\[my-audit-log\]/i))) {
      // > not an audit log (most likely, anyway)
      return __log(...args)
    }

    _logs.push(args[1])
  }

  beforeAll(() => {
    __log = global.console.log
    global.console.log = _log
  })

  afterAll(() => {
    global.console.log = __log
  })

  beforeEach(async () => {
    _logs = []
  })

  test('extending AuditLogService exported by plugin', async () => {
    const audit = await cds.connect.to('audit-log')
    await audit.log('foo', { data_subject: { ID: { bar: 'baz' } } })
    expect(_logs).toContainMatchObject({ data_subject: { ID: { bar: 'baz' } } })
  })
})
