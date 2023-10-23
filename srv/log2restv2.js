const cds = require('@sap/cds')

const LOG = cds.log('audit-log')

const AuditLogService = require('./service')

module.exports = class AuditLog2RESTv2 extends AuditLogService {
  async init() {
    // credentials stuff
    const { credentials } = this.options
    if (!credentials) throw new Error('No or malformed credentials for "audit-log"')
    if (!credentials.uaa) {
      this._plan = 'standard'
      this._auth = 'Basic ' + Buffer.from(credentials.user + ':' + credentials.password).toString('base64')
    } else {
      this._plan = credentials.url.match(/6081/) ? 'premium' : 'oauth2'
      this._tokens = new Map()
      this._provider = credentials.uaa.tenantid
    }
    this._vcap = process.env.VCAP_APPLICATION ? JSON.parse(process.env.VCAP_APPLICATION) : null

    this.on('*', function (req) {
      const { event, data } = req

      // event.match() is used to support the old event names
      if (event === 'SensitiveDataRead' || event.match(/^dataAccess/i)) {
        return this._handle(data, 'DATA_ACCESS')
      }
      if (event === 'PersonalDataModified' || event.match(/^dataModification/i)) {
        data.success = true
        return this._handle(data, 'DATA_MODIFICATION')
      }
      if (event === 'ConfigurationModified' || event.match(/^configChange/i)) {
        data.success = true
        return this._handle(data, 'CONFIGURATION_CHANGE')
      }
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

    const { uaa } = this.options.credentials
    let url
    const data = {
      grant_type: 'client_credentials',
      response_type: 'token',
      client_id: uaa.clientid
    }
    const headers = { 'content-type': 'application/x-www-form-urlencoded' }
    if (uaa['credential-type'] === 'x509') {
      url = uaa.certurl + '/oauth/token'
    } else {
      url = uaa.url + '/oauth/token'
      data.client_secret = uaa.clientsecret
      if (tenant !== this._provider) headers['x-zid'] = tenant
    }
    const urlencoded = Object.keys(data).reduce((acc, cur) => {
      acc += (acc ? '&' : '') + cur + '=' + data[cur]
      return acc
    }, '')
    try {
      const { access_token, expires_in } = await _post(url, urlencoded, headers)
      tokens.set(tenant, access_token)
      // remove token from cache 60 seconds before it expires
      setTimeout(() => tokens.delete(tenant), (expires_in - 60) * 1000)
      return access_token
    } catch (err) {
      LOG._trace && LOG.trace('error during token fetch:', err)
      // 401 could also mean x-zid is not valid
      if (String(err.response?.statusCode).match(/^4\d\d$/)) err.unrecoverable = true
      throw err
    }
  }

  async _send(data, path) {
    const headers = { 'content-type': 'application/json' }
    if (this._vcap) {
      headers.XS_AUDIT_ORG = this._vcap.organization_name
      headers.XS_AUDIT_SPACE = this._vcap.space_name
      headers.XS_AUDIT_APP = this._vcap.application_name
    }
    let url
    if (this._plan === 'standard') {
      url = this.options.credentials.url + PATHS.STANDARD[path]
      headers.authorization = this._auth
    } else {
      url = this.options.credentials.url + PATHS.OAUTH2[path]
      data.tenant ??= this._provider //> if request has no tenant, stay in provider account
      headers.authorization = 'Bearer ' + (await this._getToken(data.tenant))
      // TODO: $PROVIDER for premium?
      data.tenant = data.tenant === this._provider ? '$PROVIDER' : '$SUBSCRIBER'
    }
    if (LOG._debug) {
      const _headers = Object.assign({}, headers, { authorization: headers.authorization.split(' ')[0] + ' ***' })
      LOG.debug(`sending audit log to ${url} with tenant "${data.tenant}", user "${data.user}", and headers`, _headers)
    }
    try {
      await _post(url, data, headers)
    } catch (err) {
      LOG._trace && LOG.trace('error during log send:', err)
      // 429 (rate limit) is not unrecoverable
      if (String(err.response?.statusCode).match(/^4\d\d$/) && err.response?.statusCode !== 429)
        err.unrecoverable = true
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
