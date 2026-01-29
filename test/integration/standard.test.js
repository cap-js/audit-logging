const { describe, test } = require("node:test");
const cds = require("@sap/cds");

const { POST } = cds.test().in(__dirname);

cds.env.requires["audit-log"].credentials =
  process.env.ALS_CREDS_STANDARD && JSON.parse(process.env.ALS_CREDS_STANDARD);

describe("Log to Audit Log Service with standard plan", () => {
  if (!cds.env.requires["audit-log"].credentials)
    return test.skip("Skipping tests due to missing credentials", () => {});

  require("./shared-asserts")(POST);
});
