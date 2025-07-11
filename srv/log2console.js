const { data } = require('@sap/cds/lib/dbs/cds-deploy')
const AuditLogService = require('./service')

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
