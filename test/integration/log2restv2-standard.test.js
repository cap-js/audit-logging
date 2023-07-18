const cds = require('@sap/cds')

// FIXME: why is this needed?
cds.env.requires['audit-log'] = {
  kind: 'audit-log-to-restv2',
  impl: '../../srv/log2restv2',
  credentials: process.env.ALS_CREDS_STANDARD
    ? JSON.parse(process.env.ALS_CREDS_STANDARD)
    : require('./.creds.json').eu10.standard
}

describe('Log to Audit Log Service via REST v2 with standard plan', () => {
  require('./test')
})
