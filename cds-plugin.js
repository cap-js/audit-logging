const cds = require('@sap/cds')

const { auditAccess } = require('./lib/access')
const { addDiffToCtx, calcModLogs4Before, calcModLogs4After, emitModLogs } = require('./lib/modification')
const { hasPersonalData } = require('./lib/utils')

const WRITE = ['CREATE', 'UPDATE', 'DELETE']

const $distance = Symbol('@cap-js/audit-logging:distance')

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

cds.on('served', services => {
  // prettier-ignore
  const { types, classes: { number } } = cds.builtin

  const recurse = (entity, ds, ds_keys, path, definitions) => {
    // forwards
    for (const assoc in entity.associations) {
      const target = definitions[entity.associations[assoc].target]

      if (!target['@PersonalData.EntitySemantics']) continue
      if (target['@PersonalData.EntitySemantics'] === 'DataSubject') continue
      if (target.own($distance) && target[$distance] <= path.length) continue

      target.set($distance, path.length)

      // the known entity instance as starting point
      const kp = Object.keys(target.keys).reduce((acc, cur) => {
        if (cur !== 'IsActiveEntity') acc.push(`${cur}=%%%${cur}%%%`)
        return acc
      }, [])
      // path.push({ id: target.name, where: kp })
      path.push({ id: assoc, where: kp })

      // construct path as string
      const p = path.reduce((acc, cur) => {
        if (!acc) {
          // acc += `${cur.id}${cur.where ? `[${cur.where.join(' and ')}]` : ''}`
          acc += `${cur.id}`
        } else {
          if (cur.id) {
            const close = acc.match(/([\]]+)$/)?.[1]
            if (close)
              acc =
                acc.slice(0, close.length * -1) +
                `[exists ${cur.id}${cur.where ? `[${cur.where.join(' and ')}]` : ''}]` +
                close
            else acc += `[exists ${cur.id}${cur.where ? `[${cur.where.join(' and ')}]` : ''}]`
          } else if (cur.to) acc += `.${cur.to}`
        }
        return acc
      }, '')

      target._getDataSubjectQuery = row => {
        let path = `${p}`
        for (const ph of path.match(/%%%(\w+)%%%/g)) {
          const ref = ph.slice(3, -3)
          const val = row[ref]
          path = path.replace(ph, types[target.elements[ref]._type] instanceof number ? val : `'${val}'`)
        }
        return SELECT.one.from(path).columns(ds_keys)
      }

      delete path.at(-1).where

      recurse(target, ds, ds_keys, path, definitions)

      path.pop()
    }

    // backwards
    const targets = Object.values(definitions).filter(
      d =>
        d['@PersonalData.EntitySemantics'] &&
        d['@PersonalData.EntitySemantics'] !== 'DataSubject' &&
        !d.own($distance) &&
        Object.values(d.associations || {}).some(
          a => a.target === entity.name && !Object.values(entity.associations || {}).some(b => b.target === d.name)
        )
    )

    for (const target of targets) {
      // debugger
    }
  }

  for (const service of services) {
    if (!(service instanceof cds.ApplicationService)) continue

    const dataSubjects = []
    for (const entity of service.entities)
      if (entity['@PersonalData.EntitySemantics'] === 'DataSubject') dataSubjects.push(entity)
    if (!dataSubjects.length) continue

    const definitions = service.model.definitions
    for (const ds of dataSubjects) {
      const ds_keys = Object.keys(ds.keys)
      const path = [{ id: ds.name }]
      recurse(ds, ds, ds_keys, path, definitions)
    }
  }
})

/*
 * Export base class for extending in custom implementations
 */
module.exports = {
  AuditLogService: require('./srv/service')
}
