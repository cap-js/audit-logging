const cds = require('@sap/cds')

// FIXME: why is this needed?
cds.env.requires['audit-log'] = {
  kind: 'audit-log-to-library',
  impl: '../../srv/log2library',
  credentials: process.env.ALS_CREDS_OAUTH2
    ? JSON.parse(process.env.ALS_CREDS_OAUTH2)
    : require('./.creds.json').eu10.oauth2
}

describe('Log to Audit Log Service via library with oauth2 plan', () => {
  require('./tests')
})
