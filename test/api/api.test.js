const { describe, test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert");
const customAssert = require("../jest.setup");
const cds = require("@sap/cds");

const { axios, POST, GET } = cds.test().in(__dirname);

// do not throw for 4xx responses
axios.defaults.validateStatus = () => true;

cds.env.requires["audit-log"] = {
  kind: "audit-log-to-console",
  impl: "../../srv/log2console",
  outbox: { kind: "in-memory-outbox" },
};

const wait = require("node:timers/promises").setTimeout;

// Matcher for localhost IPs (handles both IPv6 and IPv4-mapped IPv6)
const localhostIP = /^(::1|::ffff:127\.0\.0\.1)$/;

describe("AuditLogService API", () => {
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
  const BOB = { username: "bob", password: "password" };

  before(() => {
    __log = global.console.log;
    global.console.log = _log;
  });

  after(() => {
    global.console.log = __log;
  });

  beforeEach(async () => {
    await POST("/api/resetSequence", {}, { auth: ALICE });
    _logs = [];
  });

  describe("default", () => {
    test("emit is deferred", async () => {
      const response = await POST("/api/testEmit", {}, { auth: ALICE });
      assert.strictEqual(response.status, 204);
      await wait(42);
      const {
        data: { value: sequence },
      } = await GET("/api/getSequence()", { auth: ALICE });
      assert.deepStrictEqual(sequence, [
        "request succeeded",
        "audit log logged",
      ]);
      assert.strictEqual(_logs.length, 1);
      customAssert.toContainMatchObject(_logs, { user: "alice", bar: "baz" });
    });

    test("send is immediate", async () => {
      const response = await POST("/api/testSend", {}, { auth: ALICE });
      assert.strictEqual(response.status, 204);
      await wait(42);
      const {
        data: { value: sequence },
      } = await GET("/api/getSequence()", { auth: ALICE });
      assert.deepStrictEqual(sequence, [
        "audit log logged",
        "request succeeded",
      ]);
      assert.strictEqual(_logs.length, 1);
      customAssert.toContainMatchObject(_logs, { user: "alice", bar: "baz" });
    });
  });

  describe("new", () => {
    test("log is deferred", async () => {
      const response = await POST("/api/testLog", {}, { auth: ALICE });
      assert.strictEqual(response.status, 204);
      await wait(42);
      const {
        data: { value: sequence },
      } = await GET("/api/getSequence()", { auth: ALICE });
      assert.deepStrictEqual(sequence, [
        "request succeeded",
        "audit log logged",
      ]);
      assert.strictEqual(_logs.length, 1);
      customAssert.toContainMatchObject(_logs, { user: "alice", bar: "baz" });
    });

    test("logSync is immediate", async () => {
      const response = await POST("/api/testLogSync", {}, { auth: ALICE });
      assert.strictEqual(response.status, 204);
      await wait(42);
      const {
        data: { value: sequence },
      } = await GET("/api/getSequence()", { auth: ALICE });
      assert.deepStrictEqual(sequence, [
        "audit log logged",
        "request succeeded",
      ]);
      assert.strictEqual(_logs.length, 1);
      customAssert.toContainMatchObject(_logs, { user: "alice", bar: "baz" });
    });
  });

  test("the default inspect depth of 2 is enough", async () => {
    const audit = await cds.connect.to("audit-log");
    await audit.log("foo", { data_subject: { ID: { bar: "baz" } } });
    await wait(42);
    customAssert.toContainMatchObject(_logs, {
      data_subject: { ID: { bar: "baz" } },
    });
  });

  describe("common log entry fields", () => {
    test("are automatically filled", async () => {
      await cds.tx({ tenant: "bar" }, async () => {
        const audit = await cds.connect.to("audit-log");
        await audit.log("foo", {});
      });
      await wait(42);
      assert.ok(_logs[0].uuid);
      assert.strictEqual(typeof _logs[0].uuid, "string");
      assert.strictEqual(_logs[0].tenant, "bar");
      assert.strictEqual(_logs[0].user, "anonymous");
      assert.ok(_logs[0].time instanceof Date);
    });

    test("can be provided manually", async () => {
      const time = new Date("2021-01-01T00:00:00.000Z");
      await cds.tx({ tenant: "bar" }, async () => {
        const audit = await cds.connect.to("audit-log");
        await audit.log("foo", {
          uuid: "baz",
          tenant: "baz",
          user: "baz",
          time,
        });
      });
      await wait(42);
      assert.strictEqual(_logs[0].uuid, "baz");
      assert.strictEqual(_logs[0].tenant, "baz");
      assert.strictEqual(_logs[0].user, "baz");
      customAssert.toBeDateLike(_logs[0].time);
    });

    test("tenant can be null", async () => {
      await cds.tx({ tenant: "bar" }, async () => {
        const audit = await cds.connect.to("audit-log");
        await audit.log("foo", { uuid: "baz", tenant: null, user: "baz" });
      });
      await wait(42);
      assert.strictEqual(_logs[0].uuid, "baz");
      assert.strictEqual(_logs[0].tenant, null);
      assert.strictEqual(_logs[0].user, "baz");
    });
  });

  describe("custom log 403", () => {
    test("early reject", async () => {
      const response = await GET("/api/Books", { auth: BOB });
      assert.strictEqual(response.status, 403);
      await wait(42);
      assert.strictEqual(_logs.length, 1);
      assert.ok(localhostIP.test(_logs[0].ip));
      assert.strictEqual(_logs[0].user, "bob");
    });

    test("late reject", async () => {
      const response = await GET("/api/Books", { auth: ALICE });
      assert.strictEqual(response.status, 403);
      await wait(42);
      assert.strictEqual(_logs.length, 1);
      assert.ok(localhostIP.test(_logs[0].ip));
      assert.strictEqual(_logs[0].user, "alice");
    });

    test("early reject in batch", async () => {
      const response = await POST(
        "/api/$batch",
        { requests: [{ method: "GET", url: "/Books", id: "r1" }] },
        { auth: BOB },
      );
      assert.strictEqual(response.status, 403);
      await wait(42);
      assert.ok(_logs.length > 0); //> coding in ./srv/server.js results in 2 logs on @sap/cds^7
      assert.ok(localhostIP.test(_logs[0].ip));
      assert.strictEqual(_logs[0].user, "bob");
    });

    test("late reject in batch", async () => {
      const response = await POST(
        "/api/$batch",
        { requests: [{ method: "GET", url: "/Books", id: "r1" }] },
        { auth: ALICE },
      );
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.data.responses[0].status, 403);
      await wait(42);
      assert.strictEqual(_logs.length, 1);
      assert.ok(localhostIP.test(_logs[0].ip));
      assert.strictEqual(_logs[0].user, "alice");
    });
  });
});
