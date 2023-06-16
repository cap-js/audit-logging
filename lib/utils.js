const cds = require('@sap/cds')

const WRITE = { CREATE: 1, UPDATE: 1, DELETE: 1 }

const hasPersonalData = entity => {
  if (!entity['@PersonalData.DataSubjectRole']) return
  if (!entity['@PersonalData.EntitySemantics']) return
  return !!Object.values(entity.elements).some(element =>
    element['@PersonalData.IsPotentiallyPersonal'] ||
    element['@PersonalData.IsPotentiallySensitive'] ||
    (element['@PersonalData.FieldSemantics'] && element['@PersonalData.FieldSemantics'] === 'DataSubjectID'))
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

const getPick = event => {
  return (element, target) => {
    if (!hasPersonalData(target)) return

    const categories = []
    if (!element.isAssociation && element.key) categories.push('ObjectID')
    if (
      !element.isAssociation &&
      element['@PersonalData.FieldSemantics'] === 'DataSubjectID' &&
      target['@PersonalData.EntitySemantics'] === 'DataSubject'
    )
      categories.push('DataSubjectID')
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
      dataObject: { type: entity.name, id: [] },
      dataSubject: { id: [], role: entity['@PersonalData.DataSubjectRole'] },
      attributes: [],
      attachments: []
    }
    log = logs[hash]
  }
  return log
}

const addObjectID = (log, row, key) => {
  if (!log.dataObject.id.find(ele => ele.keyName === key) && key !== 'IsActiveEntity')
    log.dataObject.id.push({ keyName: key, value: String(row[key]) })
}

const addDataSubject = (log, row, key, entity) => {
  if (!log.dataSubject.type) log.dataSubject.type = entity.name
  if (!log.dataSubject.id.find(ele => ele.key === key)) {
    const value = row[key] || (row._old && row._old[key])
    log.dataSubject.id.push({ keyName: key, value: String(value) })
  }
}

const _addKeysToWhere = (keys, row, alias) =>
  keys
    .filter(key => !key.isAssociation && key.name !== 'IsActiveEntity')
    .reduce((keys, key) => {
      if (keys.length) keys.push('and')
      keys.push({ ref: [alias, key.name] }, '=', { val: row[key.name] })
      return keys
    }, [])

const _keyColumns = (keys, alias) => keys.filter(key => !key.isAssociation && key.name !== 'IsActiveEntity').map(key => ({ ref: [alias, key.name] }))

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

  if (previousCqn) {
    childCqn.where('exists', previousCqn)
  } else {
    childCqn.where(_addKeysToWhere(keys, row, as))
  }
  if (next) return _buildSubSelect(model, next, {}, childCqn)
  return childCqn
}

const _getDataSubjectIdPromise = ({ dataSubjectEntity, subs }, row, req, model) => {
  const keys = Object.values(dataSubjectEntity.keys)
  const as = _alias(dataSubjectEntity)

  const cqn = SELECT.from({ ref: [dataSubjectEntity.name], as })
    .columns(_keyColumns(keys, as))
    .where(['exists', _buildSubSelect(model, subs[0], row)])
  // entity reused in different branches => must check all
  for (let i = 1; i < subs.length; i++) {
    cqn.or(['exists', _buildSubSelect(model, subs[i], row)])
  }
  return cds
    .tx(req)
    .run(cqn)
    .then(res => {
      const id = []
      for (const k in res[0]) id.push({ keyName: k, value: String(res[0][k]) })
      return id
    })
}

const _getUps = (entity, model) => {
  if (entity.own('__parents')) return entity.__parents
  const ups = []
  for (const def of Object.values(model.definitions)) {
    if (def.kind !== 'entity' || !def.associations) continue
    for (const element of Object.values(def.associations)) {
      if (element.target !== entity.name || element._isBacklink) continue
      if (element.name === 'SiblingEntity') continue
      ups.push(element)
    }
  }
  return entity.set('__parents', ups)
}

const _ifDataSubject = (entity, role) => {
  return entity['@PersonalData.EntitySemantics'] === 'DataSubject' && entity['@PersonalData.DataSubjectRole'] === role
}

const _getDataSubjectUp = (role, model, entity, prev, next, result) => {
  for (const element of _getUps(entity, model)) {
    const me = { entity, relative: element.parent, element }
    if (prev) prev.next = me
    if (_ifDataSubject(element.parent, role)) {
      if (!result) result = { dataSubjectEntity: element.parent, subs: [] }
      result.subs.push(next || me)
      return result
    } else {
      // dfs is a must here
      result = _getDataSubjectUp(role, model, element.parent, me, next || me, result)
    }
  }
  return result
}

const _getDataSubjectDown = (role, entity, prev, next) => {
  const associations = Object.values(entity.associations || {}).filter(e => !e._isBacklink)
  for (const element of associations) {
    const me = { entity, relative: entity, element }
    if (_ifDataSubject(element._target, role)) {
      if (prev) prev.next = me
      return { dataSubjectEntity: element._target, subs: [next || me] }
    }
  }
  // bfs makes more sense here
  for (const element of associations) {
    const me = { entity, relative: entity, element }
    if (prev) prev.next = me
    const dataSubject = _getDataSubjectDown(role, element._target, me, next || me)
    if (dataSubject) return dataSubject
  }
}

const getDataSubject = (entity, model, role) => {
  const hash = '__dataSubject4' + role
  if (entity.own(hash)) return entity[hash]
  // entities with EntitySemantics 'DataSubjectDetails' or 'Other' must not necessarily
  // be always below or always above 'DataSubject' entity in CSN tree
  let dataSubject = _getDataSubjectUp(role, model, entity)
  if (!dataSubject) {
    dataSubject = _getDataSubjectDown(role, entity)
  }
  return entity.set(hash, dataSubject)
}

const addDataSubjectForDetailsEntity = (row, log, req, entity, model) => {
  const role = entity['@PersonalData.DataSubjectRole']

  const dataSubjectInfo = getDataSubject(entity, model, role)

  log.dataSubject.type = dataSubjectInfo.dataSubjectEntity.name

  /*
   * for each req (cf. $batch with atomicity) and data subject role (e.g., customer vs supplier),
   * store (in audit data structure at context) and reuse a single promise to look up the respective data subject
   */
  const mapKey = getMapKeyForCurrentRequest(req)
  const _audit = req.context._audit || (req.context._audit = {})
  if (!_audit.dataSubjects) _audit.dataSubjects = new Map()
  if (!_audit.dataSubjects.has(mapKey)) _audit.dataSubjects.set(mapKey, new Map())
  const map = _audit.dataSubjects.get(mapKey)
  if (map.has(role)) log.dataSubject.id = map.get(role)
  // REVISIT by downward lookups row might already contain ID - some potential to optimize
  else map.set(role, _getDataSubjectIdPromise(dataSubjectInfo, row, req, model))
}

const resolveDataSubjectPromises = log => {
  const logs = Object.values(log)
  return Promise.all(logs.map(log => log.dataSubject.id)).then(IDs =>
    logs.map((log, i) => {
      log.dataSubject.id = IDs[i]
      return log
    })
  )
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
  resolveDataSubjectPromises
}