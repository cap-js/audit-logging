const cds = require('@sap/cds')

const { POST: _POST, /* PATCH: _PATCH, GET: _GET, DELETE: _DELETE, */ data } = cds.test().in(__dirname)

// the persistent outbox adds a delay
const wait = require('util').promisify(setTimeout)
const DELAY = process.env.CI ? 42 : 7
const POST = (...args) => _POST(...args).then(async res => (await wait(DELAY), res))
// const PATCH = (...args) => _PATCH(...args).then(async res => (await wait(DELAY), res))
// const GET = (...args) => _GET(...args).then(async res => (await wait(DELAY), res))
// const DELETE = (...args) => _DELETE(...args).then(async res => (await wait(DELAY), res))

// TODO: @cap-js/sqlite doesn't support structured properties
// // needed for testing structured properties
// cds.env.odata.flavor = 'x4'

const _logger = require('../utils/logger')({ debug: true })
cds.log.Logger = _logger

describe('personal data audit logging in CRUD with complex model', () => {
  if (cds.version.split('.')[0] < 8) return test.skip('only for cds >= 8', () => {})

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
    await data.reset()
    _logs = []
    _logger._resetLogs()
  })

  describe('data deletion logging', () => {
    test('Delete PII record in action', async () => {
      const { status: statusLeave } = await POST(
        '/collaborations/Collaborations(ID=36ca041a-a337-4d08-8099-c2a0980823a0,IsActiveEntity=true)/CollaborationsService.leave',
        {},
        { auth: ALICE }
      )
      expect(statusLeave).toEqual(204)
    })
  })
})
