const cds = require('@sap/cds')

const { auditAccess } = require('./lib/access')
const { addDiffToCtx, calcModLogs4Before, calcModLogs4After, emitModLogs } = require('./lib/modification')
const { hasPersonalData } = require('./lib/utils')

const WRITE = ['CREATE', 'UPDATE', 'DELETE']

const _get_ancestry_of = (entity, service, ancestors = []) => {
  for (const each of service.entities) {
    for (const k in each.compositions) {
      if (each.compositions[k].target === entity.name && k !== 'SiblingEntity') {
        ancestors.push(each)
        _get_ancestry_of(each, service, ancestors)
      }
    }
  }
  return ancestors
}

/*
 * Add generic audit logging handlers
 */
cds.on('served', services => {
  const db = cds.db

  for (const service of services) {
    if (!(service instanceof cds.ApplicationService)) continue

    // automatically promote entities that are associated with data subjects
    for (const entity of service.entities) {
      if (entity['@PersonalData.EntitySemantics'] !== 'DataSubject') continue
      const ancestors = _get_ancestry_of(entity, service)
      for (const each of ancestors) {
        each['@PersonalData.EntitySemantics'] ??= 'Other'
      }
    }

    const relevantEntities = []
    for (const entity of service.entities) if (hasPersonalData(entity)) relevantEntities.push(entity)
    if (!relevantEntities.length) continue

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
