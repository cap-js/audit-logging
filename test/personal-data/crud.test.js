const cds = require('@sap/cds')

const { POST: _POST, PATCH: _PATCH, GET: _GET, DELETE: _DELETE, data } = cds.test().in(__dirname)

// the persistent outbox adds a delay
const wait = require('node:timers/promises').setTimeout
const DELAY = process.env.CI ? 42 : 7
const POST = (...args) => _POST(...args).then(async res => (await wait(DELAY), res))
const PATCH = (...args) => _PATCH(...args).then(async res => (await wait(DELAY), res))
const GET = (...args) => _GET(...args).then(async res => (await wait(DELAY), res))
const DELETE = (...args) => _DELETE(...args).then(async res => (await wait(DELAY), res))

// TODO: @cap-js/sqlite doesn't support structured properties
// // needed for testing structured properties
// cds.env.odata.flavor = 'x4'

const _logger = require('../utils/logger')({ debug: true })
cds.log.Logger = _logger

describe('personal data audit logging in CRUD', () => {
  let __log, _logs
  const _log = (...args) => {
    if (!(args.length === 2 && typeof args[0] === 'string' && args[0].match(/\[audit-log\]/i))) {
      // > not an audit log (most likely, anyway)
      return __log(...args)
    }

    _logs.push(args[1])
  }

  const CUSTOMER_ID = 'bcd4a37a-6319-4d52-bb48-02fd06b9ffe9'
  const DATA_SUBJECT = {
    type: 'CRUD_1.Customers',
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
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Pages',
          id: { ID: 1 }
        },
        data_subject: {
          id: { ID: 1 },
          role: 'Pages',
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
      // NOTE: cds^8 only returns root on update requests -> no data access logs for children
      expect(_logs.length).toBeGreaterThanOrEqual(1)
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
          { name: 'emailAddress', new: customer.emailAddress },
          { name: 'firstName', new: customer.firstName },
          { name: 'lastName', new: customer.lastName },
          { name: 'creditCardNo', new: '***' }
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
          { name: 'emailAddress', new: customer.emailAddress },
          { name: 'firstName', new: customer.firstName },
          { name: 'lastName', new: customer.lastName },
          { name: 'creditCardNo', new: '***' }
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
          { name: 'street', new: '***' },
          { name: 'town', new: addresses[0].town }
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
          { name: 'street', new: '***' },
          { name: 'town', new: addresses[1].town }
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
          { name: 'description', new: '***' },
          { name: 'todo', new: attachments[0].todo }
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
          { name: 'description', new: '***' },
          { name: 'todo', new: 'activate' }
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
          id: { ID: 123 }
        },
        data_subject: {
          type: 'CRUD_1.Pages',
          role: 'Pages',
          id: { ID: 123 }
        },
        attributes: [
          { name: 'personal', new: 4711 },
          { name: 'sensitive', new: '***' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Pages',
          id: { ID: 123 }
        },
        data_subject: {
          id: { ID: 123 },
          role: 'Pages',
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
          { name: 'creditCardNo', old: '***', new: '***' }
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

    test('update entity with key as personal data', async () => {
      const idMain = 'daac72b5-5b4a-4831-b559-d0e68baa3b22'
      const idSub = 'f6407ee1-3af5-423a-9b18-83a004306524'
      const DATA_SUBJECT_M = {
        type: 'CRUD_1.MainEntities',
        role: 'MainEntity',
        id: { ID: idMain }
      }
      const responseMain = await POST(
        '/crud-1/MainEntities',
        { ID: idMain, subEntities: [{ ID: idSub, name: 'myName' }] },
        { auth: ALICE }
      )
      expect(responseMain).toMatchObject({ status: 201 })

      const response = await PATCH(`/crud-1/SubEntities(${idSub})`, { name: 'newName' }, { auth: ALICE })

      expect(response).toMatchObject({ status: 200 })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.SubEntities',
          id: { ID: idSub }
        },
        data_subject: DATA_SUBJECT_M,
        attributes: [{ name: 'name', old: 'myName', new: 'newName' }]
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
          id: { ID: 1 }
        },
        data_subject: {
          id: { ID: 1 },
          role: 'Pages',
          type: 'CRUD_1.Pages'
        },
        attributes: [
          { name: 'personal', old: 222, new: 888 },
          { name: 'sensitive', old: '***', new: '***' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Pages',
          id: { ID: 1 }
        },
        data_subject: {
          id: { ID: 1 },
          role: 'Pages',
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
          { name: 'emailAddress', new: newCustomer.emailAddress },
          { name: 'creditCardNo', new: '***' }
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
          id: { ID: 123 }
        },
        data_subject: {
          id: { ID: 123 },
          role: 'Pages',
          type: 'CRUD_1.Pages'
        },
        attributes: [
          { name: 'personal', new: 888 },
          { name: 'sensitive', new: '***' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Pages',
          id: { ID: 123 }
        },
        data_subject: {
          id: { ID: 123 },
          role: 'Pages',
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

      // REVISIT: cds^9 does not replace unmentioned assocs with empty arrays
      if (cds.version.split('.')[0] >= 9) {
        customer.addresses[0].attachments = []
        customer.addresses[1].attachments = []
        customer.status.notes = []
      }

      response = await PATCH(`/crud-1/Customers(${CUSTOMER_ID})`, customer, { auth: ALICE })
      expect(response).toMatchObject({ status: 200 })

      // NOTE: cds^8 only returns root on update requests -> no data access logs for children
      expect(_logs.length).toBeGreaterThanOrEqual(9)

      // augment response with data (specifically keys in children) not returned in cds^8
      if (!response.data.addresses) {
        const {
          data: { addresses, status }
        } = await GET(`/crud-1/Customers(${CUSTOMER_ID})?$select=ID&$expand=addresses,status`, { auth: ALICE })
        response.data.addresses = addresses
        response.data.status = status
      }

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
          { name: 'street', old: '***' },
          { name: 'town', old: oldAddresses[0].town }
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
          { name: 'street', old: '***' },
          { name: 'town', old: oldAddresses[1].town }
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
          { name: 'street', new: '***' },
          { name: 'town', new: newAddresses[0].town }
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
          { name: 'street', new: '***' },
          { name: 'town', new: newAddresses[1].town }
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
          { name: 'description', old: '***', new: '***' },
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

      // NOTE: cds^8 only returns root on update requests -> no data access logs for children
      expect(_logs.length).toBeGreaterThanOrEqual(10)

      // augment response with data (specifically keys in children) not returned in cds^8
      if (!response.data.addresses) {
        const {
          data: { addresses, status }
        } = await GET(
          `/crud-1/Customers(${CUSTOMER_ID})?$select=ID&$expand=addresses($expand=attachments($expand=notes)),status`,
          { auth: ALICE }
        )
        response.data.addresses = addresses
        response.data.status = status
      }

      const newAddresses = response.data.addresses
      const newStatus = response.data.status
      const newAttachmentNote = response.data.addresses[0].attachments[0].notes[0]

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Notes',
          id: { ID: oldAttachmentNote.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'note', old: '***' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Notes',
          id: { ID: oldStatusNote.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'note', old: '***' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.AddressAttachment',
          id: { ID: oldAttachments[1].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'description', old: '***' }
          // REVISIT: not there in cds^9
          // { name: 'todo', old: oldAttachments[1].todo }
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
          { name: 'street', old: '***' },
          { name: 'town', old: oldAddresses[1].town }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerPostalAddress',
          id: { ID: newAddresses[0].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'street', old: '***', new: '***' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.AddressAttachment',
          id: { ID: oldAttachments[0].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'description', old: '***', new: '***' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Notes',
          id: { ID: newAttachmentNote.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'note', new: '***' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.CustomerPostalAddress',
          id: { ID: newAddresses[1].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [
          { name: 'street', new: '***' },
          { name: 'town', new: newAddresses[1].town }
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
          { name: 'description', old: '***', new: '***' },
          { name: 'todo', old: oldStatus.todo, new: newStatus.todo }
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
          { name: 'street', old: '***' },
          { name: 'town', old: oldAddresses[0].town }
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
          { name: 'description', old: '***' },
          { name: 'todo', old: oldAttachments[0].todo }
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
          { name: 'description', old: '***' },
          { name: 'todo', old: oldAttachments[1].todo }
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
          { name: 'street', old: '***' },
          { name: 'town', old: oldAddresses[1].town }
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
          { name: 'description', old: '***' },
          { name: 'todo', old: 'send reminder' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.StatusChange',
          id: { ID: oldChange.ID, secondKey: oldChange.secondKey }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'description', old: '***' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.LastOne',
          id: { ID: oldLast.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'lastOneField', old: '***' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Notes',
          id: { ID: oldStatusNote.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'note', old: '***' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Notes',
          id: { ID: oldAttachmentNote.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'note', old: '***' }]
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
          { name: 'emailAddress', old: 'foo@bar.com' },
          { name: 'firstName', old: 'foo' },
          { name: 'lastName', old: 'bar' },
          { name: 'creditCardNo', old: '***' }
        ]
      })
    })

    test('delete non existing entity does not cause any logs', async () => {
      const { Pages } = cds.entities('CRUD_1')
      await cds.delete(Pages).where(`ID = 123456789`)

      expect(_logs).not.toContainMatchObject({
        object: {
          type: 'CRUD_1.Pages',
          id: { ID: 123456789 }
        }
      })
    })

    test('delete Pages with integers - flat', async () => {
      await DELETE('/crud-1/Pages(1)', { auth: ALICE })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Pages',
          id: { ID: 1 }
        },
        data_subject: {
          id: { ID: 1 },
          role: 'Pages',
          type: 'CRUD_1.Pages'
        },
        attributes: [
          { name: 'personal', old: 222 },
          { name: 'sensitive', old: '***' }
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
          { name: 'emailAddress', old: 'foo@bar.com' },
          { name: 'firstName', old: 'foo' },
          { name: 'lastName', old: 'bar' },
          { name: 'creditCardNo', old: '***' }
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
          { name: 'street', old: '***' },
          { name: 'town', old: oldAddresses[0].town }
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
          { name: 'description', old: '***' },
          { name: 'todo', old: oldAttachments[0].todo }
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
          { name: 'description', old: '***' },
          { name: 'todo', old: oldAttachments[1].todo }
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
          { name: 'street', old: '***' },
          { name: 'town', old: oldAddresses[1].town }
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
          { name: 'description', old: '***' },
          { name: 'todo', old: 'send reminder' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.StatusChange',
          id: { ID: oldChange.ID, secondKey: oldChange.secondKey }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'description', old: '***' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.LastOne',
          id: { ID: oldLast.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'lastOneField', old: '***' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Notes',
          id: { ID: oldStatusNote.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'note', old: '***' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Notes',
          id: { ID: oldAttachmentNote.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'note', old: '***' }]
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
          { name: 'description', old: '***' },
          { name: 'todo', old: 'send reminder' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.StatusChange',
          id: { ID: '59d4a37a-6319-4d52-bb48-02fd06b9fbc2', secondKey: 'some value' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'description', old: '***' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.LastOne',
          id: { ID: '74d4a37a-6319-4d52-bb48-02fd06b9f3r4' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'lastOneField', old: '***' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Notes',
          id: { ID: '35bdc8d0-dcaf-4727-9377-9ae693055555' }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'note', old: '***' }]
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
          { name: 'street', old: '***' },
          { name: 'town', old: oldAddresses[0].town }
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
          { name: 'description', old: '***' },
          { name: 'todo', old: oldAttachments[0].todo }
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
          { name: 'description', old: '***' },
          { name: 'todo', old: oldAttachments[1].todo }
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
          { name: 'street', old: '***' },
          { name: 'town', old: oldAddresses[1].town }
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
          { name: 'description', old: '***' },
          { name: 'todo', old: 'send reminder' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.StatusChange',
          id: { ID: oldChange.ID, secondKey: oldChange.secondKey }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'description', old: '***' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.LastOne',
          id: { ID: oldLast.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'lastOneField', old: '***' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Notes',
          id: { ID: oldAttachmentNotes[0].ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'note', old: '***' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Notes',
          id: { ID: oldStatusNote.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'note', old: '***' }]
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
      await POST(`/crud-1/Orders`, order, { auth: ALICE })
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
      // NOTE: cds^8 only returns root on update requests -> no data access logs for children
      expect(_logs.length).toBeGreaterThanOrEqual(4)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Orders',
          id: { ID: order.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'misc', old: '***', new: '***' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.OrderHeader',
          id: { ID: header_ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'description', old: '***', new: '***' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.OrderHeader.sensitiveData',
          id: { ID: sensitiveData.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'note', old: '***', new: '***' }]
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

      _logs = []

      await DELETE(`/crud-1/Orders(${order.ID})`, { auth: ALICE })
      expect(_logs.length).toBe(3)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.Orders',
          id: { ID: order.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'misc', old: '***' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.OrderHeader',
          id: { ID: header_ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'description', old: '***' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUD_1.OrderHeader.sensitiveData',
          id: { ID: sensitiveData.ID }
        },
        data_subject: DATA_SUBJECT,
        attributes: [{ name: 'note', old: '***' }]
      })
    })

    // TODO: @cap-js/sqlite doesn't support structured properties
    test.skip('structured property', async () => {
      await POST(`/crud-1/Employees`, { name: { first: 'foo', last: 'bar' } }, { auth: ALICE })
      expect(_logs.length).toBe(2)
      expect(_logs[0].attributes).toEqual([{ name: 'name', new: '???' }])
      expect(_logs[1].attributes).toEqual([{ name: 'notes' }])
    })

    test('arrayed property', async () => {
      await POST(`/crud-1/Employees`, { skills: ['foo', 'bar'] }, { auth: ALICE })
      expect(_logs.length).toBe(2)
      expect(_logs[0].attributes).toEqual([{ name: 'skills', new: '["foo","bar"]' }])
      expect(_logs[1].attributes).toEqual([{ name: 'notes' }])
    })

    test('do not log values of sensitive data', async () => {
      await POST(`/crud-1/Employees`, { notes: ['bar', 'baz'] }, { auth: ALICE })
      expect(_logs.length).toBe(2)
      expect(_logs).toContainMatchObject({ attributes: [{ name: 'notes', new: '***' }] })
      expect(_logs).toContainMatchObject({ attributes: [{ name: 'notes' }] })
    })
  })

  describe('with renamings', () => {
    test('one level', async () => {
      let res

      const r1 = {
        r1_emailAddress: 'foo.bar@baz.com',
        r1_firstName: 'foo',
        r1_lastName: 'bar',
        r1_creditCardNo: '12345'
      }
      res = await POST('/crud-3/R1', r1, { auth: ALICE })
      r1.r1_ID = res.data.r1_ID
      const object = { type: 'CRUD_3.R1', id: { r1_ID: r1.r1_ID } }
      const data_subject = Object.assign({ role: 'Renamed Customer' }, object)
      expect(_logs.length).toBe(2)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object,
        data_subject,
        attributes: [
          { name: 'r1_emailAddress', new: r1.r1_emailAddress },
          { name: 'r1_firstName', new: r1.r1_firstName },
          { name: 'r1_lastName', new: r1.r1_lastName },
          { name: 'r1_creditCardNo', new: '***' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object,
        data_subject,
        attributes: [{ name: 'r1_creditCardNo' }]
      })

      // reset logs
      _logs = []

      res = await PATCH(`/crud-3/R1/${r1.r1_ID}`, { r1_firstName: 'moo', r1_lastName: 'shu' }, { auth: ALICE })
      expect(_logs.length).toBe(2)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object,
        data_subject,
        attributes: [
          { name: 'r1_firstName', old: r1.r1_firstName, new: 'moo' },
          { name: 'r1_lastName', old: r1.r1_lastName, new: 'shu' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object,
        data_subject,
        attributes: [{ name: 'r1_creditCardNo' }]
      })

      // reset logs
      _logs = []

      res = await DELETE(`/crud-3/R1/${r1.r1_ID}`, { auth: ALICE })
      expect(_logs.length).toBe(1)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object,
        data_subject,
        attributes: [
          { name: 'r1_emailAddress', old: r1.r1_emailAddress },
          { name: 'r1_firstName', old: 'moo' },
          { name: 'r1_lastName', old: 'shu' },
          { name: 'r1_creditCardNo', old: '***' }
        ]
      })
    })

    test('two levels', async () => {
      let res

      const r2 = {
        r2_emailAddress: 'foo.bar@baz.com',
        r2_firstName: 'foo',
        r2_lastName: 'bar',
        r2_creditCardNo: '12345'
      }
      res = await POST('/crud-3/R2', r2, { auth: ALICE })
      r2.r2_ID = res.data.r2_ID
      const object = { type: 'CRUD_3.R2', id: { r2_ID: r2.r2_ID } }
      const data_subject = Object.assign({ role: 'Twice Renamed Customer' }, object)
      expect(_logs.length).toBe(2)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object,
        data_subject,
        attributes: [
          { name: 'r2_emailAddress', new: r2.r2_emailAddress },
          { name: 'r2_firstName', new: r2.r2_firstName },
          { name: 'r2_lastName', new: r2.r2_lastName },
          { name: 'r2_creditCardNo', new: '***' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object,
        data_subject,
        attributes: [{ name: 'r2_creditCardNo' }]
      })

      // reset logs
      _logs = []

      res = await PATCH(`/crud-3/R2/${r2.r2_ID}`, { r2_firstName: 'moo', r2_lastName: 'shu' }, { auth: ALICE })
      expect(_logs.length).toBe(2)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object,
        data_subject,
        attributes: [
          { name: 'r2_firstName', old: r2.r2_firstName, new: 'moo' },
          { name: 'r2_lastName', old: r2.r2_lastName, new: 'shu' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object,
        data_subject,
        attributes: [{ name: 'r2_creditCardNo' }]
      })

      // reset logs
      _logs = []

      res = await DELETE(`/crud-3/R2/${r2.r2_ID}`, { auth: ALICE })
      expect(_logs.length).toBe(1)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object,
        data_subject,
        attributes: [
          { name: 'r2_emailAddress', old: r2.r2_emailAddress },
          { name: 'r2_firstName', old: 'moo' },
          { name: 'r2_lastName', old: 'shu' },
          { name: 'r2_creditCardNo', old: '***' }
        ]
      })
    })

    test('deep', async () => {
      const c1 = {
        c_emailAddress: 'foo@bar.baz',
        c_addresses: [
          {
            cpa_town: 'moo',
            cpa_attachments: [
              {
                aa_todo: 'boo'
              },
              {
                aa_todo: 'who'
              }
            ]
          },
          {
            cpa_town: 'shu'
          }
        ]
      }
      const { data: r1 } = await POST('/crud-3/C', c1, { auth: ALICE })
      Object.assign(c1, r1)
      expect(_logs.length).toBe(5)
      expect(_logs).toContainMatchObject({ attributes: [{ name: 'c_emailAddress', new: 'foo@bar.baz' }] })
      expect(_logs).toContainMatchObject({ attributes: [{ name: 'cpa_town', new: 'moo' }] })
      expect(_logs).toContainMatchObject({ attributes: [{ name: 'cpa_town', new: 'shu' }] })
      expect(_logs).toContainMatchObject({ attributes: [{ name: 'aa_todo', new: 'boo' }] })
      expect(_logs).toContainMatchObject({ attributes: [{ name: 'aa_todo', new: 'who' }] })

      // reset logs
      _logs = []

      const c2 = {
        c_emailAddress: 'foo@bar.bas',
        c_addresses: [
          {
            cpa_id: c1.c_addresses[0].cpa_id,
            cpa_town: 'voo',
            cpa_attachments: [
              {
                aa_id: c1.c_addresses[0].cpa_attachments[0].aa_id,
                aa_todo: 'doo'
              }
            ]
          }
        ]
      }
      await PATCH(`/crud-3/C/${c1.c_id}`, c2, { auth: ALICE })
      expect(_logs.length).toBe(5)
      expect(_logs).toContainMatchObject({
        attributes: [{ name: 'c_emailAddress', old: 'foo@bar.baz', new: 'foo@bar.bas' }]
      })
      expect(_logs).toContainMatchObject({ attributes: [{ name: 'cpa_town', old: 'moo', new: 'voo' }] })
      expect(_logs).toContainMatchObject({ attributes: [{ name: 'cpa_town', old: 'shu' }] })
      expect(_logs).toContainMatchObject({ attributes: [{ name: 'aa_todo', old: 'boo', new: 'doo' }] })
      expect(_logs).toContainMatchObject({ attributes: [{ name: 'aa_todo', old: 'who' }] })
    })

    test('child key', async () => {
      const parentID = 'bcd4a37a-6319-4d52-bb48-02fd06b9aaaa'
      const childID = 'c49fe764-75aa-49f1-9475-cf67cf0b03f7'
      const data = {
        ID: parentID,
        subEntities: [
          {
            renamedID: childID,
            name: 'foo'
          }
        ]
      }
      await POST('/crud-4/RenamedMainEntities', data, { auth: ALICE })
      expect(_logs.length).toBe(1)

      // reset logs
      _logs = []

      await DELETE(`/crud-4/RenamedSubEntities(${childID})`, { auth: ALICE })
      const object = { type: 'CRUD_4.RenamedSubEntities', id: { renamedID: childID } }
      const data_subject = { id: { ID: parentID }, role: 'MainEntity', type: 'CRUD_4.RenamedMainEntities' }
      expect(_logs.length).toBe(1)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object,
        data_subject
      })
    })
  })

  test('with cycles', async () => {
    await POST('/crud-5/A', { text: 'foo' }, { auth: ALICE })
    expect(_logs.length).toBe(1)
  })
})
