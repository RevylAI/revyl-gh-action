const core = require('@actions/core')
const httpm = require('@actions/http-client')
const main = require('../src/main')

jest.mock('@actions/core')
jest.mock('@actions/http-client')

describe('run function', () => {
  let mockHttpClient

  beforeEach(() => {
    jest.clearAllMocks()

    mockHttpClient = {
      postJson: jest.fn()
    }
    httpm.HttpClient.mockReturnValue(mockHttpClient)
  })

  it('should throw an error if REVYL_API_KEY is not set', async () => {
    await main.run()
    expect(core.setFailed).toHaveBeenCalledWith(
      'Missing REVYL_API_KEY get API token from revyl settings'
    )
  })

  it('should call setFailed if the API request fails', async () => {
    process.env['REVYL_API_KEY'] = 'test-token'
    core.getInput.mockReturnValue('test-id')
    mockHttpClient.postJson.mockResolvedValue({
      message: {
        statusCode: 400,
        result: 'FAiled'
      }
    })

    await main.run()

    expect(core.setFailed).toHaveBeenCalledWith(
      'Failed to run test: API returned status code undefined'
    )
  })

  it('should not throw an error if the API request is successful', async () => {
    process.env['REVYL_API_KEY'] = 'test-token'
    core.getInput.mockReturnValue('test-id')
    mockHttpClient.postJson.mockResolvedValue({
      statusCode: 200,
      result: {
        success: true,
        result: {
          success: true
        }
      }
    })

    await expect(main.run()).resolves.not.toThrow()

    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('should use COGNISIM_DEVICE_URL as the endpoint if set', async () => {
    const customUrl = 'https://device-staging.cognisim.io/execute_test_id'
    process.env['REVYL_API_KEY'] = 'test-token'
    core.getInput.mockReturnValueOnce('test-id')
    core.getInput.mockReturnValueOnce(customUrl)

    mockHttpClient.postJson.mockResolvedValue({
      statusCode: 200,
      result: {
        success: true
      }
    })

    await main.run()

    expect(mockHttpClient.postJson).toHaveBeenCalledWith(
      customUrl,
      expect.anything()
    )
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  // Clean up environment variables after each test
  afterEach(() => {
    delete process.env['REVYL_API_KEY']
  })
})
