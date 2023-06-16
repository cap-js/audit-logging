const AuditLogService = require('./audit-log')

module.exports = class AuditLog2AuditLogService extends AuditLogService {
  async init() {
    // call AuditLogService's init
    await super.init()

    // TODO
  }
}