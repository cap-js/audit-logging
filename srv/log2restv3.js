const AuditLogService = require('./service')
const cds = require('@sap/cds')
const https = require('https')

module.exports = class AuditLog2RESTv3 extends AuditLogService {

  constructor() {
    super();
    this._vcap = JSON.parse(process.env.VCAP_SERVICES || '{}')
    this._userProvided = this._vcap["user-provided"].find(obj => obj.tags.includes('auditlog-ng')) || {}
    this._vcapApplication = this._vcap["VCAP_APPLICATION"] || {}
  }

  async init() {
    this.on('*', function (req) {
      const { event, data } = req
      this.eventMapper(event,data)
    })
    await super.init()
  }

  eventMapper(event, data) {
    return {
        "PersonalDataModified": () => this.logEvent("dppDataModification", data),
        "SensitiveDataRead": () => this.logEvent("dppDataAccess", data),
        "ConfigurationModified": () => this.logEvent("configurationChange", data),
        "SecurityEvent": () => this.logEvent("legacySecurityWrapper", data),
    }[event]()
  }

  eventDataPayload(event, data){
    // const subject = data["data_subject"]
    const object = data["object"] || { "type": "not specified", "id": { "ID": "not specified" } }
    const channel = data["channel"] || { "type": "not specified", "id": "not specified" }
    const subject = data["data_subject"] || { "type": "not specified", "id": { "ID": "not specified" } }
    const attributes = data["attributes"] || [{ "name": "not specified", "old": "not specified", "new": "not specified" }]
      return {
          "dppDataModification": {
            "objectType": object["type"],
            "objectId": object["id"]["ID"],
            "attribute": attributes[0]["name"],
            "oldValue": attributes[0]["old"],
            "newValue": attributes[0]["new"],
            "dataSubjectType": subject["type"],
            "dataSubjectId": subject["id"]["ID"]
          },
          "dppDataAccess": {
            "channelType": channel["type"],
            "channelId": channel["id"],
            "dataSubjectType": subject["type"],
            "dataSubjectId": subject["id"]["ID"],
            "objectType": object["type"],
            "objectId": object["id"]["ID"],
            "attribute": attributes[0]["name"],
          },
          "configurationChange": {
            "propertyName": attributes[0]["name"],
            "oldValue": attributes[0]["old"],
            "newValue": attributes[0]["new"],
            "objectType": object["type"],
            "objectId": object["id"]["ID"],
          },
          "legacySecurityWrapper": JSON.stringify(data)
      }[event]
  }

  eventPayload(event, data) {
    const tenant = cds.context?.tenant || null
    const timestamp = new Date().toISOString()

    const eventData = {
        "id": cds.utils.uuid(),
        "specversion": 1,
        "source": `/${this._userProvided.credentials?.region}/${this._userProvided.credentials?.namespace}/${tenant}`,
        "type": event,
        "time": timestamp,
        "data": {
              "metadata": {
                    "ts": timestamp,
                    "appId": this._vcapApplication.application_id || 'default app',
                    "infrastructure": {
                      "other": {
                            "runtimeType": "Node.js"
                      }
                    },
                    "platform": {
                      "other": {
                          "platformName": "CAP"
                      }
                    }
              },
              "data": {
                    [event]: this.eventDataPayload(event, data)
              }
        }
    }

    //Debug for local purposes
    // console.dir(eventData, { depth: null });
    return eventData
  }

  logEvent(event, data) {

    const passphrase = this._userProvided.credentials?.keyPassphrase
    const url = new URL(`${this._userProvided.credentials?.url}/ingestion/v1/events`)
    let eventData = []

    if(event === "legacySecurityWrapper") {
      eventData = JSON.stringify([this.eventPayload(event, data)]);
    } else {
      eventData = data["attributes"].map(attr => {
        return this.eventPayload(event, {
          ...data,
          attributes: [attr]
        });
      });
      eventData = JSON.stringify(eventData)
    } 

    // console.log(eventData)

    const options = {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(eventData)
      },
      key: this._userProvided.credentials?.key,
      cert: this._userProvided.credentials?.cert,
      ...(passphrase !== undefined && { passphrase })
    };
    
    return new Promise((resolve, reject) => {
      const req = https.request(url, options, res => {
        console.log('🛰️ Status Code:', res.statusCode);
        
        const chunks = []
        res.on('data', chunk => chunks.push(chunk))
      
        res.on('end', () => {
          const { statusCode, statusMessage } = res
          let body = Buffer.concat(chunks).toString()
          if (res.headers['content-type']?.match(/json/)) body = JSON.parse(body)
          if (res.statusCode >= 400) {
          // prettier-ignore
          const err = new Error(`Request failed with${statusMessage ? `: ${statusCode} - ${statusMessage}` : ` status ${statusCode}`}`)
          err.request = { method: options.method, url, headers: options.headers, body: data }
          if (err.request.headers.authorization)
            err.request.headers.authorization = err.request.headers.authorization.split(' ')[0] + ' ***'
          err.response = { statusCode, statusMessage, headers: res.headers, body }
          reject(err)
        } else {
          resolve(body)
        }
        });
      });
  
      req.on('error', (e) => {
          // reject(e.message)
          console.error(`Problem with request: ${e.message}`);
      });
  
      req.write(eventData);
      req.end();
    });
  }
}

