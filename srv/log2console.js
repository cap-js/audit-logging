const AuditLogService = require('./service')

module.exports = class AuditLog2Console extends AuditLogService {
  async init() {
    // call AuditLogService's init
    await super.init()

    this.on('*', function(req) {
      const { event, data } = req.data.event && req.data.data ? req.data : req

      console.log(`[audit-log] - ${event}:\n${_format(data)}`)
    })
  }
}

/*
 * utils
 */

function _format(data) {
  return JSON.stringify(data, null, 2).split('\n').map(l => `  ${l}`).join('\n')
}
