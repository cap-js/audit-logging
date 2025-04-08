let initializing = false

class Relation {
  constructor(csn, path = []) {
    if (!initializing) throw new Error(`Do not new a relation, use 'Relation.to()' instead`)
    Object.defineProperty(this, 'csn', { get: () => csn })
    Object.defineProperty(this, 'path', {
      get: () => path,
      set: _ => {
        path = _
      }
    })
    if (csn.target) Object.defineProperty(this, 'target', { get: () => csn.target })
    initializing = false
  }

  static to(from, name) {
    initializing = true
    if (!name) return new Relation(from)
    return from._elements[name] && new Relation(from._elements[name], [...from.path, name])
  }

  _has(prop) {
    return Reflect.has(this, prop)
  }

  get _elements() {
    if (this.csn.elements) return this.csn.elements
    if (this.csn._target && this.csn._target.elements) return this.csn._target.elements
    // if (csn.targetAspect) relation.elements = model.definitions[csn.targetAspect].elements
    // if (csn.kind = 'type') relation.elements = model.definitions[csn.type].element
    return {}
  }

  join(fromAlias = '', toAlias = '') {
    return _getOnCond(this.csn, this.path, { select: fromAlias, join: toAlias })
  }
}

const exposeRelation = relation => Object.defineProperty({}, '_', { get: () => relation })

const relationHandler = relation => ({
  get: (target, name) => {
    const path = name.split(',')
    const prop = path.join('_')
    if (!target[prop]) {
      if (path.length === 1) {
        // REVISIT: property 'join' must not be used in CSN to make this working
        if (relation._has(prop)) return relation[prop]
        const newRelation = Relation.to(relation, prop)
        if (newRelation) {
          target[prop] = new Proxy(exposeRelation(newRelation), relationHandler(newRelation))
        }

        return target[prop]
      }

      target[prop] = path.reduce((relation, value) => relation[value] || relation.csn._relations[value], relation)
      target[prop].path = path
    }

    return target[prop]
  }
})

module.exports = {
  Relation,
  exposeRelation,
  relationHandler
}

//
// ----- utils
//

const _prefixForStruct = element => {
  const prefixes = []
  let parent = element.parent
  while (parent && parent.kind !== 'entity') {
    prefixes.push(parent.name)
    parent = parent.parent
  }
  return prefixes.length ? prefixes.reverse().join('_') + '_' : ''
}

const _toRef = (alias, column) => {
  if (Array.isArray(column)) column = column.join('_')
  return { ref: alias ? [alias, column] : [column] }
}

const _adaptRefs = (onCond, path, { select, join }) => {
  const _adaptEl = el => {
    const ref = el.ref

    if (ref) {
      if (ref[0] === path.join('_') && ref[1]) {
        return _toRef(select, ref.slice(1))
      }

      // no alias for special $user of canonical localized association
      if (ref[0] === '$user' && path[0] === 'localized') {
        return _toRef(undefined, ref.slice(0))
      }

      return _toRef(join, ref.slice(0))
    }

    if (el.xpr) return { xpr: el.xpr.map(_adaptEl) }
    return el
  }

  return onCond.map(_adaptEl)
}

const _replace$selfAndAliasOnCond = (xpr, csnElement, aliases, path) => {
  const selfIndex = xpr.findIndex(({ ref }) => ref?.[0] === '$self')
  if (selfIndex != -1) {
    let backLinkIndex
    if (xpr[selfIndex + 1] && xpr[selfIndex + 1] === '=') backLinkIndex = selfIndex + 2
    if (xpr[selfIndex - 1] && xpr[selfIndex - 1] === '=') backLinkIndex = selfIndex - 2
    if (backLinkIndex != null) {
      const ref = xpr[backLinkIndex].ref
      const backlinkName = ref[ref.length - 1]
      const mutOnCond = _newOnConditions(csnElement._backlink, [backlinkName], {
        select: aliases.join,
        join: aliases.select
      })

      xpr.splice(Math.min(backLinkIndex, selfIndex), 3, ...mutOnCond)
    }
  }

  for (let i = 0; i < xpr.length; i++) {
    const element = xpr[i]
    if (element.xpr) {
      _replace$selfAndAliasOnCond(element.xpr, csnElement, aliases, path)
      continue
    }

    if (element.ref) {
      if (element.ref[0] === path.join('_') && element.ref[1]) {
        element.ref = _toRef(aliases.select, element.ref.slice(1)).ref
        continue
      }

      // no alias for special $user of canonical localized association
      if (element.ref[0] === '$user' && path[0] === 'localized') {
        element.ref = _toRef(undefined, element.ref.slice(0)).ref
        continue
      }
      //no alias for special $now variable
      if (element.ref[0] === '$now') {
        continue
      }

      if (element.ref[0] === aliases.join || element.ref[0] === aliases.select) {
        // nothing todo here, as already right alias
        continue
      }

      element.ref = _toRef(aliases.join, element.ref.slice(0)).ref
    }
  }
}

const _args = (csnElement, path, aliases) => {
  const onCond = csnElement.on
  if (!onCond || onCond.length === 0) return []
  if (onCond.length < 3 && !onCond[0]?.xpr) return onCond
  if (!csnElement._isSelfManaged) return _adaptRefs(onCond, path, aliases)

  const onCondCopy = JSON.parse(JSON.stringify(onCond))
  _replace$selfAndAliasOnCond(onCondCopy, csnElement, aliases, path)

  return onCondCopy
}

// this is only for 2one managed w/o on-conditions, i.e. no static values are possible
const _foreignToOn = (csnElement, path, { select, join }) => {
  const on = []

  for (const key of csnElement._foreignKeys) {
    if (on.length !== 0) {
      on.push('and')
    }

    const prefixChild = _prefixForStruct(key.childElement)
    const ref1 = _toRef(select, prefixChild + key.childElement.name)
    const structPrefix = path.length > 1 ? path.slice(0, -1) : []
    const ref2 = _toRef(join, [...structPrefix, key.parentElement.name])
    on.push(ref1, '=', ref2)
  }

  return on
}

const _newOnConditions = (csnElement, path, aliases) => {
  if (csnElement.keys) {
    return _foreignToOn(csnElement, path, aliases)
  }

  return _args(csnElement, path, aliases)
}

const _getOnCond = (csnElement, path = [], aliases = { select: '', join: '' }) => {
  const onCond = _newOnConditions(csnElement, path, aliases)
  return [{ xpr: onCond }]
}
