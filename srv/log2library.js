const cds = require('@sap/cds')
const LOG = cds.log('audit-log')

const AuditLogService = require('./service')

module.exports = class AuditLog2Library extends AuditLogService {
  async init() {
    // credentials stuff
    if (this.options.credentials?.uaa) {
      if (this.options.outbox && this.options.outbox.kind === 'persistent-outbox')
        throw new Error('The combination of persistent-outbox and audit logging with OAuth2 plan is not supported')
      this._oauth2 = true
    } else if (!this.options.credentials) {
      throw new Error('No or malformed credentials for "audit-log"')
    }

    // call AuditLogService's init
    await super.init()

    this.on('*', function(req) {
      const { event, data } = req.data

      if (event.match(/^dataAccess/)) return this._dataAccess(data)
      if (event.match(/^dataModification/)) return this._dataModification(data)

      LOG._info && LOG.info(`event ${event} not implemented`)
    })
  }

  async _getClient() {
    if (this._client) return this._client

    let lib
    try {
      lib = require('@sap/audit-logging')
    } catch (error) {
      // not able to require lib -> no audit logging ootb
      return Promise.resolve()
    }

    let client
    try {
      client = await lib.v2(this.options.credentials, this._oauth2 ? cds?.context?.http?.req?.authInfo : undefined)
      if (!this._oauth2) this._client = client
    } catch (error) {
      LOG._warn && LOG.warn('Unable to initialize audit-logging client with error:', error)
      return Promise.resolve()
    }
    return client
  }

  async _dataAccess(access) {
    // REVISIT: previous model/impl supported bulk
    const accesses = [access]

    const client = this._client || await this._getClient()
    if (!client) return

    // build the logs
    const { tenant, user } = this._oauth2 ? { tenant: '$PROVIDER', user: '$USER' } : { tenant: access.tenant, user: access.user }
    const { entries, errors } = _buildDataAccessLogs(client, accesses, tenant, user)
    if (errors.length) throw errors.length === 1 ? errors[0] : Object.assign(new Error('MULTIPLE_ERRORS'), { details: errors })

    // write the logs
    await Promise.all(entries.map(entry => _sendDataAccessLog(entry).catch(err => errors.push(err))))
    if (errors.length) throw errors.length === 1 ? errors[0] : Object.assign(new Error('MULTIPLE_ERRORS'), { details: errors })
  }

  async _dataModification(modification) {
    // REVISIT: previous model/impl supported bulk
    const modifications = [modification]

    const client = this._client || await this._getClient()
    if (!client) return

    // build the logs
    const { tenant, user } = this._oauth2 ? { tenant: '$PROVIDER', user: '$USER' } : { tenant: modification.tenant, user: modification.user }
    const { entries, errors } = _buildDataModificationLogs(client, modifications, tenant, user)
    if (errors.length) throw errors.length === 1 ? errors[0] : Object.assign(new Error('MULTIPLE_ERRORS'), { details: errors })

    // write the logs
    await Promise.all(entries.map(entry => _sendDataModificationLog(entry).catch(err => errors.push(err))))
    if (errors.length) throw errors.length === 1 ? errors[0] : Object.assign(new Error('MULTIPLE_ERRORS'), { details: errors })
  }
}

/*
 * utils
 */

function _getObjectAndDataSubject(entry) {
  const { dataObject, dataSubject } = entry
  dataObject.id = dataObject.id.reduce((acc, cur) => {
    acc[cur.keyName] = cur.value
    return acc
  }, {})
  if (dataSubject) {
    dataSubject.id = dataSubject.id.reduce((acc, cur) => {
      acc[cur.keyName] = cur.value
      return acc
    }, {})
  }
  return { dataObject, dataSubject }
}

function _getAttributeToLog(ele) {
  return { name: ele.name, old: ele.oldValue || 'null', new: ele.newValue || 'null' }
}

/*
 * access
 */

function _buildDataAccessLogs(client, accesses, tenant, user) {
  const entries = []
  const errors = []

  for (const access of accesses) {
    try {
      const { dataObject, dataSubject } = _getObjectAndDataSubject(access)
      const entry = client.read(dataObject).dataSubject(dataSubject).by(user)
      if (tenant) entry.tenant(tenant)
      for (const each of access.attributes) entry.attribute(each)
      if (access.attachments) for (const each of access.attachments) entry.attachment(each)
      entries.push(entry)
    } catch (err) {
      err.message = `Building data access log failed with error: ${err.message}`
      errors.push(err)
    }
  }

  return { entries, errors }
}

function _sendDataAccessLog(entry) {
  return new Promise((resolve, reject) => {
    entry.log(function (err) {
      if (err && LOG._warn) {
        err.message = `Writing data access log failed with error: ${err.message}`
        return reject(err)
      }

      resolve()
    })
  })
}

/*
 * modification
 */

function _buildDataModificationLogs(client, modifications, tenant, user) {
  const entries = []
  const errors = []

  for (const modification of modifications) {
    try {
      const { dataObject, dataSubject } = _getObjectAndDataSubject(modification)
      const entry = client.update(dataObject).dataSubject(dataSubject).by(user)
      if (tenant) entry.tenant(tenant)
      for (const each of modification.attributes) entry.attribute(_getAttributeToLog(each))
      entries.push(entry)
    } catch (err) {
      err.message = `Building data modification log failed with error: ${err.message}`
      errors.push(err)
    }
  }

  return { entries, errors }
}

function _sendDataModificationLog(entry) {
  return new Promise((resolve, reject) => {
    entry.logPrepare(function (err) {
      if (err) {
        err.message = `Preparing data modification log failed with error: ${err.message}`
        return reject(err)
      }

      entry.logSuccess(function (err) {
        if (err) {
          err.message = `Writing data modification log failed with error: ${err.message}`
          return reject(err)
        }

        resolve()
      })
    })
  })
}

/*
 * security
 */

// function _buildSecurityLog(client, action, data, tenant, user) {
//   let entry

//   try {
//     entry = client.securityMessage('action: %s, data: %s', action, data)
//     if (tenant) entry.tenant(tenant)
//     if (user) entry.by(user)
//   } catch (err) {
//     err.message = `Building security log failed with error: ${err.message}`
//     throw err
//   }

//   return entry
// }

// function _sendSecurityLog(entry) {
//   return new Promise((resolve, reject) => {
//     entry.log(function (err) {
//       if (err) {
//         err.message = `Writing security log failed with error: ${err.message}`
//         return reject(err)
//       }

//       resolve()
//     })
//   })
// }

/*
 * config
 */

// function _buildConfigChangeLogs(client, configurations, tenant, user) {
//   const entries = []
//   const errors = []

//   for (const configuration of configurations) {
//     try {
//       const { dataObject } = getObjectAndDataSubject(configuration)
//       const entry = client.configurationChange(dataObject).by(user)
//       if (tenant) entry.tenant(tenant)
//       for (const each of configuration.attributes) entry.attribute(getAttributeToLog(each))
//       entries.push(entry)
//     } catch (err) {
//       err.message = `Building configuration change log failed with error: ${err.message}`
//       errors.push(err)
//     }
//   }

//   return { entries, errors }
// }

// function _sendConfigChangeLog(entry) {
//   return new Promise((resolve, reject) => {
//     entry.logPrepare(function (err) {
//       if (err) {
//         err.message = `Preparing configuration change log failed with error: ${err.message}`
//         return reject(err)
//       }

//       entry.logSuccess(function (err) {
//         if (err) {
//           err.message = `Writing configuration change log failed with error: ${err.message}`
//           return reject(err)
//         }

//         resolve()
//       })
//     })
//   })
// }
