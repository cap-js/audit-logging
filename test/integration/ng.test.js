const cds = require("@sap/cds");

const { POST } = cds.test().in(__dirname);

describe("NG specific tests", () => {
  const ALICE = { username: "alice", password: "password" };
  const update_attributes = [{ name: "foo", old: "bar", new: "baz" }];

  test("id flattening", async () => {
    expect(
      cds.services["audit-log"].flattenAndSortIdObject({
        foo: "bar",
        alpha: "omega",
        ping: "pong",
        fizz: "buzz"
      })
    ).toBe("alpha:omega fizz:buzz foo:bar ping:pong");
  });

  test("writes log with multiple id attributes in object and data subject", async () => {
    const object = {
      type: "foo.bar",
      id: { foo: "bar", alpha: "omega", ping: "pong", fizz: "buzz" }
    };
    const data_subject = { ...object, role: "foo.bar" };
    const data = JSON.stringify({
      object,
      data_subject,
      attributes: update_attributes
    });
    const res = await POST(
      "/integration/passthrough",
      { event: "PersonalDataModified", data },
      { auth: ALICE }
    );
    expect(res).toMatchObject({ status: 204 });
  });

  test("writes log without id attributes in object and data subject", async () => {
    const object = { type: "foo.bar", id: {} };
    const data_subject = { ...object, role: "foo.bar" };
    const data = JSON.stringify({
      object,
      data_subject,
      attributes: update_attributes
    });
    const res = await POST(
      "/integration/passthrough",
      { event: "PersonalDataModified", data },
      { auth: ALICE }
    );
    expect(res).toMatchObject({ status: 204 });
  });

  test("rejects log with invalid data", async () => {
    await expect(
      POST(
        "/integration/passthrough",
        { event: "PersonalDataModified", data: "{}" },
        { auth: ALICE }
      )
    ).rejects.toThrow("Request failed with: 403 - Forbidden");
  });

  test("writes log for custom event tenantOnboarding", async () => {
    const data = JSON.stringify({
      tenantId: "test-tenant"
    });
    const res = await POST(
      "/integration/passthrough",
      { event: "tenantOnboarding", data },
      { auth: ALICE }
    );
    expect(res).toMatchObject({ status: 204 });
  });

  test("writes log for custom event userLogoff", async () => {
    const data = JSON.stringify({
      logoffType: "UNSPECIFIED"
    });
    const res = await POST(
      "/integration/passthrough",
      { event: "userLogoff", data },
      { auth: ALICE }
    );
    expect(res).toMatchObject({ status: 204 });
  });
});
