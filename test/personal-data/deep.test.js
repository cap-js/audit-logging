const cds = require('@sap/cds')

cds.test('serve', 'srv/deep-service.cds').in(__dirname)

describe('personal data audit logging for deep operations', () => {
  test('promotions', async () => {
    const { DeepService } = cds.services
    debugger
  })
})
