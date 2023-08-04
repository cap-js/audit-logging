const cds = require('@sap/cds')

// REVISIT: don't require internal stuff
const getTemplate = require('@sap/cds/libx/_runtime/common/utils/template')
const templateProcessor = require('@sap/cds/libx/_runtime/common/utils/templateProcessor')

const {
  getMapKeyForCurrentRequest,
  getRootEntity,
  getPick,
  createLogEntry,
  addObjectID,
  addDataSubject,
  addDataSubjectForDetailsEntity,
  resolveDataSubjectPromises
} = require('./utils')

let audit

/*
 * REVISIT: diff() doesn't work in srv after phase but foreign key propagation has not yet taken place in srv before phase
 *          -> calc diff in db layer and store in audit data structure at context
 *          -> REVISIT for GA: clear req._.partialPersistentState?
 */
const addDiffToCtx = async function (req) {
  // store diff in audit data structure at context
  const _audit = (req.context._audit ??= {})
  if (!_audit.diffs) _audit.diffs = new Map()
  const diff = await req.diff()
  _audit.diffs.set(req._.query, diff)
}
addDiffToCtx._initial = true

const _getOldAndNew = (action, row, key) => {
  let oldValue = action === 'Create' ? null : row._old && row._old[key]
  if (oldValue === undefined) oldValue = null
  let newValue = action === 'Delete' ? null : row[key]
  if (newValue === undefined) newValue = null
  return { oldValue, newValue }
}

const _addAttribute = (log, action, row, key) => {
  if (!log.attributes.find(ele => ele.name === key)) {
    const { oldValue, newValue } = _getOldAndNew(action, row, key)
    if (oldValue !== newValue) log.attributes.push({ name: key, old: oldValue, new: newValue })
  }
}

const _maskAttribute = (attributes, key) => {
  const attribute = attributes?.find(ele => ele.name === key)
  if (attribute) {
    attribute.old = '***'
    attribute.new = '***'
  }
}

const _processorFnModification = (modificationLogs, model, req, beforeWrite) => elementInfo => {
  if (!elementInfo.row?._op) return

  let { row, key, element, plain } = elementInfo

  // delete in before phase, create and update in after phase
  if ((row._op === 'delete') !== !!beforeWrite) return

  const entity = getRootEntity(element)
  const action = row._op[0].toUpperCase() + row._op.slice(1)

  // use diff of projection, if available
  if (row._projection) row = row._projection

  // create or augment log entry
  const modificationLog = createLogEntry(modificationLogs, entity, row)

  // process categories
  for (const category of plain.categories) {
    if (category === 'ObjectID') {
      addObjectID(modificationLog, row, key)
    } else if (category === 'DataSubjectID') {
      addDataSubject(modificationLog, row, key, entity)
    } else if (category === 'IsPotentiallyPersonal' || category === 'IsPotentiallySensitive') {
      _addAttribute(modificationLog, action, row, key)
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
  templateProcessor({ processFn, row: diff, template })

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
  await resolveDataSubjectPromises(modificationLogs)
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
