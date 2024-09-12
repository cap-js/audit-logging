const cds = require('@sap/cds')

module.exports = async function () {
  const audit = await cds.connect.to('audit-log')

  this.on('passthrough', async function (req) {
    const { event, data } = req.data
    await audit.logSync(event, JSON.parse(data))
  })
}
