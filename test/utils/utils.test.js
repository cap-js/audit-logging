const path = require('path')
const { loadVCAPServices } = require('../../lib/utils')

jest.mock('fs', () => ({
  readFileSync: jest.fn()
}))

const fs = require('fs')

describe('Test loadVCAPServices', () => {
  const ORIGINAL_ENV = process.env
  const FAKE_VCAP = { 'user-provided': [{ name: 'test', credentials: { token: 'abc' } }] }
  const INVALID_JSON = 'invalid json'
  const FAKE_PATH = '/path/to/vcap.json'

  beforeEach(() => {
    delete process.env.VCAP_SERVICES_FILE_PATH
    delete process.env.VCAP_SERVICES

    jest.clearAllMocks()
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  test('loads and parses VCAP_SERVICES from VCAP_SERVICES_FILE_PATH', () => {
    process.env.VCAP_SERVICES_FILE_PATH = FAKE_PATH

    fs.readFileSync.mockReturnValueOnce(JSON.stringify(FAKE_VCAP))

    const result = loadVCAPServices()

    expect(fs.readFileSync).toHaveBeenCalledWith(path.resolve(FAKE_PATH), 'utf8')
    expect(result).toEqual(FAKE_VCAP)
  })

  test('throws error when reading VCAP_SERVICES_FILE_PATH fails', () => {
    const errorMessage = 'ENOENT: no such file or directory'
    process.env.VCAP_SERVICES_FILE_PATH = FAKE_PATH

    fs.readFileSync.mockImplementationOnce(() => {
      const err = new Error(errorMessage)
      err.code = 'ENOENT'
      throw err
    })

    expect(() => loadVCAPServices()).toThrow(
      `Failed to read or parse VCAP_SERVICES from file at ${FAKE_PATH}: ${errorMessage}`
    )
  })

  test('throws error when JSON in VCAP_SERVICES_FILE_PATH is invalid', () => {
    process.env.VCAP_SERVICES_FILE_PATH = FAKE_PATH

    fs.readFileSync.mockReturnValueOnce(INVALID_JSON)

    expect(() => loadVCAPServices()).toThrow(
      new RegExp(`^Failed to read or parse VCAP_SERVICES from file at ${FAKE_PATH}:`)
    )
  })

  test('loads and parses VCAP_SERVICES from environment variable', () => {
    process.env.VCAP_SERVICES = JSON.stringify(FAKE_VCAP)

    const result = loadVCAPServices()

    expect(result).toEqual(FAKE_VCAP)
    expect(fs.readFileSync).not.toHaveBeenCalled()
  })

  test('throws error when VCAP_SERVICES env var JSON is invalid', () => {
    process.env.VCAP_SERVICES = INVALID_JSON

    expect(() => loadVCAPServices()).toThrow(new RegExp(`^Failed to parse VCAP_SERVICES from environment variable:`))
    expect(fs.readFileSync).not.toHaveBeenCalled()
  })

  test('returns empty object when neither VCAP_SERVICES_FILE_PATH nor VCAP_SERVICES is set', () => {
    const result = loadVCAPServices()

    expect(result).toEqual({})
    expect(fs.readFileSync).not.toHaveBeenCalled()
  })

  test('VCAP_SERVICES_FILE_PATH takes precedence over VCAP_SERVICES', () => {
    const fromFile = { from: 'file' }
    const fromEnv = { from: 'env' }

    process.env.VCAP_SERVICES_FILE_PATH = FAKE_PATH
    process.env.VCAP_SERVICES = JSON.stringify(fromEnv)

    fs.readFileSync.mockReturnValueOnce(JSON.stringify(fromFile))

    const result = loadVCAPServices()

    expect(result).toEqual(fromFile)
    expect(fs.readFileSync).toHaveBeenCalledTimes(1)
  })
})
