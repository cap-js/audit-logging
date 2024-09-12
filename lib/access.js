const cds = require('@sap/cds')

// REVISIT: don't require internal stuff
const getTemplate = require('@sap/cds/libx/_runtime/common/utils/template')
const templateProcessor = require('@sap/cds/libx/_runtime/common/utils/templateProcessor')

const {
  getRootEntity,
  getPick,
  createLogEntry,
  addObjectID,
  addDataSubject,
  addDataSubjectForDetailsEntity,
  resolveDataSubjects
} = require('./utils')

let audit

const _processorFnAccess = (accessLogs, model, req) => {
  return ({ row, key, element, plain }) => {
    if (row.IsActiveEntity === false) return

    const entity = getRootEntity(element)

    // create or augment log entry
    const entry = createLogEntry(accessLogs, entity, row)

    // process categories
    for (const category of plain.categories) {
      if (category === 'ObjectID') addObjectID(entry, row, key)
      else if (category === 'DataSubjectID') addDataSubject(entry, row, key, entity)
      else if (category === 'IsPotentiallySensitive' && key in row) {
        if (!entry.attributes.some(e => e.name === key)) entry.attributes.push({ name: key })
        // REVISIT: attribute vs. attachment?
      }
    }

    // add promise to determine data subject if a DataSubjectDetails entity
    const semantics = entity['@PersonalData.EntitySemantics']
    if (
      (semantics === 'DataSubjectDetails' || semantics === 'Other') &&
      Object.keys(entry.data_subject.id).length === 0 // > id still an empty object -> promise not yet set
    ) {
      addDataSubjectForDetailsEntity(row, entry, req, entity, model)
    }
  }
}

const auditAccess = async function (data, req) {
  if (!cds.env.requires['audit-log'].handle?.includes('READ')) return

  if (typeof data !== 'object' || data == null) return

  const mock = Object.assign({ name: req.target._service.name, model: this.model })
  const template = getTemplate('personal_read', mock, req.target, { pick: getPick('READ') })
  if (!template.elements.size) return

  const accessLogs = {}
  const _data = Array.isArray(data) ? data : [data]
  _data.forEach(row => templateProcessor({ processFn: _processorFnAccess(accessLogs, this.model, req), row, data: row, template }))

  for (const each of Object.keys(accessLogs)) if (!accessLogs[each].attributes.length) delete accessLogs[each]
  if (!Object.keys(accessLogs).length) return

  await resolveDataSubjects(accessLogs, req)
  const accesses = Object.values(accessLogs).filter(ele => ele.attributes.length)
  if (!accesses.length) return

  audit = audit || (await cds.connect.to('audit-log'))

  await Promise.all(accesses.map(access => audit.log('SensitiveDataRead', access)))
}

module.exports = {
  auditAccess
}
