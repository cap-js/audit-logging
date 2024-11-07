const cds = require('@sap/cds')

const WRITE = { CREATE: 1, UPDATE: 1, DELETE: 1 }

const $hasPersonalData = Symbol('@cap-js/audit-logging:hasPersonalData')
const $dataSubject = Symbol('@cap-js/audit-logging:dataSubject')
const $parents = Symbol('@cap-js/audit-logging:parents')
const $visitedUp = Symbol('@cap-js/audit-logging:visitedUp')
const $visitedDown = Symbol('@cap-js/audit-logging:visitedDown')

const hasPersonalData = entity => {
  if (entity.own($hasPersonalData) == null) {
    if (!entity['@PersonalData.EntitySemantics']) entity.set($hasPersonalData, false)
    else {
      // default role to entity name
      if (entity['@PersonalData.EntitySemantics'] === 'DataSubject' && !entity['@PersonalData.DataSubjectRole'])
        entity['@PersonalData.DataSubjectRole'] = entity.name.match(/\w+/g).pop()
      // prettier-ignore
      const hasPersonalData = !!Object.values(entity.elements).some(element =>
        element['@PersonalData.IsPotentiallyPersonal'] ||
        element['@PersonalData.IsPotentiallySensitive'] ||
        (element['@PersonalData.FieldSemantics'] && element['@PersonalData.FieldSemantics'] === 'DataSubjectID'))
      entity.set($hasPersonalData, hasPersonalData)
    }
  }
  return entity.own($hasPersonalData)
}

const getMapKeyForCurrentRequest = req => {
  // running in srv or db layer? -> srv's req.query used as key of diff and logs maps at req.context
  // REVISIT: req._tx should not be used like that!
  return req.tx.isDatabaseService ? req._.query : req.query
}

const getRootEntity = element => {
  let entity = element.parent
  while (entity.kind !== 'entity') entity = entity.parent
  return entity
}

const _isDataSubject = (element, target) => {
  return (
    !element.isAssociation &&
    element['@PersonalData.FieldSemantics'] === 'DataSubjectID' &&
    target['@PersonalData.EntitySemantics'] === 'DataSubject'
  )
}

const getPick = event => {
  return (element, target) => {
    if (!hasPersonalData(target)) return
    const categories = []
    if (!element.isAssociation && element.key) categories.push('ObjectID')
    if (_isDataSubject(element, target)) categories.push('DataSubjectID')
    if (event in WRITE && element['@PersonalData.IsPotentiallyPersonal']) categories.push('IsPotentiallyPersonal')
    if (element['@PersonalData.IsPotentiallySensitive']) categories.push('IsPotentiallySensitive')
    if (categories.length) return { categories }
  }
}

const _getHash = (entity, row) => {
  return `${entity.name}(${Object.keys(entity.keys)
    .map(k => `${k}=${row[k]}`)
    .join(',')})`
}

const createLogEntry = (logs, entity, row) => {
  const hash = _getHash(entity, row)
  let log = logs[hash]
  if (!log) {
    logs[hash] = {
      data_subject: { id: {}, role: entity['@PersonalData.DataSubjectRole'] },
      object: { type: entity.name, id: {} },
      attributes: []
    }
    log = logs[hash]
  }
  return log
}

const addObjectID = (log, row, key) => {
  if (!(key in log.object.id) && key !== 'IsActiveEntity') log.object.id[key] = row[key] || row._old?.[key]
}

const addDataSubject = (log, row, key, entity) => {
  if (!log.data_subject.type) log.data_subject.type = entity.name
  if (!(key in log.data_subject.id)) {
    const value = row[key] || row._old?.[key]
    log.data_subject.id[key] = value
  }
}

const _addKeysToWhere = (keys, row, alias) => {
  return keys
    .filter(key => !key.isAssociation && key.name !== 'IsActiveEntity')
    .reduce((keys, key) => {
      if (keys.length) keys.push('and')
      keys.push({ ref: [alias, key.name] }, '=', { val: row[key.name] || row._old?.[key.name] })
      return keys
    }, [])
}

const _keyColumns = (keys, alias) => {
  return keys
    .filter(key => !key.isAssociation && key.name !== 'IsActiveEntity')
    .map(key => ({ ref: [alias, key.name] }))
}

const _alias = entity => entity.name.replace(`${entity._service.name}.`, '').replace('.', '_')

const _buildSubSelect = (model, { entity, relative, element, next }, row, previousCqn) => {
  // relative is a parent or an entity itself

  const keys = Object.values(entity.keys)

  const entityName = entity.name
  const as = _alias(entity)

  const childCqn = SELECT.from({ ref: [entityName], as }).columns(_keyColumns(keys, as))

  const targetAlias = _alias(element._target)
  const relativeAlias = _alias(relative)

  childCqn.where(relative._relations[element.name].join(targetAlias, relativeAlias))

  if (previousCqn) childCqn.where('exists', previousCqn)
  else childCqn.where(_addKeysToWhere(keys, row, as))

  if (next) return _buildSubSelect(model, next, {}, childCqn)

  return childCqn
}

