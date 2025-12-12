const cds = require("@sap/cds");

module.exports = cds.env.requires["audit-log"].vcap.tags.includes("auditlog-ng")
  ? require("./log2alsng")
  : require("./log2restv2");
