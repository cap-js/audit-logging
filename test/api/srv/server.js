const cds = require('@sap/cds')

let audit

cds.on('served', async () => {
  audit = await cds.connect.to('audit-log')
})

const audit_log_403 = (resource, ip) => {
  // we need to start our own tx because the default tx may be burnt
  audit.tx(async () => {
    await audit.log('SecurityEvent', {
      data: {
        user: cds.context.user?.id || 'unknown',
        action: `Attempt to access restricted resource "${resource}" with insufficient authority`
      },
      ip
    })
  })
}

// log for requests that are rejected with 403
cds.on('bootstrap', app => {
  app.use((req, res, next) => {
    req.on('close', () => {
      if (res.statusCode == 403) {
        const { originalUrl, ip } = req
        audit_log_403(originalUrl, ip)
      }
    })
    next()
  })
})

// log for batch subrequests that are rejected with 403 (but the batch request itself is successful)
cds.on('serving', srv => {
  if (srv instanceof cds.ApplicationService) {
    srv.on('error', (err, req) => {
      if (err.code == 403) {
        const { originalUrl, ip } = req.http.req
        if (originalUrl.endsWith('/$batch')) audit_log_403(originalUrl.replace('/$batch', req.req.url), ip)
      }
    })
  }
})

module.exports = cds.server
