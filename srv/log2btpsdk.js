const cds = require("@sap/cds");

const LOG = cds.log("audit-log");

const AuditLogService = require("./service");

module.exports = class AuditLog2BTPSDK extends AuditLogService {
  async init() {
    // Initialize BTP SDK client
    const { credentials } = this.options;
    if (!credentials)
      throw new Error('No or malformed credentials for "audit-log"');

    // Load BTP SDK dynamically
    try {
      await this._initBTPSDK(credentials);
    } catch (err) {
      LOG.error("Failed to initialize BTP SDK:", err.message);
      throw new Error(`BTP SDK initialization failed: ${err.message}`);
    }

    this.on("*", function (req) {
      const { event, data } = req;

      // event.match() is used to support the old event names
      if (event === "SensitiveDataRead" || event.match(/^dataAccess/i)) {
        return this._handleDataAccess(data);
      }
      if (
        event === "PersonalDataModified" ||
        event.match(/^dataModification/i)
      ) {
        return this._handleDataModification(data);
      }
      if (event === "ConfigurationModified" || event.match(/^configChange/i)) {
        return this._handleConfigurationChange(data);
      }
      if (event === "SecurityEvent" || event.match(/^security/i)) {
        return this._handleSecurityEvent(data);
      }

      LOG._warn && LOG.warn(`Event "${event}" is not implemented`);
    });

    // call AuditLogService's init
    await super.init();
  }

  async _initBTPSDK(credentials) {
    // Try to load BTP SDK modules
    let sdk;
    try {
      // Load the SDK using the fixed import paths
      sdk = await import("../../sdk-node/dist/auditlog/index.js");
    } catch (err) {
      throw new Error(
        `BTP SDK not found or failed to load: ${err.message}. Please build the SDK first by running "npm run build" in ../sdk-node/`,
      );
    }

    this._sdk = sdk;

    // Create BTP SDK client
    if (!credentials.uaa) {
      // Standard plan or local development - use file-based logging
      // For local testing, don't provide any config to trigger file transport
      this._client = new sdk.AuditLogClient();
    } else {
      // OAuth2/Premium plan - configure with credentials
      const config = new sdk.AuditLogConfig(
        credentials.uaa.clientid,
        credentials.uaa.clientsecret,
        (credentials.uaa.certurl || credentials.uaa.url) + "/oauth/token",
        credentials.url,
      );
      this._client = new sdk.AuditLogClient(config);
      this._provider = credentials.uaa.tenantid;
    }

    LOG.info("BTP SDK audit log client initialized successfully");
  }

  async _handleSecurityEvent(logs) {
    if (!Array.isArray(logs)) logs = [logs];

    const events = [];
    for (const log of logs) {
      const builder = new this._sdk.SecurityEventBuilder().withData(
        typeof log.data === "object" ? JSON.stringify(log.data) : log.data,
      );

      // Add user if provided
      if (log.user) {
        builder.withUser(log.user);
      }

      // Add tenant if provided
      if (log.tenant) {
        const tenant = this._mapTenant(log.tenant);
        builder.withTenant(tenant);
      }

      // Add custom attributes if provided
      if (log.attributes && Array.isArray(log.attributes)) {
        log.attributes.forEach((attr) => {
          if (attr.name && attr.value) {
            builder.withAttribute(attr.name, attr.value);
          }
        });
      }

      // Add custom details if provided
      if (log.customDetails) {
        builder.withCustomDetails(log.customDetails);
      }

      events.push(builder.build());
    }

    return this._sendEvents(events);
  }

  async _handleDataAccess(logs) {
    if (!Array.isArray(logs)) logs = [logs];

    const events = [];
    for (const log of logs) {
      if (!log.object || !log.data_subject) {
        throw new Error("DataAccess event requires object and data_subject");
      }

      const builder = new this._sdk.DataAccessEventBuilder()
        .withObject(log.object.type, log.object.id)
        .withDataSubject(
          log.data_subject.type,
          log.data_subject.id,
          log.data_subject.role,
        );

      // Add user if provided
      if (log.user) {
        builder.withUser(log.user);
      }

      // Add tenant if provided
      if (log.tenant) {
        const tenant = this._mapTenant(log.tenant);
        builder.withTenant(tenant);
      }

      // Add attributes (access patterns)
      if (log.attributes && Array.isArray(log.attributes)) {
        log.attributes.forEach((attr) => {
          if (attr.name) {
            builder.withAccess(attr.name, attr.successful);
          }
        });
      }

      // Add custom details if provided
      if (log.customDetails) {
        builder.withCustomDetails(log.customDetails);
      }

      events.push(builder.build());
    }

    return this._sendEvents(events);
  }

  async _handleDataModification(logs) {
    if (!Array.isArray(logs)) logs = [logs];

    const events = [];
    for (const log of logs) {
      if (!log.object || !log.data_subject) {
        throw new Error(
          "DataModification event requires object and data_subject",
        );
      }

      const builder = new this._sdk.DataModificationEventBuilder()
        .withObject(log.object.type, log.object.id)
        .withDataSubject(
          log.data_subject.type,
          log.data_subject.id,
          log.data_subject.role,
        );

      // Add user if provided
      if (log.user) {
        builder.withUser(log.user);
      }

      // Add tenant if provided
      if (log.tenant) {
        const tenant = this._mapTenant(log.tenant);
        builder.withTenant(tenant);
      }

      // Add change attributes
      if (log.attributes && Array.isArray(log.attributes)) {
        log.attributes.forEach((attr) => {
          if (attr.name) {
            builder.withChange(attr.name, attr.new, attr.old);
          }
        });
      }

      // Add custom details if provided
      if (log.customDetails) {
        builder.withCustomDetails(log.customDetails);
      }

      events.push(builder.build());
    }

    return this._sendEvents(events);
  }

  async _handleConfigurationChange(logs) {
    if (!Array.isArray(logs)) logs = [logs];

    const events = [];
    for (const log of logs) {
      if (!log.object) {
        throw new Error("ConfigurationChange event requires object");
      }

      const builder =
        new this._sdk.ConfigurationChangeEventBuilder().withObject(
          log.object.type,
          log.object.id,
        );

      // Add user if provided
      if (log.user) {
        builder.withUser(log.user);
      }

      // Add tenant if provided
      if (log.tenant) {
        const tenant = this._mapTenant(log.tenant);
        builder.withTenant(tenant);
      }

      // Add change attributes
      if (log.attributes && Array.isArray(log.attributes)) {
        log.attributes.forEach((attr) => {
          if (attr.name) {
            builder.withChange(attr.name, attr.new, attr.old);
          }
        });
      }

      // Add custom details if provided
      if (log.customDetails) {
        builder.withCustomDetails(log.customDetails);
      }

      // Add optional id if provided
      if (log.id) {
        builder.withId(log.id);
      }

      events.push(builder.build());
    }

    return this._sendEvents(events);
  }

  _mapTenant(tenant) {
    if (tenant === "$PROVIDER" || tenant === this._provider) {
      return this._sdk.Tenant.PROVIDER;
    }
    if (tenant === "$SUBSCRIBER") {
      return this._sdk.Tenant.SUBSCRIBER;
    }
    // If it's a specific tenant ID and not the provider, treat as subscriber
    return this._sdk.Tenant.SUBSCRIBER;
  }

  async _sendEvents(events) {
    if (events.length === 0) return;

    try {
      if (events.length === 1) {
        await this._client.log(events[0]);
      } else {
        const failures = await this._client.logBatch(events);
        if (failures.length > 0) {
          const error = new Error("Some audit log events failed to send");
          error.details = failures;
          throw error;
        }
      }

      if (LOG._debug) {
        LOG.debug(
          `Successfully sent ${events.length} audit log event(s) via BTP SDK`,
        );
      }
    } catch (err) {
      LOG._trace && LOG.trace("Error sending audit log via BTP SDK:", err);
      throw err;
    }
  }
};
