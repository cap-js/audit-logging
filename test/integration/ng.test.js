const cds = require('@sap/cds')

const { POST } = cds.test().in(__dirname)

cds.env.requires['audit-log'].kind = 'audit-log-to-alsng'
cds.env.requires['audit-log'].impl = '@cap-js/audit-logging/srv/log2alsng'
const VCAP_SERVICES = {
  'user-provided': [
    {
      binding_guid: 'acb4bb4e-2987-4f9c-b5fe-1c68c9c4b882',
      binding_name: null,
      credentials: process.env.ALS_CREDS_NG && JSON.parse(process.env.ALS_CREDS_NG),
      instance_guid: '80b442e5-6f8e-4788-8f42-1f37f6743c23',
      instance_name: 'auditlog-ng',
      label: 'user-provided',
      name: 'auditlog-ng',
      syslog_drain_url: null,
      tags: ['auditlog-ng'],
      volume_mounts: []
    }
  ]
}
process.env.VCAP_SERVICES = JSON.stringify(VCAP_SERVICES)

describe('Log to Audit Log Service NG ', () => {
  if (!VCAP_SERVICES["user-provided"][0].credentials)
    return test.skip('Skipping tests due to missing credentials', () => {})

  require('./tests')(POST)
})
