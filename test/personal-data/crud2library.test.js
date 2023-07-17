const cds = require('@sap/cds')

cds.env.requires['audit-log'] = {
  kind: 'audit-log-to-library',
  impl: '../../srv/log2library',
  credentials: { logToConsole: true },
  _credentials: {
    "url": "https://api.auditlog.cf.sap.hana.ondemand.com:8081",
    "password": "75bed768240bdd3f",
    "user": "aad2fd9acbd42206",
    "vendor": "SAP"
  },
  handle: ['READ', 'WRITE']
}

const _logger = require('../utils/logger')({ debug: true })
cds.log.Logger = _logger

const { POST, PATCH, GET, DELETE, data } = cds.test(__dirname)

describe('personal data audit logging in CRUD with kind audit-log-to-library', () => {
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
    type: 'CRUD_1.Customers',
    role: 'Customer',
    id: { ID: CUSTOMER_ID }
  }

  const ALICE = { username: 'alice', password: 'password' }

  beforeAll(async () => {
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

  describe('data access logging', () => {
    test('read with another data subject and sensitive data only in composition children', async () => {
      const { data: customer } = await GET(`/crud-2/Customers(${CUSTOMER_ID})?$expand=addresses`, { auth: ALICE })
      const addressID1 = customer.addresses[0].ID
      const addressID2 = customer.addresses[1].ID
      expect(_logs.length).toBe(2)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_2.CustomerPostalAddress',
          id: { ID: addressID1 }
        },
        data_subject: {
          type: 'CRUD_2.CustomerPostalAddress',
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
          type: 'CRUD_2.CustomerPostalAddress',
          id: { ID: addressID2 }
        },
        data_subject: {
          type: 'CRUD_2.CustomerPostalAddress',
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

    test('wrongly modeled entity must not be logged', async () => {
      const response = await GET(`/crud-2/Customers(${CUSTOMER_ID})?$expand=status,addresses`, { auth: ALICE })

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(2)
      expect(_logs).not.toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_2.CustomerStatus'
        }
      })
    })

    test('read all Customers', async () => {
      const response = await GET('/crud-1/Customers', { auth: ALICE })

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(1)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Customers',
          id: { ID: CUSTOMER_ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'creditCardNo' }]
      })
    })

    test('read single Customer', async () => {
      const response = await GET(`/crud-1/Customers(${CUSTOMER_ID})`, { auth: ALICE })

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(1)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Customers',
          id: { ID: CUSTOMER_ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'creditCardNo' }]
      })
    })

    test('no log if sensitive data not selected', async () => {
      const response = await GET(`/crud-1/Customers(${CUSTOMER_ID})?$select=ID`, { auth: ALICE })

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(0)
    })

    test('read non-existing Customer should not crash the app', async () => {
      try {
        await GET('/crud-1/Customers(ffffffff-6319-4d52-bb48-02fd06b9ffe9)', { auth: ALICE })
      } catch (error) {
        expect(error.message).toMatch(/404/)
      }
    })

    test('read Customer expanding addresses and comments - comp of many', async () => {
      const response = await GET(`/crud-1/Customers(${CUSTOMER_ID})?$expand=addresses($expand=attachments),comments`, {
        auth: ALICE
      })

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(5)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Customers',
          id: { ID: CUSTOMER_ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'creditCardNo' }]
      })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerPostalAddress',
          id: { ID: '1ab71292-ef69-4571-8cfb-10b9d5d1459e' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'street' }]
      })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.AddressAttachment',
          id: { ID: '3cd71292-ef69-4571-8cfb-10b9d5d1437e' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'description' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.AddressAttachment',
          id: { ID: '595225db-6eeb-4b4f-9439-dbe5fcb4ce5a' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'description' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerPostalAddress',
          id: { ID: '285225db-6eeb-4b4f-9439-dbe5fcb4ce82' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'street' }]
      })
    })

    test('read Customer expanding deep nested comp of one', async () => {
      const response = await GET(`/crud-1/Customers(ID=${CUSTOMER_ID})?$expand=status($expand=change($expand=last))`, {
        auth: ALICE
      })
      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(4)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Customers',
          id: { ID: CUSTOMER_ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'creditCardNo' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerStatus',
          id: { ID: '23d4a37a-6319-4d52-bb48-02fd06b9ffa4' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'description' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.StatusChange',
          id: { ID: '59d4a37a-6319-4d52-bb48-02fd06b9fbc2', secondKey: 'some value' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'description' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.LastOne',
          id: { ID: '74d4a37a-6319-4d52-bb48-02fd06b9f3r4' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'lastOneField' }]
      })
    })

    test('read all CustomerStatus', async () => {
      const response = await GET('/crud-1/CustomerStatus', { auth: ALICE })
      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(1)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerStatus',
          id: { ID: '23d4a37a-6319-4d52-bb48-02fd06b9ffa4' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'description' }]
      })
    })

    test('read all CustomerPostalAddress', async () => {
      const response = await GET('/crud-1/CustomerPostalAddress', { auth: ALICE })

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(2)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerPostalAddress',
          id: { ID: '1ab71292-ef69-4571-8cfb-10b9d5d1459e' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'street' }]
      })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerPostalAddress',
          id: { ID: '285225db-6eeb-4b4f-9439-dbe5fcb4ce82' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'street' }]
      })
    })

    test('read all CustomerPostalAddress expanding Customer', async () => {
      const response = await GET('/crud-1/CustomerPostalAddress?$expand=customer', { auth: ALICE })

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(3)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Customers',
          id: { ID: CUSTOMER_ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'creditCardNo' }]
      })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerPostalAddress',
          id: { ID: '1ab71292-ef69-4571-8cfb-10b9d5d1459e' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'street' }]
      })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerPostalAddress',
          id: { ID: '285225db-6eeb-4b4f-9439-dbe5fcb4ce82' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'street' }]
      })
    })
    test('read all Pages with integer keys', async () => {
      const response = await GET('/crud-1/Pages', { auth: ALICE })

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(1)
      // Note: All values must be strings (as required by audit-log service APIs)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Pages',
          id: { ID: '1' }
        },
        data_subject: {
          id: {
            ID: '1'
          },
          role: 'Page',
          type: 'CRUD_1.Pages'
        }
      })
    })
  })

  describe('modification logging', () => {
    test('deep update customer with another data subject and sensitive data only in composition children', async () => {
      const response = await PATCH(
        `/crud-2/Customers(${CUSTOMER_ID})`,
        {
          addresses: [
            {
              ID: '1ab71292-ef69-4571-8cfb-10b9d5d1459e',
              customer_ID: CUSTOMER_ID,
              street: 'updated',
              town: 'updated town',
              someOtherField: 'dummy'
            },
            {
              // note: no change in data
              ID: '285225db-6eeb-4b4f-9439-dbe5fcb4ce82',
              customer_ID: CUSTOMER_ID,
              street: 'sue',
              town: 'lou',
              someOtherField: 'dummy'
            }
          ]
        },
        { auth: ALICE }
      )
      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(3)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_2.CustomerPostalAddress',
          id: { ID: '1ab71292-ef69-4571-8cfb-10b9d5d1459e' }
        },
        data_subject: {
          type: 'CRUD_2.CustomerPostalAddress',
          role: 'Address',
          id: {
            ID: '1ab71292-ef69-4571-8cfb-10b9d5d1459e',
            street: 'updated',
            town: 'updated town'
          }
        },
        attributes: [
          { name: 'street', new: 'updated', old: 'moo' },
          { name: 'town', new: 'updated town', old: 'shu' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_2.CustomerPostalAddress',
          id: { ID: '1ab71292-ef69-4571-8cfb-10b9d5d1459e' }
        },
        data_subject: {
          type: 'CRUD_2.CustomerPostalAddress',
          role: 'Address',
          id: {
            ID: '1ab71292-ef69-4571-8cfb-10b9d5d1459e',
            street: 'updated',
            town: 'updated town'
          }
        },
        attributes: [{ name: 'someOtherField' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_2.CustomerPostalAddress',
          id: { ID: '285225db-6eeb-4b4f-9439-dbe5fcb4ce82' }
        },
        data_subject: {
          type: 'CRUD_2.CustomerPostalAddress',
          role: 'Address',
          id: {
            ID: '285225db-6eeb-4b4f-9439-dbe5fcb4ce82',
            street: 'sue',
            town: 'lou'
          }
        },
        attributes: [{ name: 'someOtherField' }]
      })
    })

    test('create Customer - flat', async () => {
      const customer = {
        emailAddress: 'bla@blub.com',
        firstName: 'bla',
        lastName: 'blub',
        creditCardNo: '98765',
        someOtherField: 'dummy'
      }

      const response = await POST('/crud-1/Customers', customer, { auth: ALICE })

      expect(response).toMatchObject({ status: 201 })
      customer.ID = response.data.ID
      expect(_logs.length).toBe(2)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Customers',
          id: { ID: customer.ID }
        },
        data_subject: {
          type: 'CRUD_1.Customers',
          role: 'Customer',
          id: { ID: customer.ID }
        },
        attributes: [
          { name: 'emailAddress', old: 'null', new: customer.emailAddress },
          { name: 'firstName', old: 'null', new: customer.firstName },
          { name: 'lastName', old: 'null', new: customer.lastName },
          { name: 'creditCardNo', old: 'null', new: customer.creditCardNo }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Customers',
          id: { ID: customer.ID }
        },
        data_subject: {
          type: 'CRUD_1.Customers',
          role: 'Customer',
          id: { ID: customer.ID }
        },
        attributes: [{ name: 'creditCardNo' }]
      })
    })

    test('create Customer - deep', async () => {
      const customer = {
        emailAddress: 'bla@blub.com',
        firstName: 'bla',
        lastName: 'blub',
        creditCardNo: '98765',
        someOtherField: 'dummy',
        addresses: [
          {
            street: 'A1',
            town: 'Monnem',
            someOtherField: 'Beschde'
          },
          {
            street: 'B2',
            town: 'Monnem',
            someOtherField: 'Ajo',
            attachments: [{ description: 'new', todo: 'nothing', notAnnotated: 'not logged' }]
          }
        ],
        comments: [{ text: 'foo' }, { text: 'bar' }],
        status: {
          ID: '23d4a37a-6319-4d52-bb48-02fd06b9ffa5',
          description: 'new',
          todo: 'activate'
        }
      }

      const response = await POST('/crud-1/Customers', customer, { auth: ALICE })

      expect(response).toMatchObject({ status: 201 })

      customer.ID = response.data.ID
      const addresses = response.data.addresses
      const attachments = response.data.addresses[1].attachments
      const data_subject = {
        type: 'CRUD_1.Customers',
        role: 'Customer',
        id: { ID: customer.ID }
      }

      expect(_logs.length).toBe(10)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Customers',
          id: { ID: customer.ID }
        },
        data_subject,
        attributes: [
          { name: 'emailAddress', old: 'null', new: customer.emailAddress },
          { name: 'firstName', old: 'null', new: customer.firstName },
          { name: 'lastName', old: 'null', new: customer.lastName },
          { name: 'creditCardNo', old: 'null', new: customer.creditCardNo }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerPostalAddress',
          id: { ID: addresses[0].ID }
        },
        data_subject,
        attributes: [
          { name: 'street', old: 'null', new: addresses[0].street },
          { name: 'town', old: 'null', new: addresses[0].town }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerPostalAddress',
          id: { ID: addresses[1].ID }
        },
        data_subject,
        attributes: [
          { name: 'street', old: 'null', new: addresses[1].street },
          { name: 'town', old: 'null', new: addresses[1].town }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.AddressAttachment',
          id: { ID: attachments[0].ID }
        },
        data_subject,
        attributes: [
          { name: 'description', old: 'null', new: attachments[0].description },
          { name: 'todo', old: 'null', new: attachments[0].todo }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerStatus',
          id: { ID: '23d4a37a-6319-4d52-bb48-02fd06b9ffa5' }
        },
        data_subject,
        attributes: [
          { name: 'description', old: 'null', new: 'new' },
          { name: 'todo', old: 'null', new: 'activate' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Customers',
          id: { ID: customer.ID }
        },
        data_subject,
        attributes: [{ name: 'creditCardNo' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerPostalAddress',
          id: { ID: addresses[0].ID }
        },
        data_subject,
        attributes: [{ name: 'street' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerPostalAddress',
          id: { ID: addresses[1].ID }
        },
        data_subject,
        attributes: [{ name: 'street' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.AddressAttachment',
          id: { ID: attachments[0].ID }
        },
        data_subject,
        attributes: [{ name: 'description' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerStatus',
          id: { ID: '23d4a37a-6319-4d52-bb48-02fd06b9ffa5' }
        },
        data_subject,
        attributes: [{ name: 'description' }]
      })
    })

    test('create Pages with integers', async () => {
      const page = {
        ID: 123,
        sensitive: 1337,
        personal: 4711
      }

      const response = await POST('/crud-1/Pages', page, { auth: ALICE })

      expect(response).toMatchObject({ status: 201 })
      expect(_logs.length).toBe(2)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Pages',
          id: { ID: '123' }
        },
        data_subject: {
          type: 'CRUD_1.Pages',
          role: 'Page',
          id: { ID: '123' }
        },
        attributes: [
          { name: 'personal', old: 'null', new: '4711' },
          { name: 'sensitive', old: 'null', new: '1337' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Pages',
          id: { ID: '123' }
        },
        data_subject: {
          id: {
            ID: '123'
          },
          role: 'Page',
          type: 'CRUD_1.Pages'
        },
        attributes: [{ name: 'sensitive' }]
      })
    })

    test('update Customer - flat', async () => {
      const customer = {
        emailAddress: 'bla@blub.com',
        creditCardNo: '98765',
        someOtherField: 'also just a dummy'
      }

      const response = await PATCH(`/crud-1/Customers(${CUSTOMER_ID})`, customer, { auth: ALICE })

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(2)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Customers',
          id: { ID: CUSTOMER_ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'emailAddress', old: 'foo@bar.com', new: customer.emailAddress },
          { name: 'creditCardNo', old: '12345', new: customer.creditCardNo }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Customers',
          id: { ID: 'bcd4a37a-6319-4d52-bb48-02fd06b9ffe9' }
        },
        data_subject: {
          type: 'CRUD_1.Customers',
          role: 'Customer',
          id: { ID: 'bcd4a37a-6319-4d52-bb48-02fd06b9ffe9' }
        },
        attributes: [{ name: 'creditCardNo' }]
      })
    })

    test('update Pages with integers', async () => {
      const page = {
        sensitive: 999,
        personal: 888
      }

      const response = await PATCH('/crud-1/Pages(1)', page, { auth: ALICE })

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(2)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Pages',
          id: { ID: '1' }
        },
        data_subject: {
          id: {
            ID: '1'
          },
          role: 'Page',
          type: 'CRUD_1.Pages'
        },
        attributes: [
          { name: 'personal', old: '222', new: '888' },
          { name: 'sensitive', old: '111', new: '999' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Pages',
          id: { ID: '1' }
        },
        data_subject: {
          id: {
            ID: '1'
          },
          role: 'Page',
          type: 'CRUD_1.Pages'
        },
        attributes: [{ name: 'sensitive' }]
      })
    })

    test('update non-existing Customer - flat', async () => {
      const newCustomer = {
        emailAddress: 'minim@ipsum.com',
        creditCardNo: '96765',
        someOtherField: 'minim ipsum eu id ea'
      }

      const newUUID = '542ce505-73ae-4860-a7f5-00fbccf1dae9'
      const response = await PATCH(`/crud-1/Customers(${newUUID})`, newCustomer, { auth: ALICE })

      expect(response).toMatchObject({ status: 201 })
      expect(_logs.length).toBe(2)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Customers',
          id: { ID: newUUID }
        },
        data_subject: {
          id: { ID: newUUID },
          role: 'Customer',
          type: 'CRUD_1.Customers'
        },
        attributes: [
          { name: 'emailAddress', old: 'null', new: newCustomer.emailAddress },
          { name: 'creditCardNo', old: 'null', new: newCustomer.creditCardNo }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Customers',
          id: { ID: newUUID }
        },
        data_subject: {
          type: 'CRUD_1.Customers',
          role: 'Customer',
          id: { ID: newUUID }
        },
        attributes: [{ name: 'creditCardNo' }]
      })
    })

    test('update non-existing Pages with integers', async () => {
      const page = {
        sensitive: 999,
        personal: 888
      }

      const response = await PATCH('/crud-1/Pages(123)', page, { auth: ALICE })

      expect(response).toMatchObject({ status: 201 })
      expect(_logs.length).toBe(2)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Pages',
          id: { ID: '123' }
        },
        data_subject: {
          id: {
            ID: '123'
          },
          role: 'Page',
          type: 'CRUD_1.Pages'
        },
        attributes: [
          { name: 'personal', old: 'null', new: '888' },
          { name: 'sensitive', old: 'null', new: '999' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Pages',
          id: { ID: '123' }
        },
        data_subject: {
          id: {
            ID: '123'
          },
          role: 'Page',
          type: 'CRUD_1.Pages'
        },
        attributes: [{ name: 'sensitive' }]
      })
    })

    test('update Customer - deep', async () => {
      let response

      response = await GET(`/crud-1/Customers(${CUSTOMER_ID})?$expand=addresses,status`, { auth: ALICE })

      const oldAddresses = response.data.addresses

      // reset logs
      _logs = []

      const customer = {
        addresses: [
          {
            street: 'A1',
            town: 'Monnem',
            someOtherField: 'Beschde'
          },
          {
            street: 'B2',
            town: 'Monnem',
            someOtherField: 'Ajo'
          }
        ],
        status: {
          ID: '23d4a37a-6319-4d52-bb48-02fd06b9ffa4',
          description: 'inactive',
          todo: 'delete'
        }
      }

      response = await PATCH(`/crud-1/Customers(${CUSTOMER_ID})`, customer, { auth: ALICE })

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(12)

      const newAddresses = response.data.addresses
      const newStatus = response.data.status

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerPostalAddress',
          id: { ID: oldAddresses[0].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'street', old: oldAddresses[0].street, new: 'null' },
          { name: 'town', old: oldAddresses[0].town, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerPostalAddress',
          id: { ID: oldAddresses[1].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'street', old: oldAddresses[1].street, new: 'null' },
          { name: 'town', old: oldAddresses[1].town, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerPostalAddress',
          id: { ID: newAddresses[0].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'street', old: 'null', new: newAddresses[0].street },
          { name: 'town', old: 'null', new: newAddresses[0].town }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerPostalAddress',
          id: { ID: newAddresses[1].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'street', old: 'null', new: newAddresses[1].street },
          { name: 'town', old: 'null', new: newAddresses[1].town }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerStatus',
          id: { ID: newStatus.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'description', old: 'active', new: 'inactive' },
          { name: 'todo', old: 'send reminder', new: 'delete' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Customers',
          id: { ID: 'bcd4a37a-6319-4d52-bb48-02fd06b9ffe9' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'creditCardNo' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerPostalAddress',
          id: { ID: newAddresses[0].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'street' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerPostalAddress',
          id: { ID: newAddresses[1].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'street' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerStatus',
          id: { ID: newStatus.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'description' }]
      })
    })

    test('update Customer - deep with reusing notes', async () => {
      let response

      response = await GET(
        `/crud-1/Customers(${CUSTOMER_ID})?$expand=addresses($expand=attachments($expand=notes)),status($expand=notes)`,
        { auth: ALICE }
      )

      const oldAddresses = response.data.addresses
      const oldAttachments = response.data.addresses[0].attachments
      const oldAttachmentNote = response.data.addresses[0].attachments[0].notes[0]
      const oldStatus = response.data.status
      const oldStatusNote = response.data.status.notes[0]

      const customer = {
        addresses: [
          {
            ID: '1ab71292-ef69-4571-8cfb-10b9d5d1459e',
            someOtherField: 'no tdummy',
            street: 'mu',
            attachments: [
              {
                ID: '3cd71292-ef69-4571-8cfb-10b9d5d1437e',
                description: 'mu',
                notAnnotated: 'no tdummy',
                notes: [
                  {
                    note: 'the end'
                  }
                ]
              }
            ]
          },
          {
            street: 'B2',
            town: 'Monnem',
            someOtherField: 'Ajo'
          }
        ],
        status: {
          ID: '23d4a37a-6319-4d52-bb48-02fd06b9ffa4',
          description: 'inactive',
          todo: 'delete',
          notes: [
            {
              ID: oldStatusNote.ID,
              note: 'status note'
            }
          ]
        }
      }

      // reset logs
      _logs = []

      response = await PATCH(`/crud-1/Customers(${CUSTOMER_ID})`, customer, { auth: ALICE })

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(16)

      const newAddresses = response.data.addresses
      const newStatus = response.data.status
      const newAttachments = response.data.addresses[0].attachments
      const newAttachmentNote = response.data.addresses[0].attachments[0].notes[0]
      const newStatusNote = response.data.status.notes[0]

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Notes',
          id: { ID: oldAttachmentNote.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'note', old: oldAttachmentNote.note, new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Notes',
          id: { ID: oldStatusNote.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'note', old: oldStatusNote.note, new: newStatusNote.note }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.AddressAttachment',
          id: { ID: oldAttachments[1].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'description', old: oldAttachments[1].description, new: 'null' },
          { name: 'todo', old: oldAttachments[1].todo, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerPostalAddress',
          id: { ID: oldAddresses[1].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'street', old: oldAddresses[1].street, new: 'null' },
          { name: 'town', old: oldAddresses[1].town, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerPostalAddress',
          id: { ID: newAddresses[0].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'street', old: oldAddresses[0].street, new: newAddresses[0].street }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.AddressAttachment',
          id: { ID: oldAttachments[0].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'description', old: oldAttachments[0].description, new: newAttachments[0].description }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Notes',
          id: { ID: newAttachmentNote.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'note', old: 'null', new: newAttachmentNote.note }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerPostalAddress',
          id: { ID: newAddresses[1].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'street', old: 'null', new: newAddresses[1].street },
          { name: 'town', old: 'null', new: newAddresses[1].town }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerStatus',
          id: { ID: newStatus.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'description', old: oldStatus.description, new: newStatus.description },
          { name: 'todo', old: oldStatus.todo, new: newStatus.todo }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.AddressAttachment',
          id: { ID: newAttachments[0].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'description' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Customers',
          id: { ID: 'bcd4a37a-6319-4d52-bb48-02fd06b9ffe9' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'creditCardNo' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerPostalAddress',
          id: { ID: newAddresses[0].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'street' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerPostalAddress',
          id: { ID: newAddresses[1].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'street' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerStatus',
          id: { ID: newStatus.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'description' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Notes',
          id: { ID: newStatusNote.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'note' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Notes',
          id: { ID: newAttachmentNote.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'note' }]
      })
    })

    test('delete Customer - flat', async () => {
      let response

      response = await GET(
        `/crud-1/Customers(${CUSTOMER_ID})?$expand=addresses($expand=attachments($expand=notes)),status($expand=change($expand=last),notes),comments`,
        { auth: ALICE }
      )

      const oldAddresses = response.data.addresses
      const oldAttachments = response.data.addresses[0].attachments
      const oldStatus = response.data.status
      const oldChange = response.data.status.change
      const oldLast = response.data.status.change.last
      const oldStatusNote = oldStatus.notes[0]
      const oldAttachmentNote = oldAttachments[0].notes[0]

      // reset logs
      _logs = []

      // delete children
      response = await PATCH(
        `/crud-1/Customers(${CUSTOMER_ID})`,
        { addresses: [], status: null, comments: [] },
        { auth: ALICE }
      )
      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(10)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerPostalAddress',
          id: { ID: oldAddresses[0].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'street', old: oldAddresses[0].street, new: 'null' },
          { name: 'town', old: oldAddresses[0].town, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.AddressAttachment',
          id: { ID: oldAttachments[0].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'description', old: oldAttachments[0].description, new: 'null' },
          { name: 'todo', old: oldAttachments[0].todo, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.AddressAttachment',
          id: { ID: oldAttachments[1].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'description', old: oldAttachments[1].description, new: 'null' },
          { name: 'todo', old: oldAttachments[1].todo, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerPostalAddress',
          id: { ID: oldAddresses[1].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'street', old: oldAddresses[1].street, new: 'null' },
          { name: 'town', old: oldAddresses[1].town, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerStatus',
          id: { ID: oldStatus.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'description', old: 'active', new: 'null' },
          { name: 'todo', old: 'send reminder', new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.StatusChange',
          id: { ID: oldChange.ID, secondKey: oldChange.secondKey }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'description', old: 'new change', new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.LastOne',
          id: { ID: oldLast.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'lastOneField', old: 'some last value', new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Notes',
          id: { ID: oldStatusNote.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'note', old: oldStatusNote.note, new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Notes',
          id: { ID: oldAttachmentNote.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'note', old: oldAttachmentNote.note, new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Customers',
          id: { ID: 'bcd4a37a-6319-4d52-bb48-02fd06b9ffe9' }
        },
        data_subject: {
          type: 'CRUD_1.Customers',
          role: 'Customer',
          id: { ID: 'bcd4a37a-6319-4d52-bb48-02fd06b9ffe9' }
        },
        attributes: [{ name: 'creditCardNo' }]
      })

      // reset logs
      _logs = []

      response = await DELETE(`/crud-1/Customers(${CUSTOMER_ID})`, { auth: ALICE })

      expect(response).toMatchObject({ status: 204 })
      expect(_logs.length).toBe(1)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Customers',
          id: { ID: CUSTOMER_ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'emailAddress', old: 'foo@bar.com', new: 'null' },
          { name: 'firstName', old: 'foo', new: 'null' },
          { name: 'lastName', old: 'bar', new: 'null' },
          { name: 'creditCardNo', old: '12345', new: 'null' }
        ]
      })
    })

    test('delete Pages with integers - flat', async () => {
      await DELETE('/crud-1/Pages(1)', { auth: ALICE })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Pages',
          id: { ID: '1' }
        },
        data_subject: {
          id: {
            ID: '1'
          },
          role: 'Page',
          type: 'CRUD_1.Pages'
        },
        attributes: [
          { name: 'personal', old: '222', new: 'null' },
          { name: 'sensitive', old: '111', new: 'null' }
        ]
      })
    })

    test('delete Customer - deep', async () => {
      let response

      response = await GET(
        `/crud-1/Customers(${CUSTOMER_ID})?$expand=addresses($expand=attachments($expand=notes)),status($expand=change($expand=last),notes)`,
        { auth: ALICE }
      )

      const oldAddresses = response.data.addresses
      const oldAttachments = response.data.addresses[0].attachments
      const oldStatus = response.data.status
      const oldChange = response.data.status.change
      const oldLast = response.data.status.change.last
      const oldStatusNote = oldStatus.notes[0]
      const oldAttachmentNote = oldAttachments[0].notes[0]

      // reset logs
      _logs = []
      _logger._resetLogs()

      response = await DELETE(`/crud-1/Customers(${CUSTOMER_ID})`, { auth: ALICE })

      expect(response).toMatchObject({ status: 204 })
      expect(_logs.length).toBe(10)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Customers',
          id: { ID: CUSTOMER_ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'emailAddress', old: 'foo@bar.com', new: 'null' },
          { name: 'firstName', old: 'foo', new: 'null' },
          { name: 'lastName', old: 'bar', new: 'null' },
          { name: 'creditCardNo', old: '12345', new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerPostalAddress',
          id: { ID: oldAddresses[0].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'street', old: oldAddresses[0].street, new: 'null' },
          { name: 'town', old: oldAddresses[0].town, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.AddressAttachment',
          id: { ID: oldAttachments[0].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'description', old: oldAttachments[0].description, new: 'null' },
          { name: 'todo', old: oldAttachments[0].todo, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.AddressAttachment',
          id: { ID: oldAttachments[1].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'description', old: oldAttachments[1].description, new: 'null' },
          { name: 'todo', old: oldAttachments[1].todo, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerPostalAddress',
          id: { ID: oldAddresses[1].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'street', old: oldAddresses[1].street, new: 'null' },
          { name: 'town', old: oldAddresses[1].town, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerStatus',
          id: { ID: oldStatus.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'description', old: 'active', new: 'null' },
          { name: 'todo', old: 'send reminder', new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.StatusChange',
          id: { ID: oldChange.ID, secondKey: oldChange.secondKey }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'description', old: 'new change', new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.LastOne',
          id: { ID: oldLast.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'lastOneField', old: 'some last value', new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Notes',
          id: { ID: oldStatusNote.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'note', old: oldStatusNote.note, new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Notes',
          id: { ID: oldAttachmentNote.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'note', old: oldAttachmentNote.note, new: 'null' }]
      })

      // check only one select used to look up data subject
      const selects = _logger._logs.debug.filter(
        l => typeof l === 'string' && l.match(/^SELECT/) && l.match(/SELECT [Customers.]*ID FROM CRUD_1_Customers/)
      )
      expect(selects.length).toBe(1)
    })

    test('delete comp of one', async () => {
      const response = await DELETE('/crud-1/CustomerStatus(23d4a37a-6319-4d52-bb48-02fd06b9ffa4)', { auth: ALICE })
      expect(response).toMatchObject({ status: 204 })
      expect(_logs.length).toBe(4)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerStatus',
          id: { ID: '23d4a37a-6319-4d52-bb48-02fd06b9ffa4' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'description', old: 'active', new: 'null' },
          { name: 'todo', old: 'send reminder', new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.StatusChange',
          id: { ID: '59d4a37a-6319-4d52-bb48-02fd06b9fbc2', secondKey: 'some value' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'description', old: 'new change', new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.LastOne',
          id: { ID: '74d4a37a-6319-4d52-bb48-02fd06b9f3r4' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'lastOneField', old: 'some last value', new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Notes',
          id: { ID: '35bdc8d0-dcaf-4727-9377-9ae693055555' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'note', old: 'initial status note', new: 'null' }]
      })
    })

    test('with atomicity group', async () => {
      let response

      response = await GET(
        `/crud-1/Customers(${CUSTOMER_ID})?$expand=addresses($expand=attachments($expand=notes)),status($expand=change($expand=last),notes)`,
        { auth: ALICE }
      )
      const oldAddresses = response.data.addresses
      const oldAttachments = response.data.addresses[0].attachments
      const oldStatus = response.data.status
      const oldChange = response.data.status.change
      const oldLast = response.data.status.change.last
      const oldAttachmentNotes = response.data.addresses[0].attachments[0].notes
      const oldStatusNote = response.data.status.notes[0]

      // reset logs
      _logs = []

      const body = {
        requests: [
          {
            method: 'DELETE',
            url: `/Customers(bcd4a37a-6319-4d52-bb48-02fd06b9ffe9)/addresses(${oldAddresses[0].ID})`,
            headers: { 'content-type': 'application/json', 'odata-version': '4.0' },
            id: 'r1',
            atomicityGroup: 'g1'
          },
          {
            method: 'DELETE',
            url: `/Customers(bcd4a37a-6319-4d52-bb48-02fd06b9ffe9)/addresses(${oldAddresses[1].ID})`,
            headers: { 'content-type': 'application/json', 'odata-version': '4.0' },
            id: 'r2',
            atomicityGroup: 'g1'
          },
          {
            method: 'PATCH',
            url: `/Customers(${CUSTOMER_ID})`,
            headers: { 'content-type': 'application/json', 'odata-version': '4.0' },
            id: 'r3',
            atomicityGroup: 'g1',
            body: { status: null }
          }
        ]
      }
      response = await POST('/crud-1/$batch', body, { auth: ALICE })
      expect(response).toMatchObject({ status: 200 })
      expect(response.data.responses.every(r => r.status >= 200 && r.status < 300)).toBeTruthy()
      expect(_logs.length).toBe(10)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerPostalAddress',
          id: { ID: oldAddresses[0].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'street', old: oldAddresses[0].street, new: 'null' },
          { name: 'town', old: oldAddresses[0].town, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.AddressAttachment',
          id: { ID: oldAttachments[0].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'description', old: oldAttachments[0].description, new: 'null' },
          { name: 'todo', old: oldAttachments[0].todo, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.AddressAttachment',
          id: { ID: oldAttachments[1].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'description', old: oldAttachments[1].description, new: 'null' },
          { name: 'todo', old: oldAttachments[1].todo, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerPostalAddress',
          id: { ID: oldAddresses[1].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'street', old: oldAddresses[1].street, new: 'null' },
          { name: 'town', old: oldAddresses[1].town, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerStatus',
          id: { ID: oldStatus.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'description', old: 'active', new: 'null' },
          { name: 'todo', old: 'send reminder', new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.StatusChange',
          id: { ID: oldChange.ID, secondKey: oldChange.secondKey }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'description', old: 'new change', new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.LastOne',
          id: { ID: oldLast.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'lastOneField', old: 'some last value', new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Notes',
          id: { ID: oldAttachmentNotes[0].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'note', old: 'start', new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Notes',
          id: { ID: oldStatusNote.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'note', old: oldStatusNote.note, new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Customers',
          id: { ID: 'bcd4a37a-6319-4d52-bb48-02fd06b9ffe9' }
        },
        data_subject: {
          type: 'CRUD_1.Customers',
          role: 'Customer',
          id: { ID: 'bcd4a37a-6319-4d52-bb48-02fd06b9ffe9' }
        },
        attributes: [{ name: 'creditCardNo' }]
      })
    })

    test(`with entity semantics -Other- and downward lookup of data subject ID`, async () => {
      const order = {
        ID: 'bcd4a37a-6319-4d52-bb48-02fd06b9aaaa',
        header: {
          description: 'dummy',
          sensitiveData: {
            customer: {
              ID: CUSTOMER_ID
            },
            note: 'positive'
          }
        },
        items: [
          {
            name: 'foo',
            customer: {
              ID: CUSTOMER_ID
            }
          }
        ],
        misc: 'abc'
      }
      const r1 = await POST(`/crud-1/Orders`, order, { auth: ALICE })
      expect(r1)
      const {
        data: {
          header_ID,
          header: { sensitiveData },
          items
        }
      } = await GET(`/crud-1/Orders(${order.ID})?$expand=header($expand=sensitiveData),items`, { auth: ALICE })
      items.push({
        name: 'bar',
        customer: {
          ID: CUSTOMER_ID
        }
      })
      const updatedOrder = {
        misc: 'IISSEE 123',
        header: {
          ID: header_ID,
          description: 'olala',
          sensitiveData: {
            ID: sensitiveData.ID,
            note: 'negative'
          }
        },
        items
      }
      _logs = []
      await PATCH(`/crud-1/Orders(${order.ID})`, updatedOrder, { auth: ALICE })
      expect(_logs.length).toBe(6)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Orders',
          id: { ID: order.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'misc', old: 'abc', new: 'IISSEE 123' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.OrderHeader',
          id: { ID: header_ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'description', old: 'dummy', new: 'olala' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.OrderHeader.sensitiveData',
          id: { ID: sensitiveData.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'note', old: 'positive', new: 'negative' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Orders',
          id: { ID: order.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'misc' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.OrderHeader',
          id: { ID: header_ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'description' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.OrderHeader.sensitiveData',
          id: { ID: sensitiveData.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'note' }]
      })
      const r2 = await DELETE(`/crud-1/Orders(${order.ID})`, { auth: ALICE })
      expect(r2).toMatchObject({ status: 204 })
      expect(_logs.length).toBe(9)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Orders',
          id: { ID: order.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'misc', old: 'IISSEE 123', new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.OrderHeader',
          id: { ID: header_ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'description', old: 'olala', new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.OrderHeader.sensitiveData',
          id: { ID: sensitiveData.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'note', old: 'negative', new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Orders',
          id: { ID: order.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'misc', old: 'abc', new: 'IISSEE 123' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.OrderHeader',
          id: { ID: header_ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'description', old: 'dummy', new: 'olala' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.OrderHeader.sensitiveData',
          id: { ID: sensitiveData.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'note', old: 'positive', new: 'negative' }]
      })
    })
  })

  describe('avoid audit logs by prepending on', () => {
    let _avoid

    beforeAll(async () => {
      const als = cds.services['audit-log'] || (await cds.connect.to('audit-log'))

      als.prepend(srv => {
        srv.on('dataAccessLog', function (req, next) {
          if (!_avoid) return next()
        })
      })
    })

    afterAll(() => {
      // hackily remove on handler
      cds.services['audit-log']._handlers.on.shift()
    })

    beforeEach(() => {
      _avoid = undefined
    })

    test('read all Customers with avoid = false', async () => {
      const response = await GET('/crud-1/Customers', { auth: ALICE })

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(1)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Customers',
          id: { ID: CUSTOMER_ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'creditCardNo' }]
      })
    })

    // TODO: compat api not yet implemented
    xtest('read all Customers with avoid = true', async () => {
      _avoid = true

      const response = await GET('/crud-1/Customers', { auth: ALICE })

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(0)
    })
  })
})
