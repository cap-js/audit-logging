const cds = require('@sap/cds')

const LOG = cds.log('audit-log')

const AuditLogService = require('./service')

module.exports = class AuditLog2RESTv3 extends AuditLogService {
  async init() {
    this.on('*', function (req) {
      const { event, data } = req

      // TODO (optional): transform v2 to v3

      // TODO: send logs to als v3
    })

    // call AuditLogService's init
    await super.init()
  }
}
