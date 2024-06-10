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

  it('should throw an error if COGNISIM_API_TOKEN is not set', async () => {
    await main.run()
    expect(core.setFailed).toHaveBeenCalledWith(
      'Missing COGNISIM_API_TOKEN get API token from cognisim settings'
    )
  })

  it('should call setFailed if the API request fails', async () => {
    process.env['COGNISIM_API_TOKEN'] = 'test-token'
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
    process.env['COGNISIM_API_TOKEN'] = 'test-token'
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
    const customUrl = 'https://custom.endpoint.com';
    process.env['COGNISIM_API_TOKEN'] = 'test-token';
    process.env['COGNISIM_DEVICE_URL'] = customUrl;
    core.getInput.mockReturnValue('test-id');
    mockHttpClient.postJson.mockResolvedValue({
      statusCode: 200,
      result: {
        success: true
      }
    });

    await main.run();

    expect(mockHttpClient.postJson).toHaveBeenCalledWith(customUrl, expect.anything());
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  // Clean up environment variables after each test
  afterEach(() => {
    delete process.env['COGNISIM_API_TOKEN'];
    delete process.env['COGNISIM_DEVICE_URL'];
  });
});

