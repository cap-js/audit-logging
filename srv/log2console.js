const AuditLogService = require('./service')

// the default depth of 2 is not enough to see the full logs
require('util').inspect.defaultOptions.depth = 3

module.exports = class AuditLog2Console extends AuditLogService {
  async init() {
    this.on('*', function (req) {
      const { event, data } = req

      console.log(`[audit-log] - ${event}:`, data)
    })

    // call AuditLogService's init
    await super.init()
  }
}
