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

  it('should throw an error if neither test-id nor workflow-id is provided', async () => {
    process.env['REVYL_API_KEY'] = 'test-token'
    core.getInput.mockReturnValueOnce(null) // test-id
    core.getInput.mockReturnValueOnce(null) // workflow-id

    await main.run()

    expect(core.setFailed).toHaveBeenCalledWith(
      'Either test-id or workflow-id must be provided'
    )
  })

  it('should throw an error if both test-id and workflow-id are provided', async () => {
    process.env['REVYL_API_KEY'] = 'test-token'
    core.getInput.mockReturnValueOnce('test-id') // test-id
    core.getInput.mockReturnValueOnce('workflow-id') // workflow-id

    await main.run()

    expect(core.setFailed).toHaveBeenCalledWith(
      'Cannot provide both test-id and workflow-id'
    )
  })

  it('should throw an error if REVYL_API_KEY is not set', async () => {
    await main.run()
    expect(core.setFailed).toHaveBeenCalledWith(
      'Missing REVYL_API_KEY get API token from revyl settings'
    )
  })

  it('should call setFailed if the API request fails', async () => {
    process.env['REVYL_API_KEY'] = 'test-token'
    core.getInput.mockReturnValueOnce('test-id') // test-id
    core.getInput.mockReturnValueOnce(null) // workflow-id
    mockHttpClient.postJson.mockResolvedValue({
      statusCode: 400,
      result: 'Failed'
    })

    await main.run()

    expect(core.setFailed).toHaveBeenCalledWith(
      'Failed to run test: API returned status code 400'
    )
  })

  it('should not throw an error if the API request is successful', async () => {
    process.env['REVYL_API_KEY'] = 'test-token'
    core.getInput.mockReturnValueOnce('test-id') // test-id
    core.getInput.mockReturnValueOnce(null) // workflow-id
    mockHttpClient.postJson.mockResolvedValue({
      statusCode: 200,
      result: {
        success: true
      }
    })

    await expect(main.run()).resolves.not.toThrow()

    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('should use the provided device URL if set', async () => {
    const customUrl = 'https://device-staging.cognisim.io/execute_test_id'
    process.env['REVYL_API_KEY'] = 'test-token'
    core.getInput.mockReturnValueOnce('test-id') // test-id
    core.getInput.mockReturnValueOnce(null) // workflow-id
    core.getInput.mockReturnValueOnce(customUrl) // deviceUrl

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
