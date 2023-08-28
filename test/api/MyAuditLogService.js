const { AuditLogService } = require('@cap-js/audit-logging')

class MyAuditLogService extends AuditLogService {
  async init() {
    this.on('*', function (req) {
      const { event, data } = req

      console.log(`[my-audit-log] - ${event}:`, data)
    })

    // call AuditLogService's init
    await super.init()
  }
}

module.exports = MyAuditLogService
