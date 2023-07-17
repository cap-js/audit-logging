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

    this.on('*', function (req) {
      const { event, data } = req

      // event.match() is used to support the old event names
      if (event === 'SensitiveDataRead' || event.match(/^dataAccess/i)) return this._dataAccess(data)
      if (event === 'PersonalDataModified' || event.match(/^dataModification/i)) return this._dataModification(data)
      if (event === 'ConfigurationModified' || event.match(/^configChange/i)) return this._configChange(data)
      if (event === 'SecurityEvent' || event.match(/^security/i)) return this._security(data)

      LOG._warn && LOG.warn(`event "${event}" is not implemented`)
    })

    // call AuditLogService's init
    await super.init()
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

  async _dataAccess(accesses) {
    if (!Array.isArray(accesses)) accesses = [accesses]

    const client = this._client || (await this._getClient())
    if (!client) return

    // build the logs
    const { tenant, user } = this._oauth2
      ? { tenant: '$PROVIDER', user: '$USER' }
      : { tenant: accesses[0].tenant, user: accesses[0].user }
    const { entries, errors } = _buildDataAccessLogs(client, accesses, tenant, user)
    if (errors.length) throw _getErrorToThrow(errors)

    // write the logs
    await Promise.all(entries.map(entry => _sendDataAccessLog(entry).catch(err => errors.push(err))))
    if (errors.length) throw _getErrorToThrow(errors)
  }

  async _dataModification(modifications) {
    if (!Array.isArray(modifications)) modifications = [modifications]

    const client = this._client || (await this._getClient())
    if (!client) return

    // build the logs
    const { tenant, user } = this._oauth2
      ? { tenant: '$PROVIDER', user: '$USER' }
      : { tenant: modifications[0].tenant, user: modifications[0].user }
    const { entries, errors } = _buildDataModificationLogs(client, modifications, tenant, user)
    if (errors.length) throw _getErrorToThrow(errors)

    // write the logs
    await Promise.all(entries.map(entry => _sendDataModificationLog(entry).catch(err => errors.push(err))))
    if (errors.length) throw _getErrorToThrow(errors)
  }

  async _configChange(configurations) {
    if (!Array.isArray(configurations)) configurations = [configurations]

    const client = this._client || (await this._getClient())
    if (!client) return

    // build the logs
    const { tenant, user } = this._oauth2
      ? { tenant: '$PROVIDER', user: '$USER' }
      : { tenant: configurations[0].tenant, user: configurations[0].user }
    const { entries, errors } = _buildConfigChangeLogs(client, configurations, tenant, user)
    if (errors.length) throw _getErrorToThrow(errors)

    // write the logs
    await Promise.all(entries.map(entry => _sendConfigChangeLog(entry).catch(err => errors.push(err))))
    if (errors.length) throw _getErrorToThrow(errors)
  }

  async _security(arg) {
    const { action, data } = arg

    const client = this._client || (await this._getClient())
    if (!client) return

    // build the logs
    const { tenant, user } = this._oauth2
      ? { tenant: '$PROVIDER', user: '$USER' }
      : { tenant: arg.tenant, user: arg.user }
    const { entries, errors } = _buildSecurityLog(client, action, data, tenant, user)
    if (errors.length) throw _getErrorToThrow(errors)

    // write the logs
    await Promise.all(entries.map(entry => _sendSecurityLog(entry).catch(err => errors.push(err))))
    if (errors.length) throw _getErrorToThrow(errors)
  }
}

/*
 * utils
 */

function _getErrorToThrow(errors) {
  if (errors.length === 1) return errors[0]
  const error = new cds.error('MULTIPLE_ERRORS')
  error.details = errors
  if (errors.some(e => e.unrecoverable)) error.unrecoverable = true
  return error
}

function _getStringifiedId(id) {
  return Object.keys(id).reduce((acc, cur) => { acc[cur] = String(id[cur]); return acc; }, {})
}

function _getObjectToLog(object) {
  return { type: object.type, id: _getStringifiedId(object.id) }
}

function _getDataSubjectToLog(dataSubject) {
  return Object.assign(_getObjectToLog(dataSubject), { role: String(dataSubject.role) })
}

function _getAttributeToLog(attribute) {
  return { name: attribute.name, old: String(attribute.old) || 'null', new: String(attribute.new) || 'null' }
}

/*
 * access
 */

function _buildDataAccessLogs(client, accesses, tenant, user) {
  const entries = []
  const errors = []

  for (const access of accesses) {
    try {
      const entry = client.read(_getObjectToLog(access.object)).dataSubject(_getDataSubjectToLog(access.data_subject)).by(user)
      if (tenant) entry.tenant(tenant)
      for (const each of access.attributes) entry.attribute(each)
      if (access.attachments) for (const each of access.attachments) entry.attachment(each)
      entries.push(entry)
    } catch (err) {
      err.message = `Building data access log failed with error: ${err.message}`
      if (err.code === 'ERR_ASSERTION') err.unrecoverable = true
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
      const entry = client.update(_getObjectToLog(modification.object)).dataSubject(_getDataSubjectToLog(modification.data_subject)).by(user)
      if (tenant) entry.tenant(tenant)
      for (const each of modification.attributes) entry.attribute(_getAttributeToLog(each))
      entries.push(entry)
    } catch (err) {
      err.message = `Building data modification log failed with error: ${err.message}`
      if (err.code === 'ERR_ASSERTION') err.unrecoverable = true
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
 * config
 */

function _buildConfigChangeLogs(client, configurations, tenant, user) {
  const entries = []
  const errors = []

  for (const configuration of configurations) {
    try {
      const entry = client.configurationChange(_getObjectToLog(configuration.object)).by(user)
      if (tenant) entry.tenant(tenant)
      for (const each of configuration.attributes) entry.attribute(_getAttributeToLog(each))
      entries.push(entry)
    } catch (err) {
      err.message = `Building configuration change log failed with error: ${err.message}`
      if (err.code === 'ERR_ASSERTION') err.unrecoverable = true
      errors.push(err)
    }
  }

  return { entries, errors }
}

function _sendConfigChangeLog(entry) {
  return new Promise((resolve, reject) => {
    entry.logPrepare(function (err) {
      if (err) {
        err.message = `Preparing configuration change log failed with error: ${err.message}`
        return reject(err)
      }

      entry.logSuccess(function (err) {
        if (err) {
          err.message = `Writing configuration change log failed with error: ${err.message}`
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

function _buildSecurityLog(client, action, data, tenant, user) {
  let entry

  try {
    // TODO: action?!
    entry = client.securityMessage('action: %s, data: %s', action, data)
    if (tenant) entry.tenant(tenant)
    if (user) entry.by(user)
  } catch (err) {
    err.message = `Building security log failed with error: ${err.message}`
    if (err.code === 'ERR_ASSERTION') err.unrecoverable = true
    throw err
  }

  return entry
}

function _sendSecurityLog(entry) {
  return new Promise((resolve, reject) => {
    entry.log(function (err) {
      if (err) {
        err.message = `Writing security log failed with error: ${err.message}`
        return reject(err)
      }

      resolve()
    })
  })
}
