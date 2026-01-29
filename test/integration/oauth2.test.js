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
    assert.ok(
      cds.env.requires.auth.users.alice.tenant ===
        cds.env.requires["audit-log"].credentials.uaa.tenantid,
      `${cds.env.requires.auth.users.alice.tenant} does mot match audit log tenant`,
    );
    assert.ok(log.output.match(/\$PROVIDER/));
  });

  // NOTE: unoffcial feature
  test("tenant $PROVIDER is handled correctly", async () => {
    const data = JSON.stringify({ data: { foo: "bar" }, tenant: "$PROVIDER" });
    const res = await POST("/integration/passthrough", {
      event: "SecurityEvent",
      data,
    });
    assert.strictEqual(res.status, 204);
    assert.ok(log.output.match(/\$PROVIDER/));
  });
});
