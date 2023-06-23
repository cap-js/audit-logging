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
    let { event, data } = typeof first === 'object' ? first : { event: first, data: second }
    if (data.event && data.data) ({ event, data } = data)
    data = _augment(data)

    // immediate or deferred?
    if (!this.options.outbox) return this.send(event, data)
    try {
      // this will open a new (detached!) tx -> preserve user
      await this.tx(() => super.send(new cds.Request({ event, data })))
    } catch (e) {
      if (e.code === 'ERR_ASSERTION') e.unrecoverable = true
      throw e
    }
  }

  async send(event, data) {
    if (data.event && data.data) ({ event, data } = data)

    return super.send(event, _augment(data))
  }

  /*
   * new api (await audit.log/logSync(event, data))
   */

  log(event, data = {}) {
    return this.emit('log', { event, data })
  }

  logSync(event, data = {}) {
    return this.send('logSync', { event, data })
  }

  /*
   * compat api (await audit.<event>(data))
   */

  dataAccessLog(data = {}) {
    return this.emit('dataAccessLog', data)
  }

  dataModificationLog(data = {}) {
    return this.emit('dataModificationLog', data)
  }

  configChangeLog(data = {}) {
    return this.emit('configChangeLog', data)
  }

  securityLog(data = {}) {
    return this.emit('securityLog', data)
  }
}