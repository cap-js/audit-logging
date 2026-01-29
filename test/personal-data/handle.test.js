const { describe, test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert");
const customAssert = require("../utils/customAssert");
const cds = require("@sap/cds");

let { GET: _GET } = cds.test().in(__dirname);

// the persistent outbox adds a delay
const wait = require("node:timers/promises").setTimeout;
const GET = (...args) =>
  _GET(...args).then(async (res) => (await wait(42), res));

cds.env.requires["audit-log"].handle = ["WRITE"];

describe("handle", () => {
  let __log, _logs;
  const _log = (...args) => {
    if (
      !(
        args.length === 2 &&
        typeof args[0] === "string" &&
        args[0].match(/\[audit-log\]/i)
      )
    ) {
      // > not an audit log (most likely, anyway)
      return __log(...args);
    }

    _logs.push(args[1]);
  };

  const ALICE = { username: "alice", password: "password" };

  let _handle;

  before(() => {
    __log = global.console.log;
    global.console.log = _log;
    _handle = cds.env.requires["audit-log"].handle;
  });

  after(() => {
    global.console.log = __log;
  });

  beforeEach(() => {
    cds.env.requires["audit-log"].handle = _handle;
    _logs = [];
  });

  test("defaults to WRITE", async () => {
    assert.deepStrictEqual(cds.env.requires["audit-log"].handle, ["WRITE"]);
  });

  test("data access is not logged by default", async () => {
    const response = await GET("/crud-1/Customers", { auth: ALICE });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(_logs.length, 0);
  });

  test("data access can be handled out of the box", async () => {
    cds.env.requires["audit-log"].handle = ["READ", "WRITE"];

    const response = await GET("/crud-1/Customers", { auth: ALICE });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(_logs.length, 1);
    // Verify log structure with dynamic IDs
    customAssert;
    assert.strictEqual(_logs[0].user, "alice");
    assert.strictEqual(_logs[0].object.type, "CRUD_1.Customers");
    assert.ok(typeof _logs[0].object.id.ID === "string");
    assert.strictEqual(_logs[0].data_subject.type, "CRUD_1.Customers");
    assert.ok(typeof _logs[0].data_subject.id.ID === "string");
    assert.ok(typeof _logs[0].data_subject.role === "string");
    assert.deepStrictEqual(_logs[0].attributes, [{ name: "creditCardNo" }]);
  });
});
