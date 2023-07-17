const cds = require('@sap/cds')

// REVISIT: cds.OutboxService or technique to avoid extending OutboxService
const OutboxService = require('@sap/cds/libx/_runtime/messaging/Outbox')

module.exports = class AuditLogService extends OutboxService {
  async init() {
    this.before('*', function (req) {
      req.data = _augment(req.data)
    })

    // call OutboxService's init
    await super.init()
  }

  async emit(first, second) {
    let { event, data } = typeof first === 'object' ? first : { event: first, data: second }
    if (data.event && data.data) ({ event, data } = data)

    // immediate or deferred?
    if (!this.options.outbox) return this.send(event, data)
    // this will open a new (detached!) tx -> preserve user
    await this.tx(() => super.send(new cds.Request({ event, data })))
  }

  async send(event, data) {
    if (data.event && data.data) ({ event, data } = data)

    return super.send(event, data)
  }

  /*
   * new api (await audit.log/logSync(event, data))
   */

  log(event, data = {}) {
    return this.emit(event, data)
  }

  logSync(event, data = {}) {
    return this.send(event, data)
  }
}

const ANONYMOUS = 'anonymous'

const _augment = data => {
  data.uuid = cds.utils.uuid()
  data.tenant = cds.context.tenant || ANONYMOUS
  data.user = cds.context.user?.id || ANONYMOUS
  data.timestamp = cds.context.timestamp
  return data
}