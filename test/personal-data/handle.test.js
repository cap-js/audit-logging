const cds = require("@sap/cds");

let { GET: _GET } = cds.test().in(__dirname);

// the persistent outbox adds a delay
const wait = require("node:timers/promises").setTimeout;
const GET = (...args) => _GET(...args).then(async (res) => (await wait(42), res));

cds.env.requires["audit-log"].handle = ["WRITE"];

describe("handle", () => {
  let __log, _logs;
  const _log = (...args) => {
    if (!(args.length === 2 && typeof args[0] === "string" && args[0].match(/\[audit-log\]/i))) {
      // > not an audit log (most likely, anyway)
      return __log(...args);
    }

    _logs.push(args[1]);
  };

  const ALICE = { username: "alice", password: "password" };

  let _handle;

  beforeAll(() => {
    __log = global.console.log;
    global.console.log = _log;
    _handle = cds.env.requires["audit-log"].handle;
  });

  afterAll(() => {
    global.console.log = __log;
  });

  beforeEach(() => {
    cds.env.requires["audit-log"].handle = _handle;
    _logs = [];
  });

  test("defaults to WRITE", async () => {
    expect(cds.env.requires["audit-log"].handle).toEqual(["WRITE"]);
  });

  test("data access is not logged by default", async () => {
    const response = await GET("/crud-1/Customers", { auth: ALICE });

    expect(response).toMatchObject({ status: 200 });
    expect(_logs.length).toBe(0);
  });

  test("data access can be handled out of the box", async () => {
    cds.env.requires["audit-log"].handle = ["READ", "WRITE"];

    const response = await GET("/crud-1/Customers", { auth: ALICE });

    expect(response).toMatchObject({ status: 200 });
    expect(_logs.length).toBe(1);
    expect(_logs).toContainMatchObject({
      user: "alice",
      object: {
        type: "CRUD_1.Customers",
        id: { ID: expect.any(String) }
      },
      data_subject: {
        type: "CRUD_1.Customers",
        id: { ID: expect.any(String) },
        role: expect.any(String)
      },
      attributes: [{ name: "creditCardNo" }]
    });
  });

  test("READ with path but no target does not crash", async () => {
    cds.env.requires["audit-log"].handle = ["READ", "WRITE"];
    const srv = await cds.connect.to("CRUD_1");
    // Prepend on handler so it runs before generic CRUD handler — after handler runs with req.target undefined
    srv.prepend(() =>
      srv.on("READ", (req, next) => {
        if (req.path === "CRUD_1.nonExistent") {
          return [{ ID: 1 }];
        } else {
          return next();
        }
      })
    );
    // Without the req.target?. fix this would throw TypeError: Cannot read properties of undefined (reading '_service')
    const res = await srv.send({
      event: "READ",
      path: "/nonExistent",
      user: new cds.User.Privileged()
    });
    expect(res.length).toEqual(1);
  });
});
