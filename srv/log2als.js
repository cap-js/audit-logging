const credentials = cds.env.requires['audit-log']
const isV3 = TODO

module.exports = isV3 ? require('./log2alsng') : require('./log2restv2')
