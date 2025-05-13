const AuditLogService = require('./service')

module.exports = class AuditLog2Console extends AuditLogService {
  async init() {
    this.on('*', function (req) {
      if (AuditLogService._is_callback.test(req.event)) return

      const { event, data } = req

      // eslint-disable-next-line no-console
      console.log(`[audit-log] - ${event}:`, data)
    })

    // call AuditLogService's init
    await super.init()
  }
}
