const cds = require('@sap/cds')
// cds.test.in(__dirname)
const { POST, PATCH, GET, DELETE, data } = cds.test(__dirname)

// const { init, clear4 } = require('../../utils/setup')
// init(['/audit/__resources__/bookshop/index.cds'], { demoData: false })
// const serve = require('../../utils/serve')
// const request = require('supertest')
// const path = require('path')

// const { INSERT } = cds.ql

// const logger = require('../../utils/logger')({ debug: true })
// cds.log.Logger = logger

// const customer_ID = `bcd4a37a-6319-4d52-bb48-02fd06b9ffe9`

describe('personal data audit logging in CRUD', () => {
  let app, _log, _logs

  const data_subject = {
    type: 'CRUDService.Customers',
    role: 'Customer',
    id: { ID: customer_ID }
  }

  beforeAll(async () => {
    _log = global.console.log

    global.console.log = (...args) => {
      if (args.length !== 1 || !args[0].uuid) {
        // > not an audit log (most likely, anyway)
        return _log(...args)
      }

      // do not add log preps
      if (args[0].attributes && 'old' in args[0].attributes[0] && !args[0].success) return
      _logs.push(...args)
    }

    // // crud service
    // const auth = {
    //   kind: 'mocked-auth',
    //   users: { alice: { roles: ['admin'] } }
    // }

    // const crud = path.join(process.cwd(), '/audit/__resources__/bookshop/crud.cds')
    // app = await serve(crud, { auth })
  })

  afterAll(() => {
    global.console.log = _log
  })

  beforeEach(async () => {
    _logs = []
    await data.reset()
    // await cds.run(inserts)
    // logger._resetLogs()
  })

  // afterEach(() => clear4())

  describe('data access logging', () => {
    test('read with another data subject and sensitive data only in composition children', async () => {
      const { body: customer } = await request(app)
        .get(`/crud-2/Customers(${customer_ID})?$expand=addresses`)
        .auth('alice', 'password')
      const addressID1 = customer.addresses[0].ID
      const addressID2 = customer.addresses[1].ID
      expect(_logs.length).toBe(2)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService2.CustomerPostalAddress',
          id: { ID: addressID1 }
        },
        data_subject: {
          type: 'CRUDService2.CustomerPostalAddress',
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
          type: 'CRUDService2.CustomerPostalAddress',
          id: { ID: addressID2 }
        },
        data_subject: {
          type: 'CRUDService2.CustomerPostalAddress',
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
      const response = await request(app)
        .get(`/crud-2/Customers(${customer_ID})?$expand=status,addresses`)
        .auth('alice', 'password')

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(2)
      expect(_logs).not.toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService2.CustomerStatus'
        }
      })
    })

    test('read all Customers', async () => {
      const response = await request(app).get('/crud/Customers').auth('alice', 'password')

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(1)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Customers',
          id: { ID: customer_ID }
        },
        data_subject,
        attributes: [{ name: 'creditCardNo' }]
      })
    })

    test('read single Customer', async () => {
      const response = await request(app).get(`/crud/Customers(${customer_ID})`).auth('alice', 'password')

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(1)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Customers',
          id: { ID: customer_ID }
        },
        data_subject,
        attributes: [{ name: 'creditCardNo' }]
      })
    })

    test('no log if sensitive data not selected', async () => {
      const response = await request(app).get(`/crud/Customers(${customer_ID})?$select=ID`).auth('alice', 'password')

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(0)
    })

    test('read non-existing Customer should not crash the app', async () => {
      await request(app)
        .get('/crud/Customers(ffffffff-6319-4d52-bb48-02fd06b9ffe9)')
        .auth('alice', 'password')
        .expect(404)
    })

    test('read Customer expanding addresses and comments - comp of many', async () => {
      const response = await request(app)
        .get(`/crud/Customers(${customer_ID})?$expand=addresses($expand=attachments),comments`)
        .auth('alice', 'password')

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(5)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Customers',
          id: { ID: customer_ID }
        },
        data_subject,
        attributes: [{ name: 'creditCardNo' }]
      })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerPostalAddress',
          id: { ID: '1ab71292-ef69-4571-8cfb-10b9d5d1459e' }
        },
        data_subject,
        attributes: [{ name: 'street' }]
      })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.AddressAttachment',
          id: { ID: '3cd71292-ef69-4571-8cfb-10b9d5d1437e' }
        },
        data_subject,
        attributes: [{ name: 'description' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.AddressAttachment',
          id: { ID: '595225db-6eeb-4b4f-9439-dbe5fcb4ce5a' }
        },
        data_subject,
        attributes: [{ name: 'description' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerPostalAddress',
          id: { ID: '285225db-6eeb-4b4f-9439-dbe5fcb4ce82' }
        },
        data_subject,
        attributes: [{ name: 'street' }]
      })
    })

    test('read Customer expanding deep nested comp of one', async () => {
      const response = await request(app)
        .get(`/crud/Customers(ID=${customer_ID})?$expand=status($expand=change($expand=last))`)
        .auth('alice', 'password')
      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(4)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Customers',
          id: { ID: customer_ID }
        },
        data_subject,
        attributes: [{ name: 'creditCardNo' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerStatus',
          id: { ID: '23d4a37a-6319-4d52-bb48-02fd06b9ffa4' }
        },
        data_subject,
        attributes: [{ name: 'description' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.StatusChange',
          id: { ID: '59d4a37a-6319-4d52-bb48-02fd06b9fbc2', secondKey: 'some value' }
        },
        data_subject,
        attributes: [{ name: 'description' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.LastOne',
          id: { ID: '74d4a37a-6319-4d52-bb48-02fd06b9f3r4' }
        },
        data_subject,
        attributes: [{ name: 'lastOneField' }]
      })
    })

    test('read all CustomerStatus', async () => {
      const response = await request(app).get('/crud/CustomerStatus').auth('alice', 'password')
      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(1)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerStatus',
          id: { ID: '23d4a37a-6319-4d52-bb48-02fd06b9ffa4' }
        },
        data_subject,
        attributes: [{ name: 'description' }]
      })
    })

    test('read all CustomerPostalAddress', async () => {
      const response = await request(app).get('/crud/CustomerPostalAddress').auth('alice', 'password')

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(2)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerPostalAddress',
          id: { ID: '1ab71292-ef69-4571-8cfb-10b9d5d1459e' }
        },
        data_subject,
        attributes: [{ name: 'street' }]
      })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerPostalAddress',
          id: { ID: '285225db-6eeb-4b4f-9439-dbe5fcb4ce82' }
        },
        data_subject,
        attributes: [{ name: 'street' }]
      })
    })

    test('read all CustomerPostalAddress expanding Customer', async () => {
      const response = await request(app).get('/crud/CustomerPostalAddress?$expand=customer').auth('alice', 'password')

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(3)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Customers',
          id: { ID: customer_ID }
        },
        data_subject,
        attributes: [{ name: 'creditCardNo' }]
      })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerPostalAddress',
          id: { ID: '1ab71292-ef69-4571-8cfb-10b9d5d1459e' }
        },
        data_subject,
        attributes: [{ name: 'street' }]
      })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerPostalAddress',
          id: { ID: '285225db-6eeb-4b4f-9439-dbe5fcb4ce82' }
        },
        data_subject,
        attributes: [{ name: 'street' }]
      })
    })
    test('read all Pages with integer keys', async () => {
      const response = await request(app).get('/crud/Pages').auth('alice', 'password')

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(1)
      // Note: All values must be strings (as required by audit-log service APIs)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Pages',
          id: { ID: '1' }
        },
        data_subject: {
          id: {
            ID: '1'
          },
          role: 'Page',
          type: 'CRUDService.Pages'
        }
      })
    })
  })

  describe('modification logging', () => {
    test('deep update customer with another data subject and sensitive data only in composition children', async () => {
      const response = await request(app)
        .patch(`/crud-2/Customers(${customer_ID})`)
        .auth('alice', 'password')
        .send({
          addresses: [
            {
              ID: '1ab71292-ef69-4571-8cfb-10b9d5d1459e',
              customer_ID,
              street: 'updated',
              town: 'updated town',
              someOtherField: 'dummy'
            },
            {
              ID: '285225db-6eeb-4b4f-9439-dbe5fcb4ce82',
              customer_ID,
              street: 'sue',
              town: 'lou',
              someOtherField: 'dummy'
            }
          ]
        })
      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(3)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService2.CustomerPostalAddress',
          id: { ID: '1ab71292-ef69-4571-8cfb-10b9d5d1459e' }
        },
        data_subject: {
          type: 'CRUDService2.CustomerPostalAddress',
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
          type: 'CRUDService2.CustomerPostalAddress',
          id: { ID: '1ab71292-ef69-4571-8cfb-10b9d5d1459e' }
        },
        data_subject: {
          type: 'CRUDService2.CustomerPostalAddress',
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
          type: 'CRUDService2.CustomerPostalAddress',
          id: { ID: '285225db-6eeb-4b4f-9439-dbe5fcb4ce82' }
        },
        data_subject: {
          type: 'CRUDService2.CustomerPostalAddress',
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

      const response = await request(app).post('/crud/Customers').auth('alice', 'password').send(customer)

      expect(response).toMatchObject({ status: 201 })
      customer.ID = response.body.ID
      expect(_logs.length).toBe(2)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Customers',
          id: { ID: customer.ID }
        },
        data_subject: {
          type: 'CRUDService.Customers',
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
          type: 'CRUDService.Customers',
          id: { ID: customer.ID }
        },
        data_subject: {
          type: 'CRUDService.Customers',
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

      const response = await request(app).post('/crud/Customers').auth('alice', 'password').send(customer)

      expect(response).toMatchObject({ status: 201 })

      customer.ID = response.body.ID
      const addresses = response.body.addresses
      const attachments = response.body.addresses[1].attachments
      const data_subject = {
        type: 'CRUDService.Customers',
        role: 'Customer',
        id: { ID: customer.ID }
      }

      expect(_logs.length).toBe(10)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Customers',
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
          type: 'CRUDService.CustomerPostalAddress',
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
          type: 'CRUDService.CustomerPostalAddress',
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
          type: 'CRUDService.AddressAttachment',
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
          type: 'CRUDService.CustomerStatus',
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
          type: 'CRUDService.Customers',
          id: { ID: customer.ID }
        },
        data_subject,
        attributes: [{ name: 'creditCardNo' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerPostalAddress',
          id: { ID: addresses[0].ID }
        },
        data_subject,
        attributes: [{ name: 'street' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerPostalAddress',
          id: { ID: addresses[1].ID }
        },
        data_subject,
        attributes: [{ name: 'street' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.AddressAttachment',
          id: { ID: attachments[0].ID }
        },
        data_subject,
        attributes: [{ name: 'description' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerStatus',
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

      const response = await request(app).post('/crud/Pages').auth('alice', 'password').send(page)

      expect(response).toMatchObject({ status: 201 })
      expect(_logs.length).toBe(2)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Pages',
          id: { ID: '123' }
        },
        data_subject: {
          type: 'CRUDService.Pages',
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
          type: 'CRUDService.Pages',
          id: { ID: '123' }
        },
        data_subject: {
          id: {
            ID: '123'
          },
          role: 'Page',
          type: 'CRUDService.Pages'
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

      const response = await request(app)
        .patch(`/crud/Customers(${customer_ID})`)
        .auth('alice', 'password')
        .send(customer)

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(2)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Customers',
          id: { ID: customer_ID }
        },
        data_subject,
        attributes: [
          { name: 'emailAddress', old: 'foo@bar.com', new: customer.emailAddress },
          { name: 'creditCardNo', old: '12345', new: customer.creditCardNo }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Customers',
          id: { ID: 'bcd4a37a-6319-4d52-bb48-02fd06b9ffe9' }
        },
        data_subject: {
          type: 'CRUDService.Customers',
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

      const response = await request(app).patch('/crud/Pages(1)').auth('alice', 'password').send(page)

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(2)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Pages',
          id: { ID: '1' }
        },
        data_subject: {
          id: {
            ID: '1'
          },
          role: 'Page',
          type: 'CRUDService.Pages'
        },
        attributes: [
          { name: 'personal', old: '222', new: '888' },
          { name: 'sensitive', old: '111', new: '999' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Pages',
          id: { ID: '1' }
        },
        data_subject: {
          id: {
            ID: '1'
          },
          role: 'Page',
          type: 'CRUDService.Pages'
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
      const response = await request(app)
        .patch(`/crud/Customers(${newUUID})`)
        .auth('alice', 'password')
        .send(newCustomer)

      expect(response.statusCode).toBe(200)
      expect(_logs.length).toBe(2)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Customers',
          id: { ID: newUUID }
        },
        data_subject: {
          id: { ID: newUUID },
          role: 'Customer',
          type: 'CRUDService.Customers'
        },
        attributes: [
          { name: 'emailAddress', old: 'null', new: newCustomer.emailAddress },
          { name: 'creditCardNo', old: 'null', new: newCustomer.creditCardNo }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Customers',
          id: { ID: newUUID }
        },
        data_subject: {
          type: 'CRUDService.Customers',
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

      const response = await request(app).patch('/crud/Pages(123)').auth('alice', 'password').send(page)

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(2)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Pages',
          id: { ID: '123' }
        },
        data_subject: {
          id: {
            ID: '123'
          },
          role: 'Page',
          type: 'CRUDService.Pages'
        },
        attributes: [
          { name: 'personal', old: 'null', new: '888' },
          { name: 'sensitive', old: 'null', new: '999' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Pages',
          id: { ID: '123' }
        },
        data_subject: {
          id: {
            ID: '123'
          },
          role: 'Page',
          type: 'CRUDService.Pages'
        },
        attributes: [{ name: 'sensitive' }]
      })
    })

    test('update Customer - deep', async () => {
      let response = await request(app)
        .get(`/crud/Customers(${customer_ID})?$expand=addresses,status`)
        .auth('alice', 'password')

      const oldAddresses = response.body.addresses

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

      response = await request(app).patch(`/crud/Customers(${customer_ID})`).auth('alice', 'password').send(customer)

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(12)

      const newAddresses = response.body.addresses
      const newStatus = response.body.status

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerPostalAddress',
          id: { ID: oldAddresses[0].ID }
        },
        data_subject,
        attributes: [
          { name: 'street', old: oldAddresses[0].street, new: 'null' },
          { name: 'town', old: oldAddresses[0].town, new: 'null' }
        ]
      })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerPostalAddress',
          id: { ID: oldAddresses[1].ID }
        },
        data_subject,
        attributes: [
          { name: 'street', old: oldAddresses[1].street, new: 'null' },
          { name: 'town', old: oldAddresses[1].town, new: 'null' }
        ]
      })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerPostalAddress',
          id: { ID: newAddresses[0].ID }
        },
        data_subject,
        attributes: [
          { name: 'street', old: 'null', new: newAddresses[0].street },
          { name: 'town', old: 'null', new: newAddresses[0].town }
        ]
      })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerPostalAddress',
          id: { ID: newAddresses[1].ID }
        },
        data_subject,
        attributes: [
          { name: 'street', old: 'null', new: newAddresses[1].street },
          { name: 'town', old: 'null', new: newAddresses[1].town }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerStatus',
          id: { ID: newStatus.ID }
        },
        data_subject,
        attributes: [
          { name: 'description', old: 'active', new: 'inactive' },
          { name: 'todo', old: 'send reminder', new: 'delete' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Customers',
          id: { ID: 'bcd4a37a-6319-4d52-bb48-02fd06b9ffe9' }
        },
        data_subject,
        attributes: [{ name: 'creditCardNo' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerPostalAddress',
          id: { ID: newAddresses[0].ID }
        },
        data_subject,
        attributes: [{ name: 'street' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerPostalAddress',
          id: { ID: newAddresses[1].ID }
        },
        data_subject,
        attributes: [{ name: 'street' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerStatus',
          id: { ID: newStatus.ID }
        },
        data_subject,
        attributes: [{ name: 'description' }]
      })
    })

    test('update Customer - deep with reusing notes', async () => {
      let response
      response = await request(app)
        .get(
          `/crud/Customers(${customer_ID})?$expand=addresses($expand=attachments($expand=notes)),status($expand=notes)`
        )
        .auth('alice', 'password')

      const oldAddresses = response.body.addresses
      const oldAttachments = response.body.addresses[0].attachments
      const oldAttachmentNote = response.body.addresses[0].attachments[0].notes[0]
      const oldStatus = response.body.status
      const oldStatusNote = response.body.status.notes[0]

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

      response = await request(app).patch(`/crud/Customers(${customer_ID})`).auth('alice', 'password').send(customer)

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(16)

      const newAddresses = response.body.addresses
      const newStatus = response.body.status
      const newAttachments = response.body.addresses[0].attachments
      const newAttachmentNote = response.body.addresses[0].attachments[0].notes[0]
      const newStatusNote = response.body.status.notes[0]

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Notes',
          id: { ID: oldAttachmentNote.ID }
        },
        data_subject,
        attributes: [{ name: 'note', old: oldAttachmentNote.note, new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Notes',
          id: { ID: oldStatusNote.ID }
        },
        data_subject,
        attributes: [{ name: 'note', old: oldStatusNote.note, new: newStatusNote.note }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.AddressAttachment',
          id: { ID: oldAttachments[1].ID }
        },
        data_subject,
        attributes: [
          { name: 'description', old: oldAttachments[1].description, new: 'null' },
          { name: 'todo', old: oldAttachments[1].todo, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerPostalAddress',
          id: { ID: oldAddresses[1].ID }
        },
        data_subject,
        attributes: [
          { name: 'street', old: oldAddresses[1].street, new: 'null' },
          { name: 'town', old: oldAddresses[1].town, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerPostalAddress',
          id: { ID: newAddresses[0].ID }
        },
        data_subject,
        attributes: [{ name: 'street', old: oldAddresses[0].street, new: newAddresses[0].street }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.AddressAttachment',
          id: { ID: oldAttachments[0].ID }
        },
        data_subject,
        attributes: [{ name: 'description', old: oldAttachments[0].description, new: newAttachments[0].description }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Notes',
          id: { ID: newAttachmentNote.ID }
        },
        data_subject,
        attributes: [{ name: 'note', old: 'null', new: newAttachmentNote.note }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerPostalAddress',
          id: { ID: newAddresses[1].ID }
        },
        data_subject,
        attributes: [
          { name: 'street', old: 'null', new: newAddresses[1].street },
          { name: 'town', old: 'null', new: newAddresses[1].town }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerStatus',
          id: { ID: newStatus.ID }
        },
        data_subject,
        attributes: [
          { name: 'description', old: oldStatus.description, new: newStatus.description },
          { name: 'todo', old: oldStatus.todo, new: newStatus.todo }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.AddressAttachment',
          id: { ID: newAttachments[0].ID }
        },
        data_subject,
        attributes: [{ name: 'description' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Customers',
          id: { ID: 'bcd4a37a-6319-4d52-bb48-02fd06b9ffe9' }
        },
        data_subject,
        attributes: [{ name: 'creditCardNo' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerPostalAddress',
          id: { ID: newAddresses[0].ID }
        },
        data_subject,
        attributes: [{ name: 'street' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerPostalAddress',
          id: { ID: newAddresses[1].ID }
        },
        data_subject,
        attributes: [{ name: 'street' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerStatus',
          id: { ID: newStatus.ID }
        },
        data_subject,
        attributes: [{ name: 'description' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Notes',
          id: { ID: newStatusNote.ID }
        },
        data_subject,
        attributes: [{ name: 'note' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Notes',
          id: { ID: newAttachmentNote.ID }
        },
        data_subject,
        attributes: [{ name: 'note' }]
      })
    })

    test('delete Customer - flat', async () => {
      let response = await request(app)
        .get(
          `/crud/Customers(${customer_ID})?$expand=addresses($expand=attachments($expand=notes)),status($expand=change($expand=last),notes),comments`
        )
        .auth('alice', 'password')

      const oldAddresses = response.body.addresses
      const oldAttachments = response.body.addresses[0].attachments
      const oldStatus = response.body.status
      const oldChange = response.body.status.change
      const oldLast = response.body.status.change.last
      const oldStatusNote = oldStatus.notes[0]
      const oldAttachmentNote = oldAttachments[0].notes[0]

      // reset logs
      _logs = []

      // delete children
      response = await request(app)
        .patch(`/crud/Customers(${customer_ID})`)
        .auth('alice', 'password')
        .send({ addresses: [], status: null, comments: [] })
      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(10)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerPostalAddress',
          id: { ID: oldAddresses[0].ID }
        },
        data_subject,
        attributes: [
          { name: 'street', old: oldAddresses[0].street, new: 'null' },
          { name: 'town', old: oldAddresses[0].town, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.AddressAttachment',
          id: { ID: oldAttachments[0].ID }
        },
        data_subject,
        attributes: [
          { name: 'description', old: oldAttachments[0].description, new: 'null' },
          { name: 'todo', old: oldAttachments[0].todo, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.AddressAttachment',
          id: { ID: oldAttachments[1].ID }
        },
        data_subject,
        attributes: [
          { name: 'description', old: oldAttachments[1].description, new: 'null' },
          { name: 'todo', old: oldAttachments[1].todo, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerPostalAddress',
          id: { ID: oldAddresses[1].ID }
        },
        data_subject,
        attributes: [
          { name: 'street', old: oldAddresses[1].street, new: 'null' },
          { name: 'town', old: oldAddresses[1].town, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerStatus',
          id: { ID: oldStatus.ID }
        },
        data_subject,
        attributes: [
          { name: 'description', old: 'active', new: 'null' },
          { name: 'todo', old: 'send reminder', new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.StatusChange',
          id: { ID: oldChange.ID, secondKey: oldChange.secondKey }
        },
        data_subject,
        attributes: [{ name: 'description', old: 'new change', new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.LastOne',
          id: { ID: oldLast.ID }
        },
        data_subject,
        attributes: [{ name: 'lastOneField', old: 'some last value', new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Notes',
          id: { ID: oldStatusNote.ID }
        },
        data_subject,
        attributes: [{ name: 'note', old: oldStatusNote.note, new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Notes',
          id: { ID: oldAttachmentNote.ID }
        },
        data_subject,
        attributes: [{ name: 'note', old: oldAttachmentNote.note, new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Customers',
          id: { ID: 'bcd4a37a-6319-4d52-bb48-02fd06b9ffe9' }
        },
        data_subject: {
          type: 'CRUDService.Customers',
          role: 'Customer',
          id: { ID: 'bcd4a37a-6319-4d52-bb48-02fd06b9ffe9' }
        },
        attributes: [{ name: 'creditCardNo' }]
      })

      // reset logs
      _logs = []

      response = await request(app).delete(`/crud/Customers(${customer_ID})`).auth('alice', 'password')

      expect(response).toMatchObject({ status: 204 })
      expect(_logs.length).toBe(1)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Customers',
          id: { ID: customer_ID }
        },
        data_subject,
        attributes: [
          { name: 'emailAddress', old: 'foo@bar.com', new: 'null' },
          { name: 'firstName', old: 'foo', new: 'null' },
          { name: 'lastName', old: 'bar', new: 'null' },
          { name: 'creditCardNo', old: '12345', new: 'null' }
        ]
      })
    })

    test('delete Pages with integers - flat', async () => {
      await request(app).delete('/crud/Pages(1)').auth('alice', 'password')

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Pages',
          id: { ID: '1' }
        },
        data_subject: {
          id: {
            ID: '1'
          },
          role: 'Page',
          type: 'CRUDService.Pages'
        },
        attributes: [
          { name: 'personal', old: '222', new: 'null' },
          { name: 'sensitive', old: '111', new: 'null' }
        ]
      })
    })

    test('delete Customer - deep', async () => {
      let response = await request(app)
        .get(
          `/crud/Customers(${customer_ID})?$expand=addresses($expand=attachments($expand=notes)),status($expand=change($expand=last),notes)`
        )
        .auth('alice', 'password')

      const oldAddresses = response.body.addresses
      const oldAttachments = response.body.addresses[0].attachments
      const oldStatus = response.body.status
      const oldChange = response.body.status.change
      const oldLast = response.body.status.change.last
      const oldStatusNote = oldStatus.notes[0]
      const oldAttachmentNote = oldAttachments[0].notes[0]

      // reset logs
      _logs = []
      logger._resetLogs()

      response = await request(app).delete(`/crud/Customers(${customer_ID})`).auth('alice', 'password')

      expect(response).toMatchObject({ status: 204 })
      expect(_logs.length).toBe(10)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Customers',
          id: { ID: customer_ID }
        },
        data_subject,
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
          type: 'CRUDService.CustomerPostalAddress',
          id: { ID: oldAddresses[0].ID }
        },
        data_subject,
        attributes: [
          { name: 'street', old: oldAddresses[0].street, new: 'null' },
          { name: 'town', old: oldAddresses[0].town, new: 'null' }
        ]
      })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.AddressAttachment',
          id: { ID: oldAttachments[0].ID }
        },
        data_subject,
        attributes: [
          { name: 'description', old: oldAttachments[0].description, new: 'null' },
          { name: 'todo', old: oldAttachments[0].todo, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.AddressAttachment',
          id: { ID: oldAttachments[1].ID }
        },
        data_subject,
        attributes: [
          { name: 'description', old: oldAttachments[1].description, new: 'null' },
          { name: 'todo', old: oldAttachments[1].todo, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerPostalAddress',
          id: { ID: oldAddresses[1].ID }
        },
        data_subject,
        attributes: [
          { name: 'street', old: oldAddresses[1].street, new: 'null' },
          { name: 'town', old: oldAddresses[1].town, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerStatus',
          id: { ID: oldStatus.ID }
        },
        data_subject,
        attributes: [
          { name: 'description', old: 'active', new: 'null' },
          { name: 'todo', old: 'send reminder', new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.StatusChange',
          id: { ID: oldChange.ID, secondKey: oldChange.secondKey }
        },
        data_subject,
        attributes: [{ name: 'description', old: 'new change', new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.LastOne',
          id: { ID: oldLast.ID }
        },
        data_subject,
        attributes: [{ name: 'lastOneField', old: 'some last value', new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Notes',
          id: { ID: oldStatusNote.ID }
        },
        data_subject,
        attributes: [{ name: 'note', old: oldStatusNote.note, new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Notes',
          id: { ID: oldAttachmentNote.ID }
        },
        data_subject,
        attributes: [{ name: 'note', old: oldAttachmentNote.note, new: 'null' }]
      })

      // check only one select used to look up data subject
      const selects = logger._logs.debug.filter(
        l => typeof l === 'string' && l.match(/SELECT [Customers.]*ID FROM CRUDService_Customers/) // better-sqlite aliases customer
      )
      expect(selects.length).toBe(1)
    })

    test('delete comp of one', async () => {
      const response = await request(app)
        .delete('/crud/CustomerStatus(23d4a37a-6319-4d52-bb48-02fd06b9ffa4)')
        .auth('alice', 'password')
      expect(response).toMatchObject({ status: 204 })
      expect(_logs.length).toBe(4)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerStatus',
          id: { ID: '23d4a37a-6319-4d52-bb48-02fd06b9ffa4' }
        },
        data_subject,
        attributes: [
          { name: 'description', old: 'active', new: 'null' },
          { name: 'todo', old: 'send reminder', new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.StatusChange',
          id: { ID: '59d4a37a-6319-4d52-bb48-02fd06b9fbc2', secondKey: 'some value' }
        },
        data_subject,
        attributes: [{ name: 'description', old: 'new change', new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.LastOne',
          id: { ID: '74d4a37a-6319-4d52-bb48-02fd06b9f3r4' }
        },
        data_subject,
        attributes: [{ name: 'lastOneField', old: 'some last value', new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Notes',
          id: { ID: '35bdc8d0-dcaf-4727-9377-9ae693055555' }
        },
        data_subject,
        attributes: [{ name: 'note', old: 'initial status note', new: 'null' }]
      })
    })

    test('with atomicity group', async () => {
      let response

      response = await request(app)
        .get(
          `/crud/Customers(${customer_ID})?$expand=addresses($expand=attachments($expand=notes)),status($expand=change($expand=last),notes)`
        )
        .auth('alice', 'password')
      const oldAddresses = response.body.addresses
      const oldAttachments = response.body.addresses[0].attachments
      const oldStatus = response.body.status
      const oldChange = response.body.status.change
      const oldLast = response.body.status.change.last
      const oldAttachmentNotes = response.body.addresses[0].attachments[0].notes
      const oldStatusNote = response.body.status.notes[0]

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
            url: `/Customers(${customer_ID})`,
            headers: { 'content-type': 'application/json', 'odata-version': '4.0' },
            id: 'r3',
            atomicityGroup: 'g1',
            body: { status: null }
          }
        ]
      }
      response = await request(app).post('/crud/$batch').auth('alice', 'password').send(body)
      expect(response).toMatchObject({ status: 200 })
      expect(response.body.responses.every(r => r.status >= 200 && r.status < 300)).toBeTruthy()
      expect(_logs.length).toBe(10)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerPostalAddress',
          id: { ID: oldAddresses[0].ID }
        },
        data_subject,
        attributes: [
          { name: 'street', old: oldAddresses[0].street, new: 'null' },
          { name: 'town', old: oldAddresses[0].town, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.AddressAttachment',
          id: { ID: oldAttachments[0].ID }
        },
        data_subject,
        attributes: [
          { name: 'description', old: oldAttachments[0].description, new: 'null' },
          { name: 'todo', old: oldAttachments[0].todo, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.AddressAttachment',
          id: { ID: oldAttachments[1].ID }
        },
        data_subject,
        attributes: [
          { name: 'description', old: oldAttachments[1].description, new: 'null' },
          { name: 'todo', old: oldAttachments[1].todo, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerPostalAddress',
          id: { ID: oldAddresses[1].ID }
        },
        data_subject,
        attributes: [
          { name: 'street', old: oldAddresses[1].street, new: 'null' },
          { name: 'town', old: oldAddresses[1].town, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.CustomerStatus',
          id: { ID: oldStatus.ID }
        },
        data_subject,
        attributes: [
          { name: 'description', old: 'active', new: 'null' },
          { name: 'todo', old: 'send reminder', new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.StatusChange',
          id: { ID: oldChange.ID, secondKey: oldChange.secondKey }
        },
        data_subject,
        attributes: [{ name: 'description', old: 'new change', new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.LastOne',
          id: { ID: oldLast.ID }
        },
        data_subject,
        attributes: [{ name: 'lastOneField', old: 'some last value', new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Notes',
          id: { ID: oldAttachmentNotes[0].ID }
        },
        data_subject,
        attributes: [{ name: 'note', old: 'start', new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Notes',
          id: { ID: oldStatusNote.ID }
        },
        data_subject,
        attributes: [{ name: 'note', old: oldStatusNote.note, new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Customers',
          id: { ID: 'bcd4a37a-6319-4d52-bb48-02fd06b9ffe9' }
        },
        data_subject: {
          type: 'CRUDService.Customers',
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
              ID: customer_ID
            },
            note: 'positive'
          }
        },
        items: [
          {
            name: 'foo',
            customer: {
              ID: customer_ID
            }
          }
        ],
        misc: 'abc'
      }
      await request(app).post(`/crud/Orders`).send(order).auth('alice', 'password').expect(201)
      const {
        body: {
          header_ID,
          header: { sensitiveData },
          items
        }
      } = await request(app)
        .get(`/crud/Orders(${order.ID})?$expand=header($expand=sensitiveData),items`)
        .auth('alice', 'password')
      items.push({
        name: 'bar',
        customer: {
          ID: customer_ID
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
      logger._resetLogs()
      _logs = []
      await request(app).patch(`/crud/Orders(${order.ID})`).send(updatedOrder).auth('alice', 'password')
      expect(_logs.length).toBe(6)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Orders',
          id: { ID: order.ID }
        },
        data_subject,
        attributes: [{ name: 'misc', old: 'abc', new: 'IISSEE 123' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.OrderHeader',
          id: { ID: header_ID }
        },
        data_subject,
        attributes: [{ name: 'description', old: 'dummy', new: 'olala' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.OrderHeader.sensitiveData',
          id: { ID: sensitiveData.ID }
        },
        data_subject,
        attributes: [{ name: 'note', old: 'positive', new: 'negative' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Orders',
          id: { ID: order.ID }
        },
        data_subject,
        attributes: [{ name: 'misc' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.OrderHeader',
          id: { ID: header_ID }
        },
        data_subject,
        attributes: [{ name: 'description' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.OrderHeader.sensitiveData',
          id: { ID: sensitiveData.ID }
        },
        data_subject,
        attributes: [{ name: 'note' }]
      })
      await request(app).delete(`/crud/Orders(${order.ID})`).auth('alice', 'password').expect(204)
      expect(_logs.length).toBe(9)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Orders',
          id: { ID: order.ID }
        },
        data_subject,
        attributes: [{ name: 'misc', old: 'IISSEE 123', new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.OrderHeader',
          id: { ID: header_ID }
        },
        data_subject,
        attributes: [{ name: 'description', old: 'olala', new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.OrderHeader.sensitiveData',
          id: { ID: sensitiveData.ID }
        },
        data_subject,
        attributes: [{ name: 'note', old: 'negative', new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Orders',
          id: { ID: order.ID }
        },
        data_subject,
        attributes: [{ name: 'misc', old: 'abc', new: 'IISSEE 123' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.OrderHeader',
          id: { ID: header_ID }
        },
        data_subject,
        attributes: [{ name: 'description', old: 'dummy', new: 'olala' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.OrderHeader.sensitiveData',
          id: { ID: sensitiveData.ID }
        },
        data_subject,
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
      const response = await request(app).get('/crud/Customers').auth('alice', 'password')

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(1)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDService.Customers',
          id: { ID: customer_ID }
        },
        data_subject,
        attributes: [{ name: 'creditCardNo' }]
      })
    })

    test('read all Customers with avoid = true', async () => {
      _avoid = true

      const response = await request(app).get('/crud/Customers').auth('alice', 'password')

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(0)
    })
  })
})

xdescribe('personal data audit logging in draft enabled CRUD', () => {
  let app, _log, _logs

  const data_subject = {
    type: 'CRUDServiceDraft.Customers',
    role: 'Customer',
    id: { ID: customer_ID }
  }

  beforeAll(async () => {
    cds.env.features.audit_personal_data = true
    _log = global.console.log

    global.console.log = (...args) => {
      if (args.length !== 1 || !args[0].uuid) {
        // > not an audit log (most likely, anyway)
        return _log(...args)
      }

      // do not add log preps
      if (args[0].attributes && 'old' in args[0].attributes[0] && !args[0].success) return
      _logs.push(...args)
    }

    // crud service
    const auth = {
      kind: 'mocked-auth',
      users: { alice: { roles: ['admin'] } }
    }

    const crud = path.join(process.cwd(), '/audit/__resources__/bookshop/crud-draft.cds')
    app = await serve(crud, { auth })
  })

  afterAll(() => {
    delete cds.env.features.audit_personal_data
    global.console.log = _log
  })

  beforeEach(async () => {
    _logs = []
    await cds.run(inserts)
    logger._resetLogs()
  })

  afterEach(() => clear4())

  describe('data access logging for active draft enabled entities', () => {
    test('read with another data subject and sensitive data only in composition children', async () => {
      const { body: customer } = await request(app)
        .get(`/crud-draft-2/Customers(ID=${customer_ID},IsActiveEntity=true)?$expand=addresses`)
        .auth('alice', 'password')
      const addressID1 = customer.addresses[0].ID
      const addressID2 = customer.addresses[1].ID
      expect(_logs.length).toBe(2)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft2.CustomerPostalAddress',
          id: { ID: addressID1 }
        },
        data_subject: {
          type: 'CRUDServiceDraft2.CustomerPostalAddress',
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
          type: 'CRUDServiceDraft2.CustomerPostalAddress',
          id: { ID: addressID2 }
        },
        data_subject: {
          type: 'CRUDServiceDraft2.CustomerPostalAddress',
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
      const response = await request(app).get('/crud-draft/Customers').auth('alice', 'password')

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(1)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.Customers',
          id: { ID: customer_ID }
        },
        data_subject,
        attributes: [{ name: 'creditCardNo' }]
      })
    })

    test('read single Customer', async () => {
      const response = await request(app)
        .get(`/crud-draft/Customers(ID=${customer_ID},IsActiveEntity=true)`)
        .auth('alice', 'password')

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(1)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.Customers',
          id: { ID: customer_ID }
        },
        data_subject,
        attributes: [{ name: 'creditCardNo' }]
      })
    })

    test('read Customer expanding addresses and comments - comp of many', async () => {
      const response = await request(app)
        .get(
          `/crud-draft/Customers(ID=${customer_ID},IsActiveEntity=true)?$expand=addresses($expand=attachments),comments`
        )
        .auth('alice', 'password')

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(5)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.Customers',
          id: { ID: customer_ID }
        },
        data_subject,
        attributes: [{ name: 'creditCardNo' }]
      })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.CustomerPostalAddress',
          id: { ID: '1ab71292-ef69-4571-8cfb-10b9d5d1459e' }
        },
        data_subject,
        attributes: [{ name: 'street' }]
      })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.AddressAttachment',
          id: { ID: '3cd71292-ef69-4571-8cfb-10b9d5d1437e' }
        },
        data_subject,
        attributes: [{ name: 'description' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.AddressAttachment',
          id: { ID: '595225db-6eeb-4b4f-9439-dbe5fcb4ce5a' }
        },
        data_subject,
        attributes: [{ name: 'description' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.CustomerPostalAddress',
          id: { ID: '285225db-6eeb-4b4f-9439-dbe5fcb4ce82' }
        },
        data_subject,
        attributes: [{ name: 'street' }]
      })
    })

    test('read Customer expanding deep nested comp of one', async () => {
      const response = await request(app)
        .get(
          `/crud-draft/Customers(ID=${customer_ID},IsActiveEntity=true)?$expand=status($expand=change($expand=last))`
        )
        .auth('alice', 'password')
      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(4)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.Customers',
          id: { ID: customer_ID }
        },
        data_subject,
        attributes: [{ name: 'creditCardNo' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.CustomerStatus',
          id: { ID: '23d4a37a-6319-4d52-bb48-02fd06b9ffa4' }
        },
        data_subject,
        attributes: [{ name: 'description' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.StatusChange',
          id: { ID: '59d4a37a-6319-4d52-bb48-02fd06b9fbc2', secondKey: 'some value' }
        },
        data_subject,
        attributes: [{ name: 'description' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.LastOne',
          id: { ID: '74d4a37a-6319-4d52-bb48-02fd06b9f3r4' }
        },
        data_subject,
        attributes: [{ name: 'lastOneField' }]
      })
    })

    test('read all CustomerStatus', async () => {
      const response = await request(app).get('/crud-draft/CustomerStatus').auth('alice', 'password')
      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(1)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.CustomerStatus',
          id: { ID: '23d4a37a-6319-4d52-bb48-02fd06b9ffa4' }
        },
        data_subject,
        attributes: [{ name: 'description' }]
      })
    })

    test('read all CustomerPostalAddress', async () => {
      const response = await request(app).get('/crud-draft/CustomerPostalAddress').auth('alice', 'password')

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(2)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.CustomerPostalAddress',
          id: { ID: '1ab71292-ef69-4571-8cfb-10b9d5d1459e' }
        },
        data_subject,
        attributes: [{ name: 'street' }]
      })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.CustomerPostalAddress',
          id: { ID: '285225db-6eeb-4b4f-9439-dbe5fcb4ce82' }
        },
        data_subject,
        attributes: [{ name: 'street' }]
      })
    })

    test('read all CustomerPostalAddress expanding Customer', async () => {
      const response = await request(app)
        .get('/crud-draft/CustomerPostalAddress?$expand=customer')
        .auth('alice', 'password')

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(3)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.Customers',
          id: { ID: customer_ID }
        },
        data_subject,
        attributes: [{ name: 'creditCardNo' }]
      })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.CustomerPostalAddress',
          id: { ID: '1ab71292-ef69-4571-8cfb-10b9d5d1459e' }
        },
        data_subject,
        attributes: [{ name: 'street' }]
      })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.CustomerPostalAddress',
          id: { ID: '285225db-6eeb-4b4f-9439-dbe5fcb4ce82' }
        },
        data_subject,
        attributes: [{ name: 'street' }]
      })
    })

    test('draft union', async () => {
      const response = await request(app)
        .get('/crud-draft/Customers?$filter=(IsActiveEntity eq false or SiblingEntity/IsActiveEntity eq null)')
        .auth('alice', 'password')

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(1)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.Customers',
          id: { ID: customer_ID }
        },
        data_subject,
        attributes: [{ name: 'creditCardNo' }]
      })
    })
  })

  describe('modification and read draft logging', () => {
    test('draft edit, patch and activate with another data subject and sensitive data only in composition children', async () => {
      await request(app)
        .post(`/crud-draft-2/Customers(ID=${customer_ID},IsActiveEntity=true)/draftEdit`)
        .auth('alice', 'password')
        .send({})
      const { body: customer } = await request(app)
        .get(`/crud-draft-2/Customers(ID=${customer_ID},IsActiveEntity=false)?$expand=addresses`)
        .auth('alice', 'password')
      const addressID = customer.addresses[0].ID
      await request(app)
        .patch(
          `/crud-draft-2/Customers(ID=${customer_ID},IsActiveEntity=false)/addresses(ID=${addressID},IsActiveEntity=false)`
        )
        .auth('alice', 'password')
        .send({
          street: 'updated',
          town: 'updated town'
        })
      const response = await request(app)
        .post(`/crud-draft-2/Customers(ID=${customer_ID},IsActiveEntity=false)/draftActivate`)
        .auth('alice', 'password')
        .send({})

      expect(response).toMatchObject({ status: 201 })
      expect(_logs.length).toBe(cds.env.fiori.lean_draft ? 3 : 1)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft2.CustomerPostalAddress',
          id: { ID: addressID }
        },
        data_subject: {
          type: 'CRUDServiceDraft2.CustomerPostalAddress',
          role: 'Address',
          id: {
            ID: addressID,
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

      let response = await request(app).post('/crud-draft/Customers').auth('alice', 'password').send({})

      expect(response).toMatchObject({ status: 201 })
      customer.ID = response.body.ID
      expect(_logs.length).toBe(0)

      response = await request(app)
        .patch(`/crud-draft/Customers(ID=${customer.ID},IsActiveEntity=false)`)
        .auth('alice', 'password')
        .send(customer)

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(0)

      response = await request(app)
        .get(`/crud-draft/Customers(ID=${customer.ID},IsActiveEntity=false)`)
        .auth('alice', 'password')

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(0)

      response = await request(app)
        .post(`/crud-draft/Customers(ID=${customer.ID},IsActiveEntity=false)/CRUDServiceDraft.draftActivate`)
        .auth('alice', 'password')
        .send({})

      expect(_logs.length).toBe(2)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.Customers',
          id: { ID: customer.ID }
        },
        data_subject: {
          type: 'CRUDServiceDraft.Customers',
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
          type: 'CRUDServiceDraft.Customers',
          id: { ID: customer.ID }
        },
        data_subject: {
          type: 'CRUDServiceDraft.Customers',
          role: 'Customer',
          id: { ID: customer.ID }
        },
        attributes: [{ name: 'creditCardNo' }]
      })
    })

    test('draft edit, read union, delete draft', async () => {
      let response = await request(app)
        .post(
          `/crud-draft/Customers(ID=bcd4a37a-6319-4d52-bb48-02fd06b9ffe9,IsActiveEntity=true)/CRUDServiceDraft.draftEdit`
        )
        .auth('alice', 'password')
        .send({ PreserveChanges: true })

      expect(response).toMatchObject({ status: 201 })
      expect(_logs.length).toBe(cds.env.fiori.lean_draft ? 10 : 0) // REVISIT: Read active personal data will be logged after using expand ** in edit.js

      response = await request(app)
        .get('/crud-draft/Customers?$filter=(IsActiveEntity eq false or SiblingEntity/IsActiveEntity eq null)')
        .auth('alice', 'password')

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(cds.env.fiori.lean_draft ? 11 : 0)

      response = await request(app)
        .delete(`/crud-draft/Customers(ID=${customer_ID},IsActiveEntity=false)`)
        .auth('alice', 'password')

      expect(response).toMatchObject({ status: 204 })
      expect(_logs.length).toBe(cds.env.fiori.lean_draft ? 11 : 0)
    })

    test('draft edit, patch and activate', async () => {
      let response = await request(app)
        .post(
          `/crud-draft/Customers(ID=bcd4a37a-6319-4d52-bb48-02fd06b9ffe9,IsActiveEntity=true)/CRUDServiceDraft.draftEdit`
        )
        .auth('alice', 'password')
        .send({ PreserveChanges: true })

      expect(response).toMatchObject({ status: 201 })
      expect(_logs.length).toBe(cds.env.fiori.lean_draft ? 10 : 0) // REVISIT: Read active personal data will be logged after using expand ** in edit.js

      const customer = {
        ID: response.body.ID,
        emailAddress: 'bla@blub.com',
        firstName: 'bla',
        lastName: 'blub',
        creditCardNo: '98765',
        someOtherField: 'dummy'
      }

      response = await request(app)
        .patch(`/crud-draft/Customers(ID=${customer.ID},IsActiveEntity=false)`)
        .auth('alice', 'password')
        .send(customer)

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(cds.env.fiori.lean_draft ? 10 : 0)

      response = await request(app)
        .post(`/crud-draft/Customers(ID=${customer.ID},IsActiveEntity=false)/CRUDServiceDraft.draftActivate`)
        .auth('alice', 'password')
        .send({})

      expect(_logs.length).toBe(cds.env.fiori.lean_draft ? 12 : 2)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.Customers',
          id: { ID: customer.ID }
        },
        data_subject: {
          type: 'CRUDServiceDraft.Customers',
          role: 'Customer',
          id: { ID: customer.ID }
        },
        attributes: [
          { name: 'emailAddress', old: 'foo@bar.com', new: customer.emailAddress },
          { name: 'firstName', old: 'foo', new: customer.firstName },
          { name: 'lastName', old: 'bar', new: customer.lastName },
          { name: 'creditCardNo', old: '12345', new: customer.creditCardNo }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.Customers',
          id: { ID: customer.ID }
        },
        data_subject: {
          type: 'CRUDServiceDraft.Customers',
          role: 'Customer',
          id: { ID: customer.ID }
        },
        attributes: [{ name: 'creditCardNo' }]
      })
    })

    test('create, patch, and activate - deep', async () => {
      let response = await request(app).post('/crud-draft/Customers').auth('alice', 'password').send({})

      expect(response).toMatchObject({ status: 201 })
      expect(_logs.length).toBe(0)

      const customer = {
        ID: response.body.ID,
        emailAddress: 'bla@blub.com',
        firstName: 'bla',
        lastName: 'blub',
        creditCardNo: '98765',
        someOtherField: 'dummy'
      }
      response = await request(app)
        .patch(`/crud-draft/Customers(ID=${customer.ID},IsActiveEntity=false)`)
        .auth('alice', 'password')
        .send(customer)

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(0)

      response = await request(app)
        .post(`/crud-draft/Customers(ID=${customer.ID},IsActiveEntity=false)/addresses`)
        .auth('alice', 'password')
        .send({})

      expect(response).toMatchObject({ status: 201 })
      expect(_logs.length).toBe(0)

      const address = {
        ID: response.body.ID,
        street: 'A1',
        town: 'Monnem',
        someOtherField: 'Beschde'
      }

      response = await request(app)
        .patch(
          `/crud-draft/Customers(ID=${customer.ID},IsActiveEntity=false)/addresses(ID=${address.ID},IsActiveEntity=false)`
        )
        .auth('alice', 'password')
        .send(address)

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(0)

      response = await request(app)
        .post(`/crud-draft/Customers(ID=${customer.ID},IsActiveEntity=false)/CRUDServiceDraft.draftActivate`)
        .auth('alice', 'password')
        .send({})

      const data_subject = {
        type: 'CRUDServiceDraft.Customers',
        role: 'Customer',
        id: { ID: customer.ID }
      }

      expect(_logs.length).toBe(3)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.Customers',
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
          type: 'CRUDServiceDraft.Customers',
          id: { ID: customer.ID }
        },
        data_subject: {
          type: 'CRUDServiceDraft.Customers',
          role: 'Customer',
          id: { ID: customer.ID }
        },
        attributes: [{ name: 'creditCardNo' }]
      })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.CustomerPostalAddress',
          id: { ID: address.ID }
        },
        data_subject,
        attributes: [
          { name: 'street', old: 'null', new: address.street },
          { name: 'town', old: 'null', new: address.town }
        ]
      })
    })

    test('delete active Customer - deep', async () => {
      let response = await request(app)
        .get(
          `/crud-draft/Customers(ID=${customer_ID},IsActiveEntity=true)?$expand=addresses($expand=attachments),status($expand=change($expand=last)),comments`
        )
        .auth('alice', 'password')

      const oldAddresses = response.body.addresses
      const oldAttachments = response.body.addresses[0].attachments
      const oldStatus = response.body.status
      const oldChange = response.body.status.change
      const oldLast = response.body.status.change.last

      // reset logs
      _logs = []
      logger._resetLogs()

      response = await request(app)
        .delete(`/crud-draft/Customers(ID=${customer_ID},IsActiveEntity=true)`)
        .auth('alice', 'password')

      expect(response).toMatchObject({ status: 204 })
      expect(_logs.length).toBe(10)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.Customers',
          id: { ID: customer_ID }
        },
        data_subject,
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
          type: 'CRUDServiceDraft.CustomerPostalAddress',
          id: { ID: oldAddresses[0].ID }
        },
        data_subject,
        attributes: [
          { name: 'street', old: oldAddresses[0].street, new: 'null' },
          { name: 'town', old: oldAddresses[0].town, new: 'null' }
        ]
      })

      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.AddressAttachment',
          id: { ID: oldAttachments[0].ID }
        },
        data_subject,
        attributes: [
          { name: 'description', old: oldAttachments[0].description, new: 'null' },
          { name: 'todo', old: oldAttachments[0].todo, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.AddressAttachment',
          id: { ID: oldAttachments[1].ID }
        },
        data_subject,
        attributes: [
          { name: 'description', old: oldAttachments[1].description, new: 'null' },
          { name: 'todo', old: oldAttachments[1].todo, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.CustomerPostalAddress',
          id: { ID: oldAddresses[1].ID }
        },
        data_subject,
        attributes: [
          { name: 'street', old: oldAddresses[1].street, new: 'null' },
          { name: 'town', old: oldAddresses[1].town, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.CustomerStatus',
          id: { ID: oldStatus.ID }
        },
        data_subject,
        attributes: [
          { name: 'description', old: 'active', new: 'null' },
          { name: 'todo', old: 'send reminder', new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.StatusChange',
          id: { ID: oldChange.ID, secondKey: oldChange.secondKey }
        },
        data_subject,
        attributes: [{ name: 'description', old: 'new change', new: 'null' }]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.LastOne',
          id: { ID: oldLast.ID }
        },
        data_subject,
        attributes: [{ name: 'lastOneField', old: 'some last value', new: 'null' }]
      })

      const selects = logger._logs.debug.filter(
        l => typeof l === 'string' && l.match(/SELECT [Customers.]*ID FROM CRUDServiceDraft_Customers/) // better-sqlite aliases customer
      )
      expect(selects.length).toBe(1)
    })

    test('with atomicity group', async () => {
      let response = await request(app)
        .get(
          `/crud-draft/Customers(ID=${customer_ID},IsActiveEntity=true)?$expand=addresses($expand=attachments($expand=notes)),status($expand=change($expand=last),notes)`
        )
        .auth('alice', 'password')
      const oldAddresses = response.body.addresses
      const oldAttachments = response.body.addresses[0].attachments
      const oldAttachmentNotes = response.body.addresses[0].attachments[0].notes

      // reset logs
      _logs = []

      response = await request(app)
        .post(
          `/crud-draft/Customers(ID=bcd4a37a-6319-4d52-bb48-02fd06b9ffe9,IsActiveEntity=true)/CRUDServiceDraft.draftEdit`
        )
        .auth('alice', 'password')
        .send({ PreserveChanges: true })

      expect(response).toMatchObject({ status: 201 })
      expect(_logs.length).toBe(cds.env.fiori.lean_draft ? 10 : 0) // REVISIT: Read active personal data will be logged after using expand ** in edit.js

      response = await request(app)
        .patch(`/crud-draft/Customers(ID=bcd4a37a-6319-4d52-bb48-02fd06b9ffe9,IsActiveEntity=false)`)
        .auth('alice', 'password')
        .send({ status: null })

      expect(response).toMatchObject({ status: 200 })
      expect(_logs.length).toBe(cds.env.fiori.lean_draft ? 10 : 0)

      const body = {
        requests: [
          {
            method: 'POST',
            url: `/Customers(ID=bcd4a37a-6319-4d52-bb48-02fd06b9ffe9,IsActiveEntity=false)/CRUDServiceDraft.draftActivate`,
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
      response = await request(app).post('/crud-draft/$batch').auth('alice', 'password').send(body)
      expect(response).toMatchObject({ status: 200 })
      expect(response.body.responses.every(r => r.status >= 200 && r.status < 300)).toBeTruthy()
      expect(_logs.length).toBe(cds.env.fiori.lean_draft ? 21 : 7)
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.CustomerPostalAddress',
          id: { ID: oldAddresses[0].ID }
        },
        data_subject,
        attributes: [
          { name: 'street', old: oldAddresses[0].street, new: 'null' },
          { name: 'town', old: oldAddresses[0].town, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.AddressAttachment',
          id: { ID: oldAttachments[0].ID }
        },
        data_subject,
        attributes: [
          { name: 'description', old: oldAttachments[0].description, new: 'null' },
          { name: 'todo', old: oldAttachments[0].todo, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.AddressAttachment',
          id: { ID: oldAttachments[1].ID }
        },
        data_subject,
        attributes: [
          { name: 'description', old: oldAttachments[1].description, new: 'null' },
          { name: 'todo', old: oldAttachments[1].todo, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.CustomerPostalAddress',
          id: { ID: oldAddresses[1].ID }
        },
        data_subject,
        attributes: [
          { name: 'street', old: oldAddresses[1].street, new: 'null' },
          { name: 'town', old: oldAddresses[1].town, new: 'null' }
        ]
      })
      expect(_logs).toContainMatchObject({
        user: 'alice',
        object: {
          type: 'CRUDServiceDraft.Notes',
          id: { ID: oldAttachmentNotes[0].ID }
        },
        data_subject,
        attributes: [{ name: 'note', old: 'start', new: 'null' }]
      })
    })
  })
})