const _getDataSubjectIdQuery = ({ dataSubjectEntity, subs }, row, model) => {
  const keys = Object.values(dataSubjectEntity.keys)
  const as = _alias(dataSubjectEntity)

  const cqn = SELECT.one
    .from({ ref: [dataSubjectEntity.name], as })
    .columns(_keyColumns(keys, as))
    .where(['exists', _buildSubSelect(model, subs[0], row)])

  // entity reused in different branches => must check all
  for (let i = 1; i < subs.length; i++) cqn.or(['exists', _buildSubSelect(model, subs[i], row)])

  return cqn
}

const _getUps = (entity, model) => {
  if (entity.own($parents) == null) {
    const ups = []
    for (const def of Object.values(model.definitions)) {
      if (def.kind !== 'entity' || !def.associations) continue
      for (const element of Object.values(def.associations)) {
        if (element.target !== entity.name || element._isBacklink || element.name === 'SiblingEntity') continue
        ups.push(element)
      }
    }
    entity.set($parents, ups)
  }
  return entity.own($parents)
}

const _getDataSubjectUp = (root, model, entity, prev, next, result) => {
  for (const element of _getUps(entity, model)) {
    // cycle detection
    if (element.own($visitedUp) == null) element.set($visitedUp, new Set())
    if (element.own($visitedUp).has(root)) continue
    element.own($visitedUp).add(root)

    const me = { entity, relative: element.parent, element }
    if (prev) prev.next = me
    if (element.parent['@PersonalData.EntitySemantics'] === 'DataSubject') {
      if (!result) result = { dataSubjectEntity: element.parent, subs: [] }
      result.subs.push(next || me)
      return result
    } else {
      // dfs is a must here
      result = _getDataSubjectUp(root, model, element.parent, me, next || me, result)
    }
  }
  return result
}

const _getDataSubjectDown = (root, entity, prev, next) => {
  const associations = Object.values(entity.associations || {}).filter(e => !e._isBacklink)
  // bfs makes more sense here -> check all own assocs first before going deeper
  for (const element of associations) {
    const me = { entity, relative: entity, element }
    if (element._target['@PersonalData.EntitySemantics'] === 'DataSubject') {
      if (prev) prev.next = me
      return { dataSubjectEntity: element._target, subs: [next || me] }
    }
  }
  for (const element of associations) {
    // cycle detection
    if (element.own($visitedDown) == null) element.set($visitedDown, new Set())
    if (element.own($visitedDown).has(root)) continue
    element.own($visitedDown).add(root)

    const me = { entity, relative: entity, element }
    if (prev) prev.next = me
    const dataSubject = _getDataSubjectDown(root, element._target, me, next || me)
    if (dataSubject) return dataSubject
  }
}

const getDataSubject = (entity, model) => {
  if (entity.own($dataSubject) == null) {
    // entities with EntitySemantics 'DataSubjectDetails' or 'Other' must not necessarily
    // be always below or always above 'DataSubject' entity in CSN tree
    let dataSubjectInfo = _getDataSubjectUp(entity.name, model, entity)
    if (!dataSubjectInfo) dataSubjectInfo = _getDataSubjectDown(entity.name, entity)
    entity.set($dataSubject, dataSubjectInfo)
  }
  return entity.own($dataSubject)
}

const _getDataSubjectsMap = req => {
  const mapKey = getMapKeyForCurrentRequest(req)
  const _audit = (req.context._audit ??= {})
  if (!_audit.dataSubjects) _audit.dataSubjects = new Map()
  if (!_audit.dataSubjects.has(mapKey)) _audit.dataSubjects.set(mapKey, new Map())
  return _audit.dataSubjects.get(mapKey)
}

const addDataSubjectForDetailsEntity = (row, log, req, entity, model) => {
  const dataSubjectInfo = getDataSubject(entity, model)
  const role = dataSubjectInfo.dataSubjectEntity['@PersonalData.DataSubjectRole']
  log.data_subject.role ??= role
  log.data_subject.type = dataSubjectInfo.dataSubjectEntity.name
  /*
   * for each req (cf. $batch with atomicity) and data subject role (e.g., customer vs supplier),
   * store (in audit data structure at context) and reuse a single promise to look up the respective data subject
   */
  const map = _getDataSubjectsMap(req)
  if (map.has(role)) log.data_subject.id = map.get(role)
  // REVISIT by downward lookups row might already contain ID - some potential to optimize
  else map.set(role, _getDataSubjectIdQuery(dataSubjectInfo, row, model))
}

const resolveDataSubjects = (logs, req) => {
  const ps = []

  const map = _getDataSubjectsMap(req)

  for (const each of Object.values(logs)) {
    if (each.data_subject.id instanceof cds.ql.Query) {
      const q = each.data_subject.id
      if (!map.has(q)) {
        const p = cds.run(q).then(res => map.set(q, res))
        map.set(q, p)
        ps.push(p)
      }
    }
  }

  return Promise.all(ps).then(() => {
    for (const each of Object.values(logs)) {
      if (each.data_subject.id instanceof cds.ql.Query) {
        each.data_subject.id = map.get(each.data_subject.id)
      }
    }
  })
}

module.exports = {
  hasPersonalData,
  getMapKeyForCurrentRequest,
  getRootEntity,
  getPick,
  createLogEntry,
  addObjectID,
  addDataSubject,
  addDataSubjectForDetailsEntity,
  resolveDataSubjects
}
