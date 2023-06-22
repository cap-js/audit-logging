module.exports = (levels = {}) => {
  const _logs = {}

  const _push = (level, ...args) => {
    if (args.length > 1 || typeof args[0] !== 'object') return _logs[level].push(...args)
    // NOTE: test logger in @sap/cds uses an own deep copy impl
    const copy = JSON.parse(JSON.stringify(args[0]))
    args[0].message && (copy.message = args[0].message)
    // args[0].stack && (copy.stack = args[0].stack)
    _logs[level].push(copy)
  }

  const fn = () => {
    return {
      trace: (...args) => _push('trace', ...args),
      debug: (...args) => _push('debug', ...args),
      log: (...args) => _push('log', ...args),
      info: (...args) => _push('info', ...args),
      warn: (...args) => _push('warn', ...args),
      error: (...args) => _push('error', ...args),
      _trace: levels.trace || false,
      _debug: levels.debug || false,
      _info: levels.info || false,
      _warn: levels.warn || false,
      _error: levels.error || false
    }
  }

  fn._logs = _logs
  fn._resetLogs = () => {
    _logs.trace = []
    _logs.debug = []
    _logs.log = []
    _logs.info = []
    _logs.warn = []
    _logs.error = []
  }

  fn._resetLogs()

  return fn
}
