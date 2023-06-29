const AuditLogService = require('./service')
const { inspect } = require('util')
const colors = process.stdout.isTTY

module.exports = class AuditLog2Console extends AuditLogService {
  async init() {
    this.on('*', function (req) {
      const { event, data } = req
      console.log('[audit-log] -', event, inspect(data,{colors,depth:3}))
    })
    await super.init()
  }
}
