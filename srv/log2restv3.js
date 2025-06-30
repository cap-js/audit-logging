const AuditLogService = require('./service')
const cds = require('@sap/cds')
const https = require('https')

module.exports = class AuditLog2RESTv3 extends AuditLogService {

  constructor() {
    super();
    this._vcap = JSON.parse(process.env.VCAP_SERVICES || '{}')
    this._userProvided = this._vcap["VCAP_SERVICES"]["user-provided"].find(obj => obj.tags.includes('auditlog-ng')) || {}
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
        "SecurityEvent": () => this.logEvent("LEGACY_SECURITY_WRAPPER", data),
    }[event]()
  }

  eventDataPayload(event, data){
    const subject = data["data_subject"]
    const object = data["object"]
    const channel = data["channel"] || { "type": "not specified", "id": "not specified" }
    const attributes = data["attributes"] || "not specified"
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
          "LEGACY_SECURITY_WRAPPER": JSON.stringify(data)
      }[event]
  }

  eventPayload(event, data) {
    const tenant = cds.context?.tenant || 'default-tenant'
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
                    "tenantId": tenant,
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

    let eventData = data["attributes"].map(attr => {
      return this.eventPayload(event, {
        ...data,
        attributes: [attr]
      });
    });

    eventData = JSON.stringify(eventData)

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

    const req = https.request(url, options, res => {
      let responseData = '';
      console.log('🛰️ Status Code:', res.statusCode);
      
      res.on('data', chunk => {
        responseData += chunk;
      });
    
      res.on('end', () => {
        console.log('Response:', responseData);
      });
    });

    req.on('error', (e) => {
        console.error(`Problem with request: ${e.message}`);
    });

    req.write(eventData);
    req.end();
  }
}

