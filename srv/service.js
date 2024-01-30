const cds = require('@sap/cds')

const Base = cds.outboxed ? cds.Service : require('@sap/cds/libx/_runtime/messaging/Outbox')

module.exports = class AuditLogService extends Base {
  async init() {
    // add common audit log entry fields
    this.before('*', req => {
      const { tenant, user, timestamp } = cds.context
      req.data.uuid ??= cds.utils.uuid()
      req.data.tenant ??= tenant
      req.data.user ??= user.id
      req.data.time ??= timestamp
    })

    // call OutboxService's init
    await super.init()

    // add self-explanatory api (await audit.log/logSync(event, data))
    this.log = this.emit
    // NOTE: logSync is not a public API!
    this.logSync = (...args) => {
      if (cds.unboxed) return cds.unboxed(this).send(...args) //> cds >= 7.5
      if (this.immediate instanceof cds.Service) return this.immediate.send(...args) //> cds ~ 7.4
      return this.send(...args) //> cds <= 7.3
    }
  }
}
