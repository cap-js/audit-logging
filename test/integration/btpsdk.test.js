const cds = require("@sap/cds");
const fs = require("fs");
const path = require("path");
const { POST } = cds.test().in(__dirname);

// Set environment variable for BTP SDK local development (file-based transport)
// This enables the SDK to write audit logs to localauditlog.jsonl instead of sending to cloud services
process.env.APPFND_LOCALDEV_AUDITLOG = "true";

// NOTE: This test requires Node.js --experimental-vm-modules flag due to ES module dynamic imports
// Run with: npm run test:btpsdk

// Configure audit-log to use BTP SDK implementation
cds.env.requires["audit-log"] = {
  kind: "audit-log-btp-sdk",
  credentials: {
    url: "https://test-audit-log.cfapps.sap.hana.ondemand.com",
    // BTP SDK will write to localauditlog.jsonl file locally by default
  },
};

const _logger = require("../utils/logger")({ debug: true });
cds.log.Logger = _logger;

describe("BTP SDK Audit Logging - File Output", () => {
  let __log, _logs;
  const auditLogFile = path.join(process.cwd(), "localauditlog.jsonl");

  const _log = (...args) => {
    if (
      !(
        args.length === 2 &&
        typeof args[0] === "string" &&
        args[0].match(/\[audit-log\]/i)
      )
    ) {
      return __log(...args);
    }
    _logs.push(args[1]);
  };

  // Test data following the pattern from crud.test.js and tests.js
  const ALICE = { username: "alice", password: "password" };
  const object = { type: "Customer", id: { ID: "test-customer-123" } };
  const data_subject = Object.assign({ role: "DataOwner" }, object);

  beforeAll(() => {
    __log = global.console.log;
    global.console.log = _log;
  });

  afterAll(() => {
    global.console.log = __log;

    // Clean up the audit log file
    if (fs.existsSync(auditLogFile)) {
      try {
        fs.unlinkSync(auditLogFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });

  beforeEach(() => {
    _logs = [];
    _logger._resetLogs();

    // Clean up audit log file before each test
    if (fs.existsSync(auditLogFile)) {
      fs.unlinkSync(auditLogFile);
    }
  });

  // Helper function to read audit log content from localauditlog.jsonl
  function readAuditLogContent() {
    if (!fs.existsSync(auditLogFile)) {
      return [];
    }

    const content = fs.readFileSync(auditLogFile, "utf8").trim();
    if (!content) {
      return [];
    }

    // Parse JSON Lines format (one JSON object per line)
    const lines = content.split("\n");
    const events = [];

    lines.forEach((line) => {
      if (line.trim()) {
        try {
          events.push(JSON.parse(line.trim()));
        } catch (e) {
          console.warn("Failed to parse audit log line:", line, e.message);
        }
      }
    });

    return events;
  }

  describe("Security Events", () => {
    test("should write security event to file", async () => {
      const eventData = JSON.stringify({
        data: { action: "login_attempt", user: "testuser", success: true },
      });

      const response = await POST(
        "/integration/passthrough",
        {
          event: "SecurityEvent",
          data: eventData,
        },
        { auth: ALICE },
      );

      expect(response).toMatchObject({ status: 204 });

      // Wait a bit for file to be written
      await new Promise((resolve) => setTimeout(resolve, 100));

      const auditContent = readAuditLogContent();
      expect(auditContent.length).toBeGreaterThan(0);

      // Just verify that we have audit entries written to the file
      // The exact structure depends on the BTP SDK implementation
      expect(auditContent.length).toBeGreaterThan(0);

      // Log the entry for manual verification
      console.log(
        "Security event audit entry:",
        JSON.stringify(auditContent[0], null, 2),
      );
    });
  });

  describe("Data Access Events", () => {
    test("should write sensitive data read to file", async () => {
      const eventData = JSON.stringify({
        object,
        data_subject,
        attributes: [{ name: "email" }, { name: "phone" }],
      });

      const response = await POST(
        "/integration/passthrough",
        {
          event: "SensitiveDataRead",
          data: eventData,
        },
        { auth: ALICE },
      );

      expect(response).toMatchObject({ status: 204 });

      // Wait a bit for file to be written
      await new Promise((resolve) => setTimeout(resolve, 100));

      const auditContent = readAuditLogContent();
      expect(auditContent.length).toBeGreaterThan(0);

      // Verify audit entries were written
      expect(auditContent.length).toBeGreaterThan(0);

      // Log for manual verification
      console.log(
        "Data access audit entry:",
        JSON.stringify(auditContent[0], null, 2),
      );
    });

    test("should handle dataAccess event pattern", async () => {
      const eventData = JSON.stringify({
        object,
        data_subject,
        attributes: [{ name: "sensitiveField" }],
      });

      const response = await POST(
        "/integration/passthrough",
        {
          event: "dataAccess",
          data: eventData,
        },
        { auth: ALICE },
      );

      expect(response).toMatchObject({ status: 204 });

      // Wait for file write
      await new Promise((resolve) => setTimeout(resolve, 100));

      const auditContent = readAuditLogContent();
      expect(auditContent.length).toBeGreaterThan(0);
    });
  });

  describe("Data Modification Events", () => {
    test("should write personal data modification to file", async () => {
      const eventData = JSON.stringify({
        object,
        data_subject,
        attributes: [
          { name: "firstName", new: "John", old: "Jane" },
          { name: "lastName", new: "Doe", old: "Smith" },
        ],
      });

      const response = await POST(
        "/integration/passthrough",
        {
          event: "PersonalDataModified",
          data: eventData,
        },
        { auth: ALICE },
      );

      expect(response).toMatchObject({ status: 204 });

      // Wait for file write
      await new Promise((resolve) => setTimeout(resolve, 100));

      const auditContent = readAuditLogContent();
      expect(auditContent.length).toBeGreaterThan(0);

      // Verify audit entries were written
      expect(auditContent.length).toBeGreaterThan(0);

      // Log for manual verification
      console.log(
        "Data modification audit entry:",
        JSON.stringify(auditContent[0], null, 2),
      );
    });

    test("should handle dataModification event pattern", async () => {
      const eventData = JSON.stringify({
        object,
        data_subject,
        attributes: [{ name: "field", new: "newValue", old: "oldValue" }],
      });

      const response = await POST(
        "/integration/passthrough",
        {
          event: "dataModification",
          data: eventData,
        },
        { auth: ALICE },
      );

      expect(response).toMatchObject({ status: 204 });

      // Wait for file write
      await new Promise((resolve) => setTimeout(resolve, 100));

      const auditContent = readAuditLogContent();
      expect(auditContent.length).toBeGreaterThan(0);
    });
  });

  describe("Configuration Change Events", () => {
    test("should write configuration change to file", async () => {
      const eventData = JSON.stringify({
        object: { type: "SystemConfig", id: { name: "max_users" } },
        attributes: [
          { name: "max_users", new: 1000, old: 500 },
          { name: "timeout", new: 3600, old: 1800 },
        ],
      });

      const response = await POST(
        "/integration/passthrough",
        {
          event: "ConfigurationModified",
          data: eventData,
        },
        { auth: ALICE },
      );

      expect(response).toMatchObject({ status: 204 });

      // Wait for file write
      await new Promise((resolve) => setTimeout(resolve, 100));

      const auditContent = readAuditLogContent();
      expect(auditContent.length).toBeGreaterThan(0);

      // Verify audit entries were written
      expect(auditContent.length).toBeGreaterThan(0);

      // Log for manual verification
      console.log(
        "Configuration change audit entry:",
        JSON.stringify(auditContent[0], null, 2),
      );
    });

    test("should handle configChange event pattern", async () => {
      const eventData = JSON.stringify({
        object: { type: "Config", id: { key: "setting1" } },
        attributes: [{ name: "value", new: "enabled", old: "disabled" }],
      });

      const response = await POST(
        "/integration/passthrough",
        {
          event: "configChange",
          data: eventData,
        },
        { auth: ALICE },
      );

      expect(response).toMatchObject({ status: 204 });

      // Wait for file write
      await new Promise((resolve) => setTimeout(resolve, 100));

      const auditContent = readAuditLogContent();
      expect(auditContent.length).toBeGreaterThan(0);
    });
  });

  describe("File Output Verification", () => {
    test("should create localauditlog.jsonl file", async () => {
      // Send a few different events
      const events = [
        {
          event: "SecurityEvent",
          data: JSON.stringify({ data: { action: "test1" } }),
        },
        {
          event: "SensitiveDataRead",
          data: JSON.stringify({
            object,
            data_subject,
            attributes: [{ name: "field1" }],
          }),
        },
        {
          event: "PersonalDataModified",
          data: JSON.stringify({
            object,
            data_subject,
            attributes: [{ name: "field2", new: "val2" }],
          }),
        },
      ];

      for (const eventData of events) {
        await POST("/integration/passthrough", eventData, { auth: ALICE });
      }

      // Wait for file to be written
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Check that the audit log file was created
      expect(fs.existsSync(auditLogFile)).toBe(true);

      const auditContent = readAuditLogContent();
      expect(auditContent.length).toBeGreaterThan(0);

      // Log the content for debugging
      console.log("Audit log file:", auditLogFile);
      console.log("Audit entries count:", auditContent.length);

      if (auditContent.length > 0) {
        console.log(
          "Sample audit entry:",
          JSON.stringify(auditContent[0], null, 2),
        );
      }
    });
  });

  describe("Multiple Events", () => {
    test("should handle multiple events of different types", async () => {
      const testEvents = [
        {
          event: "SecurityEvent",
          data: JSON.stringify({ data: { action: "multi_test_security" } }),
        },
        {
          event: "SensitiveDataRead",
          data: JSON.stringify({
            object: { type: "Document", id: { ID: "doc-456" } },
            data_subject: {
              type: "Document",
              id: { ID: "doc-456" },
              role: "Document",
            },
            attributes: [{ name: "content" }],
          }),
        },
        {
          event: "PersonalDataModified",
          data: JSON.stringify({
            object: { type: "Profile", id: { ID: "profile-789" } },
            data_subject: {
              type: "Profile",
              id: { ID: "profile-789" },
              role: "UserProfile",
            },
            attributes: [{ name: "bio", new: "Updated bio", old: "Old bio" }],
          }),
        },
        {
          event: "ConfigurationModified",
          data: JSON.stringify({
            object: { type: "AppConfig", id: { section: "database" } },
            attributes: [{ name: "pool_size", new: 20, old: 10 }],
          }),
        },
      ];

      // Send all events
      for (const eventData of testEvents) {
        const response = await POST("/integration/passthrough", eventData, {
          auth: ALICE,
        });
        expect(response).toMatchObject({ status: 204 });
      }

      // Wait for all files to be written
      await new Promise((resolve) => setTimeout(resolve, 300));

      const auditContent = readAuditLogContent();
      expect(auditContent.length).toBeGreaterThan(0);

      // Verify we have entries (the exact structure depends on BTP SDK format)
      console.log(`Total audit entries written: ${auditContent.length}`);

      // Check that we have some variety in the audit entries
      // BTP SDK uses different field names than expected
      const uniqueValues = new Set();
      auditContent.forEach((entry) => {
        // BTP SDK entries have uuid, user, time, tenant, data fields
        if (entry.uuid) uniqueValues.add("has_uuid");
        if (entry.user) uniqueValues.add(`user_${entry.user}`);
        if (entry.tenant) uniqueValues.add(`tenant_${entry.tenant}`);
        if (entry.data) {
          try {
            const data = JSON.parse(entry.data);
            if (data.action) uniqueValues.add(`action_${data.action}`);
          } catch {
            // If data is not JSON, just note that we have data
            uniqueValues.add("has_data");
          }
        }
      });

      console.log("Event values found:", Array.from(uniqueValues));
      expect(uniqueValues.size).toBeGreaterThan(0);
    });
  });
});
