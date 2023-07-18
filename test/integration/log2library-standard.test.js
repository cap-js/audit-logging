const cds = require('@sap/cds')

// FIXME: why is this needed?
cds.env.requires['audit-log'] = {
  kind: 'audit-log-to-library',
  impl: '../../srv/log2library',
  credentials: process.env.ALS_CREDS_STANDARD
    ? JSON.parse(process.env.ALS_CREDS_STANDARD)
    : require('./.creds.json').eu10.standard
}

describe('Log to Audit Log Service via library with standard plan', () => {
  require('./test')
})
