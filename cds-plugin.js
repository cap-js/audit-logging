const cds = require("@sap/cds");

const { auditAccess } = require("./lib/access");
const {
  addDiffToCtx,
  calcModLogs4Before,
  calcModLogs4After,
  emitModLogs,
} = require("./lib/modification");
const { hasPersonalData } = require("./lib/utils");

const WRITE = ["CREATE", "UPDATE", "DELETE"];

/*
 * Add generic audit logging handlers
 */
cds.on("served", (services) => {
  const db = cds.db;

  for (const service of services) {
    if (!(service instanceof cds.ApplicationService)) continue;

    const relevantEntities = [];
    for (const entity of service.entities)
      if (hasPersonalData(entity)) relevantEntities.push(entity);
    if (!relevantEntities.length) continue;

    // automatically promote entities that are associated with data subjects
    for (const entity of relevantEntities) {
      if (entity["@PersonalData.EntitySemantics"] !== "DataSubject") continue;
      for (const e of service.entities) {
        for (const k in e.associations) {
          if (
            e.associations[k].target === entity.name &&
            k !== "SiblingEntity"
          ) {
            e["@PersonalData.EntitySemantics"] ??= "Other";
            e.associations[k]["@PersonalData.FieldSemantics"] ??=
              "DataSubjectID";
            if (!relevantEntities.includes(e)) relevantEntities.push(e);
          }
        }
      }
    }
  }
  for (const service of services) {
    if (!(service instanceof cds.ApplicationService)) continue;
    /*
     * data access
     */
    service.after("READ", async (res, req) => {
      // Checking for req.target._service to make sure only entities within services are considered
      if (!req.target._service || !hasPersonalData(req.target)) return;
      await auditAccess.call(service, res, req);
    });

    /*
     * data modification
     */
    service.after(WRITE, async (res, req) => {
      if (!req.target._service || !hasPersonalData(req.target)) return;
      await emitModLogs.call(service, res, req);
    });
  }
  /*
   * data modification
   */
  db.before("CREATE", async (req) => {
    if (!req.target._service || !hasPersonalData(req.target)) return;
    await addDiffToCtx.call(db, req);
  });
  /*
   * for new or modified data, modifications are calculated in after phase
   * for deleted data, modifications are calculated in before phase
   * deep updates can contain new, modified and deleted data -> both phases
   */
  // create
  db.after("CREATE", async (res, req) => {
    if (!req.target._service || !hasPersonalData(req.target)) return;
    await calcModLogs4After.call(db, res, req);
  });
  // update
  db.before("UPDATE", async (req) => {
    if (!req.target._service || !hasPersonalData(req.target)) return;
    await addDiffToCtx.call(db, req);
    await calcModLogs4Before.call(db, req);
  });
  db.after("UPDATE", async (res, req) => {
    if (!req.target._service || !hasPersonalData(req.target)) return;
    await calcModLogs4After.call(db, res, req);
  });
  // delete
  db.before("DELETE", async (req) => {
    if (!req.target._service || !hasPersonalData(req.target)) return;
    await addDiffToCtx.call(db, req);
    await calcModLogs4Before.call(db, req);
  });
});

/*
 * Export base class for extending in custom implementations
 */
module.exports = {
  AuditLogService: require("./srv/service"),
};
