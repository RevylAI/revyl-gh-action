// Mock EventSource to immediately emit completion events
jest.mock('eventsource', () => {
  return jest.fn().mockImplementation(function () {
    this.listeners = {}
    this.addEventListener = (type, cb) => {
      this.listeners[type] = cb
    }
    setImmediate(() => {
      if (this.onopen) this.onopen()
      if (this.listeners['connection_ready']) {
        this.listeners['connection_ready']({
          data: JSON.stringify({ org_id: 'org_123' })
        })
      }
      const ev = global.__MOCK_EVENT__ || 'test_completed'
      const taskId = global.__MOCK_TASK_ID__ || 'task_1'
      if (ev === 'test_completed' && this.listeners['test_completed']) {
        this.listeners['test_completed']({
          data: JSON.stringify({ task_id: taskId, test_name: 'Sample' })
        })
      }
      if (ev === 'workflow_completed' && this.listeners['workflow_completed']) {
        this.listeners['workflow_completed']({
          data: JSON.stringify({
            task_id: taskId,
            workflow_results: {
              total_tests: 2,
              completed_tests: 2,
              passed_tests: 2,
              failed_tests: 0
            }
          })
        })
      }
    })
    this.close = () => {}
  })
}, { virtual: true })

// Mock node-fetch to avoid real dependency resolution
jest.mock('node-fetch', () => {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ shareable_link: 'https://example.com/report' })
  })
}, { virtual: true })

describe('run function', () => {
  let mockHttpClient
  let core
  let httpm

  beforeEach(() => {
    jest.clearAllMocks()

    jest.resetModules()

    // Provide virtual mocks for core and http-client before requiring main
    jest.mock('@actions/core', () => ({
      getInput: jest.fn(),
      setFailed: jest.fn(),
      setOutput: jest.fn(),
      startGroup: jest.fn(),
      endGroup: jest.fn(),
      notice: jest.fn(),
      info: jest.fn(),
      warning: jest.fn(),
      error: jest.fn(),
      summary: {
        addHeading: jest.fn().mockReturnThis(),
        addRaw: jest.fn().mockReturnThis(),
        write: jest.fn().mockResolvedValue(undefined)
      }
    }), { virtual: true })

    mockHttpClient = {
      postJson: jest.fn(),
      getJson: jest.fn()
    }
    jest.mock('@actions/http-client', () => ({
      HttpClient: jest.fn(() => mockHttpClient)
    }), { virtual: true })

    core = require('@actions/core')
    httpm = require('@actions/http-client')
    jest.isMockFunction(httpm.HttpClient)

    // Now require main after mocks are set up (done per test)
  })

  it('fails if neither test-id nor workflow-id is provided', async () => {
    process.env['REVYL_API_KEY'] = 'test-token'
    core.getInput.mockImplementation(name => {
      const map = {
        'test-id': null,
        'workflow-id': null,
        retries: '0',
        'build-version-id': null,
        timeout: '5'
      }
      return map[name]
    })

    const main = require('../src/main')
    await main.run()

    expect(core.setFailed).toHaveBeenCalledWith(
      'Either test-id or workflow-id must be provided'
    )
  })

  it('fails if both test-id and workflow-id are provided', async () => {
    process.env['REVYL_API_KEY'] = 'test-token'
    core.getInput.mockImplementation(name => {
      const map = {
        'test-id': 'test_1',
        'workflow-id': 'wf_1',
        retries: '0',
        'build-version-id': null,
        timeout: '5'
      }
      return map[name]
    })

    const main = require('../src/main')
    await main.run()

    expect(core.setFailed).toHaveBeenCalledWith(
      'Cannot provide both test-id and workflow-id'
    )
  })

  it('fails if REVYL_API_KEY is not set', async () => {
    const main = require('../src/main')
    await main.run()
    expect(core.setFailed).toHaveBeenCalledWith(
      'Missing REVYL_API_KEY get API token from revyl settings'
    )
  })

  it('queues and completes a test by test-id', async () => {
    process.env['REVYL_API_KEY'] = 'test-token'
    const taskId = 'task_test_123'
    global.__MOCK_TASK_ID__ = taskId
    global.__MOCK_EVENT__ = 'test_completed'

    core.getInput.mockImplementation(name => {
      const map = {
        'test-id': 'test_123',
        'workflow-id': null,
        retries: '0',
        'build-version-id': null,
        timeout: '5'
      }
      return map[name]
    })

    mockHttpClient.postJson.mockResolvedValue({
      statusCode: 200,
      result: { task_id: taskId }
    })

    const main = require('../src/main')
    await main.run()

    expect(mockHttpClient.postJson).toHaveBeenCalledWith(
      'https://device.cognisim.io/api/execute_test_id_async',
      expect.any(Object)
    )
    expect(core.setOutput).toHaveBeenCalledWith('task_id', taskId)
    expect(core.setOutput).toHaveBeenCalledWith('success', 'true')
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('queues and completes a workflow by workflow-id', async () => {
    process.env['REVYL_API_KEY'] = 'test-token'
    const taskId = 'task_wf_123'
    global.__MOCK_TASK_ID__ = taskId
    global.__MOCK_EVENT__ = 'workflow_completed'

    core.getInput.mockImplementation(name => {
      const map = {
        'test-id': null,
        'workflow-id': 'wf_123',
        retries: '0',
        'build-version-id': null,
        timeout: '5'
      }
      return map[name]
    })

    mockHttpClient.postJson.mockResolvedValue({
      statusCode: 200,
      result: { task_id: taskId }
    })

    const main = require('../src/main')
    await main.run()

    expect(mockHttpClient.postJson).toHaveBeenCalledWith(
      'https://device.cognisim.io/api/execute_workflow_id_async',
      expect.any(Object)
    )
    expect(core.setOutput).toHaveBeenCalledWith('task_id', taskId)
    expect(core.setOutput).toHaveBeenCalledWith('success', 'true')
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('fails if API request returns non-200', async () => {
    process.env['REVYL_API_KEY'] = 'test-token'
    core.getInput.mockImplementation(name => {
      const map = {
        'test-id': 'test_123',
        'workflow-id': null,
        retries: '0',
        'build-version-id': null,
        timeout: '5'
      }
      return map[name]
    })

    mockHttpClient.postJson.mockResolvedValue({ statusCode: 500, result: {} })

    const main = require('../src/main')
    await main.run()

    expect(core.setFailed).toHaveBeenCalledWith(
      'Failed to queue test: API returned status code 500'
    )
  })

  it('fails if task_id missing in API response', async () => {
    process.env['REVYL_API_KEY'] = 'test-token'
    core.getInput.mockImplementation(name => {
      const map = {
        'test-id': 'test_123',
        'workflow-id': null,
        retries: '0',
        'build-version-id': null,
        timeout: '5'
      }
      return map[name]
    })

    mockHttpClient.postJson.mockResolvedValue({ statusCode: 200, result: {} })

    const main = require('../src/main')
    await main.run()

    expect(core.setFailed).toHaveBeenCalledWith(
      'Failed to queue test: task_id missing in API response'
    )
  })

  afterEach(() => {
    delete process.env['REVYL_API_KEY']
    delete global.__MOCK_TASK_ID__
    delete global.__MOCK_EVENT__
  })
})
