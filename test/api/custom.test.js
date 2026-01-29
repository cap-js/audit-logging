const { describe, test, before, after, beforeEach } = require("node:test");
const customAssert = require("../utils/customAssert");
const cds = require("@sap/cds");

// set cwd for resolving impl
cds.test().in(__dirname);

cds.env.requires["audit-log"] = {
  impl: "MyAuditLogService.js",
};

describe("Custom Implementation", () => {
  let __log, _logs;
  const _log = (...args) => {
    if (
      !(
        args.length === 2 &&
        typeof args[0] === "string" &&
        args[0].match(/\[my-audit-log\]/i)
      )
    ) {
      // > not an audit log (most likely, anyway)
      return __log(...args);
    }

    _logs.push(args[1]);
  };

  before(() => {
    __log = global.console.log;
    global.console.log = _log;
  });

  after(() => {
    global.console.log = __log;
  });

  beforeEach(async () => {
    _logs = [];
  });

  test("extending AuditLogService exported by plugin", async () => {
    const audit = await cds.connect.to("audit-log");
    await audit.log("foo", { data_subject: { ID: { bar: "baz" } } });
    customAssert.toContainMatchObject(_logs, {
      data_subject: { ID: { bar: "baz" } },
    });
  });
});
