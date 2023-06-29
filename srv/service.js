const cds = require('@sap/cds')
const OutboxService = require('@sap/cds/libx/_runtime/messaging/Outbox')
// REVISIT: cds.OutboxService or technique to avoid extending OutboxService
// REVISIT: OutboxService should not be base class but a decorator

module.exports = class AuditLogService extends OutboxService {

  async emit(event, data) {

    // REVISIT: That should not be neccessary, as the * handlers react on both .emit or .send / handled by the outbox, if at all.
    // immediate or deferred?
    if (!this.options.outbox) return this.send(event, data)

    if (typeof event === 'object') ({ event, data } = event) // We shouldn't neccessarily need that
    if (data.event && data.data) ({ event, data } = data) // REVISIT: Why is that?
    data = _augment(data)

    try {
      // this will open a new (detached!) tx -> preserve user
      // REVISIT: Why do we need a new root tx?
      // REVISIT: Why do we construct a new cds.Request? -> done in base class
      await this.tx(() => super.send(new cds.Request({ event, data })))
    } catch (e) {
      // REVISIT: Who throws ERR_ASSERTION
      if (e.code === 'ERR_ASSERTION') e.unrecoverable = true
      throw e
    }
  }

  async send(event, data) {
    if (typeof event === 'object') ({ event, data } = event) // We shouldn't neccessarily need that
    if (data.event && data.data) ({ event, data } = data) // REVISIT: Why is that?
    return super.send(event, _augment(data))
  }

  log(event, data) {
    return this.emit(event, data)
  }

  logSync(event, data) {
    return this.send(event, data)
  }

}


const _augment = data => {
  let ctx = cds.context
  if (!data.id) data.id = cds.utils.uuid()
  if (!data.tenant) data.tenant = ctx.tenant //|| ANONYMOUS
  if (!data.user) data.user = ctx.user?.id //|| ANONYMOUS
  if (!data.timestamp) data.timestamp = ctx.timestamp
  return data
}
