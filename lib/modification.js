const cds = require('@sap/cds')

// REVISIT: don't require internal stuff
const getTemplate = require('@sap/cds/libx/_runtime/common/utils/template')

const {
  getMapKeyForCurrentRequest,
  getRootEntity,
  getPick,
  createLogEntry,
  addObjectID,
  addDataSubject,
  addDataSubjectForDetailsEntity,
  resolveDataSubjects
} = require('./utils')

let audit

const _applyTransitionRecursively = (transition, data, d, old = {}) => {
  for (const [k, v] of transition.mapping) {
    if (v.transition) {
      const ok = v.ref?.[0] || k
      if (!data[ok]) continue
      if (Array.isArray(data[ok])) {
        d[k] = []
        for (let i = 0; i < data[ok].length; i++) {
          const _op = data[ok][i]._op || d._op
          d[k].push(_op ? { _op } : {})
          const _old = old[ok]?.[i] || data[ok][i]._old
          if (_old) d[k][i]._old = _old
          _applyTransitionRecursively(v.transition, data[ok][i], d[k][i], _old)
        }
        if (old[ok] && data[ok].length !== old[ok].length) {
          for (const each of Object.values(old[ok]).filter(ele => !ele.__visited)) {
            const i = d[k].push({ _op: 'delete' })
            d[k][i - 1]._old = each
            _applyTransitionRecursively(v.transition, each, d[k][i - 1], each)
          }
        }
      } else {
        d[k] = { _op: data[ok]._op || d._op }
        const _old = old[ok] || data[ok]._old
        if (_old) d[k]._old = _old
        _applyTransitionRecursively(v.transition, data[ok], d[k], _old)
      }
    } else if (v.ref) {
      if (v.ref[0] in data) d[k] = data[v.ref[0]]
      if (v.ref[0] in old) d._old[k] = old[v.ref[0]]
    }
  }
  if (Object.keys(old).length) old.__visited = true
}

// REVISIT: remove once old database impl is removed
const _getDataWithAppliedTransitions = (data, req) => {
  let d
  const query = req.query.INSERT || req.query.UPDATE || req.query.DELETE
  // NOTE: there will only be transitions if old database impl is used
  const transition = query._transitions?.find(t => t.queryTarget.name === req.target.name)
  if (transition) {
    d = data._op ? { _op: data._op } : {}
    if (data._old) d._old = {}
    _applyTransitionRecursively(transition, data, d, data._old)
  }
  return d || data
}

/*
 * REVISIT: diff() doesn't work in srv after phase but foreign key propagation has not yet taken place in srv before phase
 *          -> calc diff in db layer and store in audit data structure at context
 *          -> REVISIT for GA: clear req._.partialPersistentState?
 */
const addDiffToCtx = async function (req) {
  // store diff in audit data structure at context
  const _audit = (req.context._audit ??= {})
  if (!_audit.diffs) _audit.diffs = new Map()

  // get diff
  let diff = (await req.diff()) || {}
  diff = _getDataWithAppliedTransitions(diff, req)

  // add keys, if necessary
  let keys = _getDataWithAppliedTransitions(Object.assign({}, req.data), req)
  for (const key in keys) if (!(key in req.target.keys)) delete keys[key]
  Object.assign(diff, keys)

  _audit.diffs.set(req._.query, diff)
}
addDiffToCtx._initial = true

const _getOldAndNew = (action, row, key, entity) => {
  let oldValue = action === 'Create' ? null : row._old && row._old[key]
  if (oldValue === undefined) oldValue = action === 'Update' && key in entity.keys ? row[key] : null
  else if (Array.isArray(oldValue)) oldValue = JSON.stringify(oldValue)
  let newValue = action === 'Delete' ? null : row[key]
  if (newValue === undefined) newValue = null
  else if (Array.isArray(newValue)) newValue = JSON.stringify(newValue)
  return { oldValue, newValue }
}

const _addAttribute = (log, action, row, key, entity) => {
  if (!log.attributes.find(ele => ele.name === key)) {
    const { oldValue, newValue } = _getOldAndNew(action, row, key, entity)
    if (oldValue !== newValue) {
      const attr = { name: key }
      if (action !== 'Create') attr.old = oldValue
      if (action !== 'Delete') attr.new = newValue
      log.attributes.push(attr)
    }
  }
}

