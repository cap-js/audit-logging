const cds = require('@sap/cds')

const { auditAccess } = require('./lib/access')
const { addDiffToCtx, calcModLogs4Before, calcModLogs4After, emitModLogs } = require('./lib/modification')
const { hasPersonalData } = require('./lib/utils')

const WRITE = ['CREATE', 'UPDATE', 'DELETE']

/*
 * Add generic audit logging handlers
 */
cds.on('served', services => {
  const db = cds.db

  for (const service of services) {
    if (!(service instanceof cds.ApplicationService)) continue

    const relevantEntities = []
    for (const entity of service.entities) if (hasPersonalData(entity)) relevantEntities.push(entity)
    if (!relevantEntities.length) return

    for (const entity of relevantEntities) {
      /*
       * data access
       */
      service.after('READ', entity, auditAccess)

      /*
       * data modification
       */
      // common
      db.before(WRITE, entity, addDiffToCtx)
      service.after(WRITE, entity, emitModLogs)
      /*
       * for new or modified data, modifications are calculated in after phase
       * for deleted data, modifications are calculated in before phase
       * deep updates can contain new, modified and deleted data -> both phases
       */
      // create
      db.after('CREATE', entity, calcModLogs4After)
      // update
      db.before('UPDATE', entity, calcModLogs4Before)
      db.after('UPDATE', entity, calcModLogs4After)
      // delete
      db.before('DELETE', entity, calcModLogs4Before)
    }
  }
})
