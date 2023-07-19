module.exports = async function () {
  const audit = await cds.connect.to('audit-log')

  this.on('testEmit', async function () {
    await audit.emit('foo', { bar: 'baz' })
  })

  this.on('testSend', async function () {
    await audit.send('foo', { bar: 'baz' })
  })

  this.on('testLog', async function () {
    await audit.log('foo', { bar: 'baz' })
  })

  this.on('testLogSync', async function () {
    await audit.logSync('foo', { bar: 'baz' })
  })

  // test helpers
  let _sequence = []
  this.before(
    '*',
    req => !req.event.match(/sequence/i) && req.on('succeeded', () => _sequence.push('request succeeded'))
  )
  this.on('getSequence', req => req.reply(_sequence))
  this.on('resetSequence', () => (_sequence = []))
  audit.after('*', () => _sequence.push('audit log logged'))
}
