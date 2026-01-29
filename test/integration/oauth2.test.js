const { describe, test } = require("node:test");
const assert = require("node:assert");
const cds = require("@sap/cds");

const { POST } = cds.test().in(__dirname);
const log = cds.test.log();

cds.env.requires["audit-log"].credentials =
  process.env.ALS_CREDS_OAUTH2 && JSON.parse(process.env.ALS_CREDS_OAUTH2);

// stay in provider account (i.e., use "$PROVIDER" and avoid x-zid header when fetching oauth2 token)
cds.env.requires.auth.users.alice.tenant =
  cds.env.requires["audit-log"].credentials.uaa.tenantid;

cds.env.log.levels["audit-log"] = "debug";

describe("Log to Audit Log Service with oauth2 plan", () => {
  let logs = [];
  before(async () => {
    const audit = await cds.connect.to("audit-log");
    audit.after("*", (res, req) => {
      let sendLogs = req.data;
      if (!Array.isArray(sendLogs)) sendLogs = [sendLogs];
      logs.push(...sendLogs);
    });
  });
  beforeEach(() => {
    logs = [];
  });
  if (!cds.env.requires["audit-log"].credentials)
    return test.skip("Skipping tests due to missing credentials", () => {});

  require("./shared-asserts")(POST);

  test("no tenant is handled correctly", async () => {
    const data = JSON.stringify({ data: { foo: "bar" } });
    const res = await POST("/integration/passthrough", {
      event: "SecurityEvent",
      data,
    });
    assert.strictEqual(res.status, 204);
    assert.strictEqual(
      cds.env.requires.auth.users.alice.tenant,
      cds.env.requires["audit-log"].credentials.uaa.tenantid,
    );
    assert.strictEqual(logs[0].tenant, "$PROVIDER");
  });

  // NOTE: unofficial feature
  test("tenant $PROVIDER is handled correctly", async () => {
    const data = JSON.stringify({ data: { foo: "bar" }, tenant: "$PROVIDER" });
    const res = await POST("/integration/passthrough", {
      event: "SecurityEvent",
      data,
    });
    assert.strictEqual(res.status, 204);
    assert.strictEqual(logs[0].tenant, "$PROVIDER");
  });
});
