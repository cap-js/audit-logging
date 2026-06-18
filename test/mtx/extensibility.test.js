const cds = require("@sap/cds");

let { POST: _POST } = cds.test().in(__dirname);

// the persistent outbox adds a delay
const wait = require("node:timers/promises").setTimeout;
const POST = (...args) => _POST(...args).then(async (res) => (await wait(42), res));

describe("handle", () => {
  let __log, _logs;
  const _log = (...args) => {
    if (!(args.length === 2 && typeof args[0] === "string" && args[0].match(/\[audit-log\]/i))) {
      // > not an audit log (most likely, anyway)
      return __log(...args);
    }

    _logs.push(args[1]);
  };

  const CAROL = { username: "carol", password: "password" };

  beforeAll(async () => {
    __log = global.console.log;
    global.console.log = _log;

    await POST(
      `/-/cds/deployment/subscribe`,
      {
        tenant: "t1",
        metadata: {},
        options: {}
      },
      {
        auth: { username: "yves", password: "password" }
      }
    );
    await POST(
      `/-/cds/deployment/subscribe`,
      {
        tenant: "t2",
        metadata: {},
        options: {}
      },
      {
        auth: { username: "yves", password: "password" }
      }
    );
  });

  afterAll(() => {
    global.console.log = __log;
  });

  beforeEach(() => {
    _logs = [];
  });

  test("data access is not logged by default", async () => {
    const {
      data: { ID }
    } = await POST(
      "/odata/v4/catalog/Customers",
      {
        firstName: "Carol",
        lastName: "Testing"
      },
      { auth: CAROL }
    );
    const response = await POST(
      "/odata/v4/catalog/Orders",
      {
        customer_ID: ID,
        amount: 20
      },
      { auth: CAROL }
    );
    expect(response).toMatchObject({ status: 201 });
    expect(_logs.length).toBe(2);
    expect(_logs).toContainMatchObject({
      user: "carol",
      object: {
        type: "CatalogService.Customers",
        id: { ID: expect.any(String) }
      },
      data_subject: {
        type: "CatalogService.Customers",
        id: { ID: expect.any(String) },
        role: expect.any(String)
      },
      attributes: [{ name: "firstName" }, { name: "lastName" }]
    });
  });
});
