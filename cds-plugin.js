const cds = require('@sap/cds')

const { auditAccess } = require('./lib/access')
const { augmentContext, calcMods4Before, calcMods4After, emitMods } = require('./lib/modification')
const { hasPersonalData } = require('./lib/utils')

// TODO: why does cds.requires.audit-log: false in sample package.json not work ootb?!

/*
 * anything to do?
 */
cds.on('loaded', (/* model */) => {
  // TODO
})

/*
 * Add generic audit logging handlers
 */
cds.on('serving', service => {
  if (!(service instanceof cds.ApplicationService)) return

  if (cds.db)
    enhance(service)
  else // > deferred
    cds.on('connect', srv => srv.isDatabaseService && enhance(service))
})

const enhance = service => {
  const relevantEntities = []
  for (const entity of service.entities) if (hasPersonalData(entity)) relevantEntities.push(entity)
  if (!relevantEntities.length) return

  /*
   * REVISIT: diff() doesn't work in srv after phase but foreign key propagation has not yet taken place in srv before phase
   *          -> calc diff in db layer and store in audit data structure at context
   *          -> REVISIT for GA: clear req._.partialPersistentState?
   */
  augmentContext._initial = true

  for (const entity of relevantEntities) {
    /*
     * CREATE
     */
    cds.db.before('CREATE', entity, augmentContext)
    // create -> all new -> calcModificationLogsHandler in after phase
    cds.db.after('CREATE', entity, calcMods4After)
    service.after('CREATE', entity, emitMods)

    /*
     * READ
     */
    service.after('READ', entity, auditAccess)

    /*
     * UPDATE
     */
    cds.db.before('UPDATE', entity, augmentContext)
    // update -> mixed (via deep) -> calcModificationLogsHandler in before and after phase
    cds.db.before('UPDATE', entity, calcMods4Before)
    cds.db.after('UPDATE', entity, calcMods4After)
    service.after('UPDATE', entity, emitMods)

    /*
     * DELETE
     */
    cds.db.before('DELETE', entity, augmentContext)
    // delete -> all done -> calcModificationLogsHandler in before phase
    cds.db.before('DELETE', entity, calcMods4Before)
    service.after('DELETE', entity, emitMods)
  }
}