const cds = require('@sap/cds')

// REVISIT: cds.OutboxService or technique to avoid extending OutboxService
const OutboxService = require('@sap/cds/libx/_runtime/messaging/Outbox')

const ANONYMOUS = 'anonymous'

const _augment = data => {
  data.id = data.id || cds.utils.uuid()
  data.tenant = data.tenant || cds.context.tenant || ANONYMOUS
  data.user = data.user || cds.context.user?.id || ANONYMOUS
  data.timestamp = data.timestamp || cds.context.timestamp
  return data
}

module.exports = class AuditLogService extends OutboxService {
  async emit(first, second) {
    const { event, data } = typeof first === 'object' ? first : { event: first, data: second }
    if (!this.options.outbox) return this.send(event, data)

    if (this[event]) {
      try {
        // this will open a new (detached!) tx -> preserve user
        await this.tx(() => super.send(new cds.Request({ method: event, data })))
      } catch (e) {
        if (e.code === 'ERR_ASSERTION') {
          e.unrecoverable = true
        }
        throw e
      }
    }
  }

  async send(event, data) {
    if (this[event]) return super.send(event, data)
  }

  /*
   * api (await audit.log/logSync(event, data))
   */

  log(event, data = {}) {
    return super.emit('log', { event, data: _augment(data) })
  }

  logSync(event, data = {}) {
    return super.send('logSync', { event, data: _augment(data) })
  }
}
