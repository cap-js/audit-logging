const cds = require("@sap/cds");

module.exports =
  cds.env.requires["audit-log"].vcap.name === "auditlog-ng"
    ? require("./log2alsng")
    : require("./log2restv2");
