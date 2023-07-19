const cds = require('@sap/cds')

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
      if (event === 'SensitiveDataRead' || event.match(/^dataAccess/i)) return this._handle(data, 'DATA_ACCESS')
      if (event === 'PersonalDataModified' || event.match(/^dataModification/i))
        return this._handle(data, 'DATA_MODIFICATION')
      if (event === 'ConfigurationModified' || event.match(/^configChange/i))
        return this._handle(data, 'CONFIGURATION_CHANGE')
      if (event === 'SecurityEvent' || event.match(/^security/i)) {
        if (typeof data.data === 'object') data.data = JSON.stringify(data.data)
        return this._handle(data, 'SECURITY_EVENT')
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
    const urlencoded = Object.keys(data).reduce((acc, cur) => {
      acc += (acc ? '&' : '') + cur + '=' + data[cur]
      return acc
    }, '')
    // TODO: x-zid
    const headers = { 'content-type': 'application/x-www-form-urlencoded', '_x-zid': tenant }
    try {
      const { access_token, expires_in } = await _post(url, urlencoded, headers)
      tokens.set(tenant, access_token)
      // remove token from cache 60 seconds before it expires
      setTimeout(() => tokens.delete(tenant), (expires_in - 60) * 1000)
      return access_token
    } catch (err) {
      // 401 could also mean x-zid is not valid
      if (String(err.response.statusCode).match(/^4\d\d$/)) err.unrecoverable = true
      throw err
    }
  }

  async _send(data, path) {
    let url
    const headers = {
      'content-type': 'application/json'
      // TODO: what are these for?
      // XS_AUDIT_APP: undefined,
      // XS_AUDIT_ORG: undefined,
      // XS_AUDIT_SPACE: undefined
    }
    if (this._oauth2) {
      url = this.options.credentials.url + PATHS.OAUTH2[path]
      headers.authorization = 'Bearer ' + (await this._getToken(data.tenant))
      data.tenant = '$SUBSCRIBER'
    } else {
      url = this.options.credentials.url + PATHS.STANDARD[path]
      headers.authorization = this._auth
    }
    try {
      await _post(url, data, headers)
    } catch (err) {
      if (String(err.response.statusCode).match(/^4\d\d$/)) err.unrecoverable = true
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
  STANDARD: {
    DATA_ACCESS: '/audit-log/v2/data-accesses',
    DATA_MODIFICATION: '/audit-log/v2/data-modifications',
    CONFIGURATION_CHANGE: '/audit-log/v2/configuration-changes',
    SECURITY_EVENT: '/audit-log/v2/security-events'
  },
  OAUTH2: {
    DATA_ACCESS: '/audit-log/oauth2/v2/data-accesses',
    DATA_MODIFICATION: '/audit-log/oauth2/v2/data-modifications',
    CONFIGURATION_CHANGE: '/audit-log/oauth2/v2/configuration-changes',
    SECURITY_EVENT: '/audit-log/oauth2/v2/security-events'
  }
}

/*
 * utils
 */

const https = require('https')

async function _post(url, data, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'POST', headers }, res => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        let body = Buffer.concat(chunks).toString()
        if (res.headers['content-type']?.match(/json/)) body = JSON.parse(body)
        if (res.statusCode >= 400) {
          const err = new Error(res.statusMessage)
          err.response = res
          err.body = body
          reject(err)
        } else {
          resolve(body)
        }
      })
    })
    req.on('error', reject)
    req.write(typeof data === 'object' ? JSON.stringify(data) : data)
    req.end()
  })
}

function _getErrorToThrow(errors) {
  if (errors.length === 1) return errors[0]
  const error = new cds.error('MULTIPLE_ERRORS')
  error.details = errors
  if (errors.some(e => e.unrecoverable)) error.unrecoverable = true
  return error
}
