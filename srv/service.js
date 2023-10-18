const cds = require('@sap/cds')

// REVISIT: cds.OutboxService or technique to avoid extending OutboxService
const OutboxService = require('@sap/cds/libx/_runtime/messaging/Outbox')

module.exports = class AuditLogService extends OutboxService {
  async init() {
    const outboxed = this.immediate instanceof cds.Service

    // add common audit log entry fields
    this.before('*', req => {
      const { tenant, user, timestamp: time } = cds.context
      Object.assign(req.data, { uuid: cds.utils.uuid(), tenant, user: user.id, time })
    })

    // call OutboxService's init
    await super.init()

    // add self-explanatory api (await audit.log/logSync(event, data))
    this.log = this.emit
    // NOTE: logSync is not a public API!
    this.logSync = (...args) => {
      if (outboxed) return this.immediate.send(...args)
      this.send(...args)
    }
  }
}