const _maskAttribute = (attributes, key) => {
  const attribute = attributes?.find(ele => ele.name === key)
  if (attribute) {
    if ('old' in attribute) attribute.old = '***'
    if ('new' in attribute) attribute.new = '***'
  }
}

const _processorFnModification = (modificationLogs, model, req, beforeWrite) => elementInfo => {
  if (!elementInfo.row?._op) return

  let { row, key, element, plain } = elementInfo

  // delete in before phase, create and update in after phase
  if ((row._op === 'delete') !== !!beforeWrite) return

  const entity = getRootEntity(element)
  const action = row._op[0].toUpperCase() + row._op.slice(1)

  // create or augment log entry
  const modificationLog = createLogEntry(modificationLogs, entity, row)

  // process categories
  for (const category of plain.categories) {
    if (category === 'ObjectID') {
      addObjectID(modificationLog, row, key)
    } else if (category === 'DataSubjectID') {
      addDataSubject(modificationLog, row, key, entity)
    } else if (category === 'IsPotentiallyPersonal' || category === 'IsPotentiallySensitive') {
      _addAttribute(modificationLog, action, row, key, entity)
      // do not log the value of a sensitive attribute
      if (element['@PersonalData.IsPotentiallySensitive']) _maskAttribute(modificationLog.attributes, key)
    }
  }

  // add promise to determine data subject if a DataSubjectDetails entity
  if (
    (entity['@PersonalData.EntitySemantics'] === 'DataSubjectDetails' ||
      entity['@PersonalData.EntitySemantics'] === 'Other') &&
    Object.keys(modificationLog.data_subject.id).length === 0 // > id still an empty object -> promise not yet set
  ) {
    addDataSubjectForDetailsEntity(row, modificationLog, req, entity, model)
  }
}

const _getDataModificationLogs = (req, tx, diff, beforeWrite) => {
  const template = getTemplate(
    `personal_${req.event}`.toLowerCase(),
    Object.assign({ name: req.target._service.name, model: tx.model }),
    req.target,
    { pick: getPick(req.event) }
  )

  const modificationLogs = {}
  const processFn = _processorFnModification(modificationLogs, tx.model, req, beforeWrite)
  // cds internal templating mechanism api changed in 8.2.0 -> polyfill
  if (!template.process) {
    module.exports._templateProcessor ??= require('@sap/cds/libx/_runtime/common/utils/templateProcessor')
    template.process = (data, processFn) => {
      module.exports._templateProcessor({ processFn, row: data, template })
    }
  }
  template.process(diff, processFn)

  return modificationLogs
}

const _calcModificationLogsHandler = async function (req, beforeWrite, that) {
  const mapKey = getMapKeyForCurrentRequest(req)

  const _audit = (req.context._audit ??= {})
  const modificationLogs = _getDataModificationLogs(req, that, _audit.diffs.get(mapKey), beforeWrite)

  // store modificationLogs in audit data structure at context
  if (!_audit.modificationLogs) _audit.modificationLogs = new Map()
  const existingLogs = _audit.modificationLogs.get(mapKey) || {}
  _audit.modificationLogs.set(mapKey, Object.assign(existingLogs, modificationLogs))

  // execute the data subject promises before going along to on phase
  // guarantees that the reads are executed before the data is modified
  await resolveDataSubjects(modificationLogs, req)
}

const calcModLogs4Before = function (req) {
  return _calcModificationLogsHandler(req, true, this)
}

const calcModLogs4After = function (_, req) {
  return _calcModificationLogsHandler(req, false, this)
}

const emitModLogs = async function (_, req) {
  const modificationLogs = req.context?._audit?.modificationLogs?.get(req.query)
  if (!modificationLogs) return

  audit = audit || (await cds.connect.to('audit-log'))

  const modifications = Object.keys(modificationLogs)
    .map(k => modificationLogs[k])
    .filter(log => log.attributes.length)

  await Promise.all(modifications.map(modification => audit.log('PersonalDataModified', modification)))
}

module.exports = {
  addDiffToCtx,
  calcModLogs4Before,
  calcModLogs4After,
  emitModLogs
}
