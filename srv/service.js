const cds = require('@sap/cds')

// REVISIT: cds.OutboxService or technique to avoid extending OutboxService
const OutboxService = require('@sap/cds/libx/_runtime/messaging/Outbox')

module.exports = class AuditLogService extends OutboxService {
  async init() {
    // add common audit log entry fields
    this.before('*', req => req.data = _augment(req.data))

    // call OutboxService's init
    await super.init()

    // add self-explanatory api (await audit.log/logSync(event, data))
    this.log = this.emit
    this.logSync = this.send
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