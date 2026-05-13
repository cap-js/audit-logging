const cds = require("@sap/cds");

const { POST } = cds.test().in(__dirname);
const log = cds.test.log();

// stay in provider account (i.e., use "$PROVIDER" and avoid x-zid header when fetching oauth2 token)
cds.env.requires.auth.users.alice.tenant = cds.env.requires["audit-log"].credentials?.uaa?.tenantid;

cds.env.log.levels["audit-log"] = "debug";

describe("Premium/OAuth2 specific tests", () => {
  // required for tests to exit correctly (cf. token expiration timeouts)
  jest.useFakeTimers();

  const ALICE = { username: "alice", password: "password" };

  test("no tenant is handled correctly", async () => {
    const data = JSON.stringify({ data: { foo: "bar" } });
    const res = await POST("/integration/passthrough", { event: "SecurityEvent", data });
    expect(res).toMatchObject({ status: 204 });
    expect(log.output.match(/\$PROVIDER/)).toBeTruthy();
  });

  // NOTE: unofficial feature
  test("tenant $PROVIDER is handled correctly", async () => {
    const data = JSON.stringify({ data: { foo: "bar" }, tenant: "$PROVIDER" });
    const res = await POST(
      "/integration/passthrough",
      { event: "SecurityEvent", data },
      { auth: ALICE }
    );
    expect(res).toMatchObject({ status: 204 });
    expect(log.output.match(/\$PROVIDER/)).toBeTruthy();
  });
});
