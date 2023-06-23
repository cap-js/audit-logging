module.exports = async function () {
  const audit = await cds.connect.to('audit-log')

  /*
   * default
   */

  this.on('testEmit', async function () {
    await audit.emit('foo', { bar: 'baz' })
  })

  this.on('testSend', async function () {
    await audit.send('foo', { bar: 'baz' })
  })
  
  /*
   * new
   */

  this.on('testLog', async function () {
    await audit.log('foo', { bar: 'baz' })
  })

  this.on('testLogSync', async function () {
    await audit.logSync('foo', { bar: 'baz' })
  })

  /*
   * compat
   */

  this.on('testDataAccessLog', async function () {
    // REVISIT: data structure is not yet final
    await audit.dataAccessLog({
      dataObject: { type: 'test', id: [{ keyName: 'test', value: 'test' }] },
      dataSubject: { type: 'test', id: [{ keyName: 'test', value: 'test' }], role: 'test' },
      attributes: [{ name: 'test' }]
    })
  })

  this.on('testDataModificationLog', async function () {
    // REVISIT: data structure is not yet final
    await audit.dataModificationLog({
      dataObject: { type: 'test', id: [{ keyName: 'test', value: 'test' }] },
      dataSubject: { type: 'test', id: [{ keyName: 'test', value: 'test' }], role: 'test' },
      attributes: [{ name: 'test', oldValue: 'test', newValue: 'test' }]
    })
  })

  this.on('testConfigChangeLog', async function () {
    // REVISIT: data structure is not yet final
    await audit.configChangeLog({
      dataObject: { type: 'test', id: [{ keyName: 'test', value: 'test' }] },
      attributes: [{ name: 'test', oldValue: 'test', newValue: 'test' }]
    })
  })

  this.on('testSecurityLog', async function () {
    // REVISIT: data structure is not yet final
    await audit.securityLog({ action: 'dummy', data: 'dummy' })
  })

  /*
   * test helpers
   */
  let _sequence = []
  this.before('*', req => !req.event.match(/sequence/i) && req.on('succeeded', () => _sequence.push('request succeeded')))
  this.on('getSequence', req => req.reply(_sequence))
  this.on('resetSequence', () => _sequence = [])
  audit.after('*', () => _sequence.push('audit log logged'))
}
