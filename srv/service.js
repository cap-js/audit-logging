const cds = require('@sap/cds')

class AuditLogService extends cds.Service {
  async init() {
    // add common audit log entry fields
    this.before('*', req => {
      const { tenant, user, timestamp } = cds.context
      req.data.uuid ??= cds.utils.uuid()
      // allows to specify undefined tenant in order to log to provider in multi-tenant scenarios
      if (!('tenant' in req.data)) req.data.tenant = tenant
      req.data.user ??= user.id
      req.data.time ??= timestamp
      // console.log(req.data)
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

AuditLogService.prototype._is_queueable = true

module.exports = AuditLogService
