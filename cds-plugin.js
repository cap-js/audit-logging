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
    if (!relevantEntities.length) continue

    // automatically promote entities that are associated with data subjects
    for (const entity of relevantEntities) {
      if (entity['@PersonalData.EntitySemantics'] !== 'DataSubject') continue
      for (const e of service.entities) {
        for (const k in e.associations) {
          if (e.associations[k].target === entity.name && k !== 'SiblingEntity') {
            e['@PersonalData.EntitySemantics'] ??= 'Other'
            e.associations[k]['@PersonalData.FieldSemantics'] ??= 'DataSubjectID'
            if (!relevantEntities.includes(e)) relevantEntities.push(e)
          }
        }
      }
    }

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

/*
 * Export base class for extending in custom implementations
 */
module.exports = {
  AuditLogService: require('./srv/service')
}
