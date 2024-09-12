const { AuditLogService } = require('../../') //> package root

class MyAuditLogService extends AuditLogService {
  async init() {
    this.on('*', function (req) {
      const { event, data } = req

      // eslint-disable-next-line no-console
      console.log(`[my-audit-log] - ${event}:`, data)
    })

    // call AuditLogService's init
    await super.init()
  }
}

module.exports = MyAuditLogService
