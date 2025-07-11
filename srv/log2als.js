const credentials = JSON.parse(process.env.VCAP_SERVICES) || {}
const isV3 = credentials['user-provided']?.some(obj => obj.tags.includes('auditlog-ng'))

module.exports = isV3 ? require('./log2alsng') : require('./log2restv2')
