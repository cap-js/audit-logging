const cds = require('@sap/cds')
const axios = require('axios')

const LOG = cds.log('audit-log')

const AuditLogService = require('./service')

module.exports = class AuditLog2RESTv2 extends AuditLogService {
  async init() {
    // credentials stuff
    const { credentials } = this.options
    if (!credentials) throw new Error('No or malformed credentials for "audit-log"')
    if (credentials.uaa) {
      this._oauth2 = true
      this._tokens = new Map()
    } else {
      this._auth = 'Basic ' + Buffer.from(credentials.user + ':' + credentials.password).toString('base64')
    }

    this.on('*', function (req) {
      const { event, data } = req

      // event.match() is used to support the old event names
      if (event === 'SensitiveDataRead' || event.match(/^dataAccess/i)) return this._handle(data, PATHS.DA)
      if (event === 'PersonalDataModified' || event.match(/^dataModification/i)) return this._handle(data, PATHS.DM)
      if (event === 'ConfigurationModified' || event.match(/^configChange/i)) return this._handle(data, PATHS.CC)
      if (event === 'SecurityEvent' || event.match(/^security/i)) {
        if (typeof data.data === 'object') data.data = JSON.stringify(data.data)
        return this._handle(data, PATHS.SE)
      }

      LOG._warn && LOG.warn(`Event "${event}" is not implemented`)
    })

    // call AuditLogService's init
    await super.init()
  }

  async _getToken(tenant) {
    const { _tokens: tokens } = this
    if (tokens.has(tenant)) return tokens.get(tenant)

    const url = this.options.credentials.uaa.url + '/oauth/token'
    const data = {
      grant_type: 'client_credentials',
      response_type: 'token',
      client_id: this.options.credentials.uaa.clientid,
      client_secret: this.options.credentials.uaa.clientsecret
    }
    // TODO: x-zid
    const headers = { 'content-type': 'application/x-www-form-urlencoded', '_x-zid': tenant }
    try {
      const {
        data: { access_token, expires_in }
      } = await axios.post(url, data, { headers })
      tokens.set(tenant, access_token)
      // remove token from cache 60 seconds before it expires
      setTimeout(() => tokens.delete(tenant), (expires_in - 60) * 1000)
      return access_token
    } catch (err) {
      // 401 could also mean x-zid is not valid
      if (String(err.response.status).match(/^4\d\d$/)) err.unrecoverable = true
      throw err
    }
  }

  async _send(data, path) {
    const url = this.options.credentials.url + path
    const headers = {
      authorization: this._auth,
      'content-type': 'application/json'
      // TODO
      // XS_AUDIT_APP: undefined,
      // XS_AUDIT_ORG: undefined,
      // XS_AUDIT_SPACE: undefined
    }
    if (this._oauth2) {
      headers.authorization = 'Bearer ' + (await this._getToken(data.tenant))
      data.tenant = '$SUBSCRIBER'
    }
    try {
      await axios.post(url, data, { headers })
    } catch (err) {
      if (String(err.response.status).match(/^4\d\d$/)) err.unrecoverable = true
      throw err
    }
  }

  async _handle(logs, path) {
    if (!Array.isArray(logs)) logs = [logs]

    // write the logs
    const errors = []
    await Promise.all(logs.map(log => this._send(log, path).catch(err => errors.push(err))))
    if (errors.length) throw _getErrorToThrow(errors)
  }
}

/*
 * consts
 */

const PATHS = {
  DA: '/audit-log/v2/data-accesses',
  DM: '/audit-log/v2/data-modifications',
  CC: '/audit-log/v2/configuration-changes',
  SE: '/audit-log/v2/security-events'
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
