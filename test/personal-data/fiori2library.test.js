const cds = require('@sap/cds')

cds.env.requires['audit-log'] = {
  kind: 'audit-log-to-library',
  impl: '../../srv/log2library',
  credentials: { logToConsole: true },
  handle: ['READ', 'WRITE']
}

const _logger = require('../utils/logger')({ debug: true })
cds.log.Logger = _logger

const { POST, PATCH, GET, DELETE, data } = cds.test(__dirname)

describe('personal data audit logging in Fiori with kind audit-log-to-library', () => {
  let __log, _logs
  const _log = (...args) => {
    if (args.length !== 1 || !args[0].uuid) {
      // > not an audit log (most likely, anyway)
      return __log(...args)
    }

    // do not add log preps
    if (args[0].attributes && 'old' in args[0].attributes[0] && !args[0].success) return

    _logs.push(...args)
  }

  const CUSTOMER_ID = 'bcd4a37a-6319-4d52-bb48-02fd06b9ffe9'
  const DATA_SUBJECT = {
    type: 'Fiori_1.Customers',
    role: 'Customer',
    id: { ID: CUSTOMER_ID }
  }

  const ALICE = { username: 'alice', password: 'password' }

  beforeAll(() => {
    __log = global.console.log
    global.console.log = _log
  })

  afterAll(() => {
    global.console.log = __log
  })

  beforeEach(async () => {
    await data.reset()
    _logs = []
    _logger._resetLogs()
  })

  describe('data access logging for active draft enabled entities', () => {
    test('read with another data subject and sensitive data only in composition children', async () => {
      const { data: customer } = await GET(
        `/fiori-2/Customers(ID=${CUSTOMER_ID},IsActiveEntity=true)?$expand=addresses`,
        { auth: ALICE }
      )
      const addressID1 = customer.addresses[0].ID
      const addressID2 = customer.addresses[1].ID
      expect(_logs.length).toBe(2)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_2.CustomerPostalAddress',
          id: { ID: addressID1 }
        },
        data_subject: {
          type: 'Fiori_2.CustomerPostalAddress',
          role: 'Address',
          id: {
            ID: addressID1,
            street: 'moo',
            town: 'shu'
          }
        },
        attributes: [{ name: 'someOtherField' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_2.CustomerPostalAddress',
          id: { ID: addressID2 }
        },
        data_subject: {
          type: 'Fiori_2.CustomerPostalAddress',
          role: 'Address',
          id: {
            ID: addressID2,
            street: 'sue',
            town: 'lou'
          }
        },
        attributes: [{ name: 'someOtherField' }]
      })
    })

    test('read all Customers', async () => {
      const response = await GET('/fiori-1/Customers', { auth: ALICE })

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(1)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.Customers',
          id: { ID: CUSTOMER_ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'creditCardNo' }]
      })
    })

    test('read single Customer', async () => {
      const response = await GET(`/fiori-1/Customers(ID=${CUSTOMER_ID},IsActiveEntity=true)`, { auth: ALICE })

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(1)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.Customers',
          id: { ID: CUSTOMER_ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'creditCardNo' }]
      })
    })

    test('read Customer expanding addresses and comments - comp of many', async () => {
      const response = await GET(
        `/fiori-1/Customers(ID=${CUSTOMER_ID},IsActiveEntity=true)?$expand=addresses($expand=attachments),comments`,
        { auth: ALICE }
      )

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(5)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.Customers',
          id: { ID: CUSTOMER_ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'creditCardNo' }]
      })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.CustomerPostalAddress',
          id: { ID: '1ab71292-ef69-4571-8cfb-10b9d5d1459e' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'street' }]
      })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.AddressAttachment',
          id: { ID: '3cd71292-ef69-4571-8cfb-10b9d5d1437e' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'description' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.AddressAttachment',
          id: { ID: '595225db-6eeb-4b4f-9439-dbe5fcb4ce5a' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'description' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.CustomerPostalAddress',
          id: { ID: '285225db-6eeb-4b4f-9439-dbe5fcb4ce82' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'street' }]
      })
    })

    test('read Customer expanding deep nested comp of one', async () => {
      const response = await GET(
        `/fiori-1/Customers(ID=${CUSTOMER_ID},IsActiveEntity=true)?$expand=status($expand=change($expand=last))`,
        { auth: ALICE }
      )
      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(4)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.Customers',
          id: { ID: CUSTOMER_ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'creditCardNo' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.CustomerStatus',
          id: { ID: '23d4a37a-6319-4d52-bb48-02fd06b9ffa4' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'description' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.StatusChange',
          id: { ID: '59d4a37a-6319-4d52-bb48-02fd06b9fbc2', secondKey: 'some value' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'description' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.LastOne',
          id: { ID: '74d4a37a-6319-4d52-bb48-02fd06b9f3r4' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'lastOneField' }]
      })
    })

    test('read all CustomerStatus', async () => {
      const response = await GET('/fiori-1/CustomerStatus', { auth: ALICE })
      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(1)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.CustomerStatus',
          id: { ID: '23d4a37a-6319-4d52-bb48-02fd06b9ffa4' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'description' }]
      })
    })

    test('read all CustomerPostalAddress', async () => {
      const response = await GET('/fiori-1/CustomerPostalAddress', { auth: ALICE })

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(2)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.CustomerPostalAddress',
          id: { ID: '1ab71292-ef69-4571-8cfb-10b9d5d1459e' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'street' }]
      })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.CustomerPostalAddress',
          id: { ID: '285225db-6eeb-4b4f-9439-dbe5fcb4ce82' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'street' }]
      })
    })

    test('read all CustomerPostalAddress expanding Customer', async () => {
      const response = await GET('/fiori-1/CustomerPostalAddress?$expand=customer', { auth: ALICE })

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(3)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.Customers',
          id: { ID: CUSTOMER_ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'creditCardNo' }]
      })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.CustomerPostalAddress',
          id: { ID: '1ab71292-ef69-4571-8cfb-10b9d5d1459e' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'street' }]
      })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.CustomerPostalAddress',
          id: { ID: '285225db-6eeb-4b4f-9439-dbe5fcb4ce82' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'street' }]
      })
    })

    test('draft union', async () => {
      const response = await GET(
        '/fiori-1/Customers?$filter=(IsActiveEntity eq false or SiblingEntity/IsActiveEntity eq null)',
        { auth: ALICE }
      )

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(1)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.Customers',
          id: { ID: CUSTOMER_ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'creditCardNo' }]
      })
    })
  })

  describe('modification and read draft logging', () => {
    test('draft edit, patch and activate with another data subject and sensitive data only in composition children', async () => {
      const { data: customer } = await GET(
        `/fiori-2/Customers(ID=${CUSTOMER_ID},IsActiveEntity=true)?$expand=addresses`,
        { auth: ALICE }
      )
      const address_1 = customer.addresses[0]
      const address_2 = customer.addresses[1]

      // reset logs
      _logs = []

      // draftEdit transfers active data to draft tables -> read sensitive data -> logs
      await POST(`/fiori-2/Customers(ID=${CUSTOMER_ID},IsActiveEntity=true)/draftEdit`, {}, { auth: ALICE })
      expect(_logs.length).toBe(2)
      expect(_logs.length).toBe(2)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_2.CustomerPostalAddress',
          id: { ID: address_1.ID }
        },
        data_subject: {
          type: 'Fiori_2.CustomerPostalAddress',
          role: 'Address',
          id: {
            ID: address_1.ID,
            street: address_1.street,
            town: address_1.town
          }
        },
        attributes: [{ name: 'someOtherField' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_2.CustomerPostalAddress',
          id: { ID: address_2.ID }
        },
        data_subject: {
          type: 'Fiori_2.CustomerPostalAddress',
          role: 'Address',
          id: {
            ID: address_2.ID,
            street: address_2.street,
            town: address_2.town
          }
        },
        attributes: [{ name: 'someOtherField' }]
      })

      // reset logs
      _logs = []

      // draft data is never logged
      await GET(`/fiori-2/Customers(ID=${CUSTOMER_ID},IsActiveEntity=false)?$expand=addresses`, { auth: ALICE })
      expect(_logs.length).toBe(0)

      await PATCH(
        `/fiori-2/Customers(ID=${CUSTOMER_ID},IsActiveEntity=false)/addresses(ID=${address_1.ID},IsActiveEntity=false)`,
        {
          street: 'updated',
          town: 'updated town'
        },
        { auth: ALICE }
      )
      const response = await POST(
        `/fiori-2/Customers(ID=${CUSTOMER_ID},IsActiveEntity=false)/draftActivate`,
        {},
        { auth: ALICE }
      )

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(1)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_2.CustomerPostalAddress',
          id: { ID: address_1.ID }
        },
        data_subject: {
          type: 'Fiori_2.CustomerPostalAddress',
          role: 'Address',
          id: {
            ID: address_1.ID,
            street: 'updated',
            town: 'updated town'
          }
        },
        attributes: [
          { name: 'street', new: 'updated', old: 'moo' },
          { name: 'town', new: 'updated town', old: 'shu' }
        ]
      })
    })

    test('create, patch, read and activate', async () => {
      const customer = {
        emailAddress: 'bla@blub.com',
        firstName: 'bla',
        lastName: 'blub',
        creditCardNo: '98765',
        someOtherField: 'dummy'
      }

      let response = await POST('/fiori-1/Customers', {}, { auth: ALICE })

      expect(response).toMatchObject({ status: 201 })
      customer.ID = response.data.ID
      expect(_logs.length).toBe(0)

      response = await PATCH(`/fiori-1/Customers(ID=${customer.ID},IsActiveEntity=false)`, customer, { auth: ALICE })

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(0)

      response = await GET(`/fiori-1/Customers(ID=${customer.ID},IsActiveEntity=false)`, { auth: ALICE })

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(0)

      response = await POST(
        `/fiori-1/Customers(ID=${customer.ID},IsActiveEntity=false)/Fiori_1.draftActivate`,
        {},
        { auth: ALICE }
      )

      expect(_logs.length).toBe(2)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.Customers',
          id: { ID: customer.ID }
        },
        data_subject: {
          type: 'Fiori_1.Customers',
          role: 'Customer',
          id: { ID: customer.ID }
        },
        attributes: [
          { name: 'emailAddress', old: 'null', new: customer.emailAddress },
          { name: 'firstName', old: 'null', new: customer.firstName },
          { name: 'lastName', old: 'null', new: customer.lastName },
          { name: 'creditCardNo', old: '***', new: '***' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.Customers',
          id: { ID: customer.ID }
        },
        data_subject: {
          type: 'Fiori_1.Customers',
          role: 'Customer',
          id: { ID: customer.ID }
        },
        attributes: [{ name: 'creditCardNo' }]
      })
    })

    test('draft edit, read union, delete draft', async () => {
      let response = await POST(
        `/fiori-1/Customers(ID=${CUSTOMER_ID},IsActiveEntity=true)/Fiori_1.draftEdit`,
        { PreserveChanges: true },
        { auth: ALICE }
      )
      expect(response).toMatchObject({ status: 201 })
      expect(_logs.length).toBe(10)
      for (const l of _logs) expect(l).toMatchObject({ data_subject: { id: { ID: CUSTOMER_ID } } })

      // reset logs
      _logs = []

      // draft data is never logged. however, the read of the active data is logged.
      response = await GET(
        '/fiori-1/Customers?$filter=(IsActiveEntity eq false or SiblingEntity/IsActiveEntity eq null)',
        { auth: ALICE }
      )
      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(1)

      // reset logs
      _logs = []

      response = await DELETE(`/fiori-1/Customers(ID=${CUSTOMER_ID},IsActiveEntity=false)`, { auth: ALICE })
      expect(response).toMatchObject({ status: 204 })
      expect(_logs.length).toBe(0)
    })

    test('draft edit, patch and activate', async () => {
      let response

      // draftEdit transfers active data to draft tables -> read sensitive data -> logs
      response = await POST(
        `/fiori-1/Customers(ID=bcd4a37a-6319-4d52-bb48-02fd06b9ffe9,IsActiveEntity=true)/Fiori_1.draftEdit`,
        { PreserveChanges: true },
        { auth: ALICE }
      )
      expect(response).toMatchObject({ status: 201 })
      expect(_logs.length).toBe(10)

      // reset logs
      _logs = []

      const customer = {
        ID: response.data.ID,
        emailAddress: 'bla@blub.com',
        firstName: 'bla',
        lastName: 'blub',
        creditCardNo: '98765',
        someOtherField: 'dummy'
      }

      response = await PATCH(`/fiori-1/Customers(ID=${customer.ID},IsActiveEntity=false)`, customer, { auth: ALICE })
      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(0)

      // reset logs
      _logs = []

      response = await POST(
        `/fiori-1/Customers(ID=${customer.ID},IsActiveEntity=false)/Fiori_1.draftActivate`,
        {},
        { auth: ALICE }
      )
      expect(_logs.length).toBe(2)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.Customers',
          id: { ID: customer.ID }
        },
        data_subject: {
          type: 'Fiori_1.Customers',
          role: 'Customer',
          id: { ID: customer.ID }
        },
        attributes: [
          { name: 'emailAddress', old: 'foo@bar.com', new: customer.emailAddress },
          { name: 'firstName', old: 'foo', new: customer.firstName },
          { name: 'lastName', old: 'bar', new: customer.lastName },
          { name: 'creditCardNo', old: '***', new: '***' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.Customers',
          id: { ID: customer.ID }
        },
        data_subject: {
          type: 'Fiori_1.Customers',
          role: 'Customer',
          id: { ID: customer.ID }
        },
        attributes: [{ name: 'creditCardNo' }]
      })
    })

    test('create, patch, and activate - deep', async () => {
      let response = await POST('/fiori-1/Customers', {}, { auth: ALICE })

      expect(response).toMatchObject({ status: 201 })
      expect(_logs.length).toBe(0)

      const customer = {
        ID: response.data.ID,
        emailAddress: 'bla@blub.com',
        firstName: 'bla',
        lastName: 'blub',
        creditCardNo: '98765',
        someOtherField: 'dummy'
      }
      response = await PATCH(`/fiori-1/Customers(ID=${customer.ID},IsActiveEntity=false)`, customer, { auth: ALICE })

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(0)

      response = await POST(`/fiori-1/Customers(ID=${customer.ID},IsActiveEntity=false)/addresses`, {}, { auth: ALICE })

      expect(response).toMatchObject({ status: 201 })
      expect(_logs.length).toBe(0)

      const address = {
        ID: response.data.ID,
        street: 'A1',
        town: 'Monnem',
        someOtherField: 'Beschde'
      }

      response = await PATCH(
        `/fiori-1/Customers(ID=${customer.ID},IsActiveEntity=false)/addresses(ID=${address.ID},IsActiveEntity=false)`,
        address,
        { auth: ALICE }
      )

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(0)

      response = await POST(
        `/fiori-1/Customers(ID=${customer.ID},IsActiveEntity=false)/Fiori_1.draftActivate`,
        {},
        { auth: ALICE }
      )

      const data_subject = {
        type: 'Fiori_1.Customers',
        role: 'Customer',
        id: { ID: customer.ID }
      }

      expect(_logs.length).toBe(3)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.Customers',
          id: { ID: customer.ID }
        },
        data_subject,
        attributes: [
          { name: 'emailAddress', old: 'null', new: customer.emailAddress },
          { name: 'firstName', old: 'null', new: customer.firstName },
          { name: 'lastName', old: 'null', new: customer.lastName },
          { name: 'creditCardNo', old: '***', new: '***' }
        ]
      })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.Customers',
          id: { ID: customer.ID }
        },
        data_subject: {
          type: 'Fiori_1.Customers',
          role: 'Customer',
          id: { ID: customer.ID }
        },
        attributes: [{ name: 'creditCardNo' }]
      })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.CustomerPostalAddress',
          id: { ID: address.ID }
        },
        data_subject,
        attributes: [
          { name: 'street', old: '***', new: '***' },
          { name: 'town', old: 'null', new: address.town }
        ]
      })
    })

    test('delete active Customer - deep', async () => {
      let response = await GET(
        `/fiori-1/Customers(ID=${CUSTOMER_ID},IsActiveEntity=true)?$expand=addresses($expand=attachments),status($expand=change($expand=last)),comments`,
        { auth: ALICE }
      )

      const oldAddresses = response.data.addresses
      const oldAttachments = response.data.addresses[0].attachments
      const oldStatus = response.data.status
      const oldChange = response.data.status.change
      const oldLast = response.data.status.change.last

      // reset logs
      _logs = []
      _logger._resetLogs()

      response = await DELETE(`/fiori-1/Customers(ID=${CUSTOMER_ID},IsActiveEntity=true)`, { auth: ALICE })

      expect(response).toMatchObject({ status: 204 })
      expect(_logs.length).toBe(10)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.Customers',
          id: { ID: CUSTOMER_ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'emailAddress', old: 'foo@bar.com', new: 'null' },
          { name: 'firstName', old: 'foo', new: 'null' },
          { name: 'lastName', old: 'bar', new: 'null' },
          { name: 'creditCardNo', old: '***', new: '***' }
        ]
      })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.CustomerPostalAddress',
          id: { ID: oldAddresses[0].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'street', old: '***', new: '***' },
          { name: 'town', old: oldAddresses[0].town, new: 'null' }
        ]
      })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.AddressAttachment',
          id: { ID: oldAttachments[0].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'description', old: '***', new: '***' },
          { name: 'todo', old: oldAttachments[0].todo, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.AddressAttachment',
          id: { ID: oldAttachments[1].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'description', old: '***', new: '***' },
          { name: 'todo', old: oldAttachments[1].todo, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.CustomerPostalAddress',
          id: { ID: oldAddresses[1].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'street', old: '***', new: '***' },
          { name: 'town', old: oldAddresses[1].town, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.CustomerStatus',
          id: { ID: oldStatus.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'description', old: '***', new: '***' },
          { name: 'todo', old: 'send reminder', new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.StatusChange',
          id: { ID: oldChange.ID, secondKey: oldChange.secondKey }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'description', old: '***', new: '***' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.LastOne',
          id: { ID: oldLast.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'lastOneField', old: '***', new: '***' }]
      })

      const selects = _logger._logs.debug.filter(
        l => typeof l === 'string' && l.match(/^SELECT/) && l.match(/SELECT [Customers.]*ID FROM Fiori_1_Customers/)
      )
      expect(selects.length).toBe(1)
    })

    test('with atomicity group', async () => {
      let response = await GET(
        `/fiori-1/Customers(ID=${CUSTOMER_ID},IsActiveEntity=true)?$expand=addresses($expand=attachments($expand=notes)),status($expand=change($expand=last),notes)`,
        { auth: ALICE }
      )
      const oldAddresses = response.data.addresses
      const oldAttachments = response.data.addresses[0].attachments
      const oldAttachmentNotes = response.data.addresses[0].attachments[0].notes

      // reset logs
      _logs = []

      response = await POST(
        `/fiori-1/Customers(ID=bcd4a37a-6319-4d52-bb48-02fd06b9ffe9,IsActiveEntity=true)/Fiori_1.draftEdit`,
        { PreserveChanges: true },
        { auth: ALICE }
      )

      expect(response).toMatchObject({ status: 201 })
      expect(_logs.length).toBe(10)

      // reset logs
      _logs = []

      response = await PATCH(
        `/fiori-1/Customers(ID=bcd4a37a-6319-4d52-bb48-02fd06b9ffe9,IsActiveEntity=false)`,
        { status: null },
        { auth: ALICE }
      )

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(0)

      // reset logs
      _logs = []

      const body = {
        requests: [
          {
            method: 'POST',
            url: `/Customers(ID=bcd4a37a-6319-4d52-bb48-02fd06b9ffe9,IsActiveEntity=false)/Fiori_1.draftActivate`,
            headers: { 'content-type': 'application/json', 'odata-version': '4.0' },
            id: 'r1',
            atomicityGroup: 'g1'
          },
          {
            method: 'DELETE',
            url: `/Customers(ID=bcd4a37a-6319-4d52-bb48-02fd06b9ffe9,IsActiveEntity=true)`,
            headers: { 'content-type': 'application/json', 'odata-version': '4.0' },
            id: 'r2',
            atomicityGroup: 'g1',
            dependsOn: ['r1']
          }
        ]
      }
      response = await POST('/fiori-1/$batch', body, { auth: ALICE })
      expect(response).toMatchObject({ status: 200 })
      expect(response.data.responses.every(r => r.status >= 200 && r.status < 300)).toBeTruthy()
      expect(_logs.length).toBe(11)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.CustomerPostalAddress',
          id: { ID: oldAddresses[0].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'street', old: '***', new: '***' },
          { name: 'town', old: oldAddresses[0].town, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.AddressAttachment',
          id: { ID: oldAttachments[0].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'description', old: '***', new: '***' },
          { name: 'todo', old: oldAttachments[0].todo, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.AddressAttachment',
          id: { ID: oldAttachments[1].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'description', old: '***', new: '***' },
          { name: 'todo', old: oldAttachments[1].todo, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.CustomerPostalAddress',
          id: { ID: oldAddresses[1].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'street', old: '***', new: '***' },
          { name: 'town', old: oldAddresses[1].town, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'Fiori_1.Notes',
          id: { ID: oldAttachmentNotes[0].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'note', old: '***', new: '***' }]
      })
    })
  })
})
