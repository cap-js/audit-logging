const { loadVCAPServices } = require('../lib/utils')

const vcapServices = loadVCAPServices()
const isV3 = vcapServices['user-provided']?.some(obj => obj.tags.includes('auditlog-ng'))

module.exports = isV3 ? require('./log2alsng') : require('./log2restv2')
