const cds = require('@sap/cds')

const { auditAccess } = require('./lib/access')
const { augmentContext, calcMods4Before, calcMods4After, emitMods } = require('./lib/modification')
const { hasPersonalData } = require('./lib/utils')

// TODO: why does cds.requires.audit-log: false in sample package.json not work ootb?!
// REVIST: It does, doesn't it?


/*
 * Add generic audit logging handlers
 */
cds.on('served', services => {
  const db = cds.db // REVISIT: Why does this has to happen on db layer?
  for (let srv of services) {

    if (!(srv instanceof cds.ApplicationService)) continue

    /*
     * REVISIT: diff() doesn't work in srv after phase but foreign key propagation has not yet taken place in srv before phase
     *          -> calc diff in db layer and store in audit data structure at context
     *          -> REVISIT for GA: clear req._.partialPersistentState?
     */

    for (const entity of srv.entities) {

      // REVISIT: Disallows customers adding personal data extension fields
      if (!hasPersonalData(entity)) continue

      /*
       * CREATE
       */
      // REVISIT: 3 handlers for CREATE ?!? -> could go into one .on handler
      db.before('CREATE', entity, augmentContext)
      // create -> all new -> calcModificationLogsHandler in after phase
      db.after('CREATE', entity, calcMods4After)
      srv.after('CREATE', entity, emitMods)

      /*
       * READ
       */
      // REVISIT: Only if we have sensitive data?
      srv.after('READ', entity, auditAccess)

      /*
       * UPDATE
       */
      // REVISIT: 4 handlers for UPDATE ?!? -> could go into one .on handler
      db.before('UPDATE', entity, augmentContext)
      // update -> mixed (via deep) -> calcModificationLogsHandler in before and after phase
      db.before('UPDATE', entity, calcMods4Before)
      db.after('UPDATE', entity, calcMods4After) // REVISIT: Why do we have to calculate modifications twice?
      srv.after('UPDATE', entity, emitMods)

      /*
      * DELETE
      */
     // REVISIT: 3 handlers for DELETE ?!? -> could go into one .on handler
      db.before('DELETE', entity, augmentContext)
      // delete -> all done -> calcModificationLogsHandler in before phase
      db.before('DELETE', entity, calcMods4Before)
      srv.after('DELETE', entity, emitMods)
    }
  }
})
