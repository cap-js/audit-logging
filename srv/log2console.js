const AuditLogService = require('./service')

module.exports = class AuditLog2Console extends AuditLogService {
  async init() {
    // call AuditLogService's init
    await super.init()

    this.on('*', function(req) {
      const { event, data } = req.data

      console.log(`[audit-log] - ${event}:\n${JSON.stringify(data, null, 2).split('\n').map(l => `  ${l}`).join('\n')}`)
    })
  }
}