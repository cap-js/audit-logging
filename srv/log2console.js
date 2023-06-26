const AuditLogService = require('./service')

// the default depth of 2 is not enough to see the full logs
require('util').inspect.defaultOptions.depth = 3

module.exports = class AuditLog2Console extends AuditLogService {
  async init() {
    // call AuditLogService's init
    await super.init()

    this.on('*', function (req) {
      // REVISIT: rest adapter currently dispatches requests (instead of invoking the respective operation)
      const { event, data } = req.data.event ? req.data : req

      console.log(`[audit-log] - ${event}:`, data)
    })
  }
}
