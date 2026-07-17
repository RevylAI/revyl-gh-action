const { run, collectGithubActionsMetadata } = require('../src/main')
const core = require('@actions/core')
const httm = require('@actions/http-client')
const fs = require('fs')

// Mock the modules
jest.mock('@actions/core')
jest.mock('@actions/http-client')
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  createReadStream: jest.fn(),
  constants: {
    O_RDONLY: 0,
    O_WRONLY: 1,
    O_RDWR: 2,
    O_CREAT: 64,
    O_EXCL: 128,
    O_TRUNC: 512,
    O_APPEND: 1024
  },
  promises: {
    access: jest.fn(),
    writeFile: jest.fn(),
    readFile: jest.fn(),
    mkdir: jest.fn(),
    stat: jest.fn(),
    readdir: jest.fn(),
    rmdir: jest.fn(),
    unlink: jest.fn(),
    chmod: jest.fn(),
    copyFile: jest.fn()
  }
}))

describe('Upload Build Action', () => {
  let mockClient
  let mockPostJson
  let mockGetJson
  let mockSendStream

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks()

    // Setup mock client
    mockPostJson = jest.fn()
    mockGetJson = jest.fn()
    mockSendStream = jest.fn()
    mockClient = {
      postJson: mockPostJson,
      getJson: mockGetJson,
      sendStream: mockSendStream
    }
    httm.HttpClient.mockImplementation(() => mockClient)

    // Mock core functions
    core.getInput = jest.fn()
    core.setOutput = jest.fn()
    core.setFailed = jest.fn()
    core.info = jest.fn()
    core.warning = jest.fn()

    // Mock environment
    process.env.REVYL_API_KEY = 'test-api-key'
  })

  afterEach(() => {
    delete process.env.REVYL_API_KEY
    delete process.env.GITHUB_ACTIONS
    delete process.env.GITHUB_REPOSITORY
    delete process.env.GITHUB_RUN_ID
    delete process.env.GITHUB_SHA
    delete process.env.GITHUB_REF_NAME
    delete process.env.GITHUB_EVENT_PATH
    delete process.env.GITHUB_RUN_NUMBER
    delete process.env.GITHUB_RUN_ATTEMPT
  })

  test('should fail when no API key is provided', async () => {
    delete process.env.REVYL_API_KEY

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      'Missing REVYL_API_KEY - get API token from revyl settings'
    )
  })

  test('should fail when neither file-path nor expo-url is provided', async () => {
    core.getInput.mockImplementation(name => {
      const inputs = {
        'build-var-id': 'test-build-var-id',
        version: '1.0.0'
      }
      return inputs[name] || ''
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      'Either file-path or expo-url must be provided'
    )
  })

  test('should fail when both file-path and expo-url are provided', async () => {
    core.getInput.mockImplementation(name => {
      const inputs = {
        'build-var-id': 'test-build-var-id',
        version: '1.0.0',
        'file-path': '/path/to/file.apk',
        'expo-url': 'https://expo.dev/build/123'
      }
      return inputs[name] || ''
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      'Cannot provide both file-path and expo-url - they are mutually exclusive'
    )
  })

  test('should successfully upload from Expo URL', async () => {
    core.getInput.mockImplementation(name => {
      const inputs = {
        'build-var-id': 'test-build-var-id',
        version: '1.0.0',
        'expo-url': 'https://expo.dev/build/123',
        'backend-url': 'https://backend.revyl.ai'
      }
      return inputs[name] || ''
    })

    mockPostJson.mockResolvedValue({
      statusCode: 200,
      result: {
        id: 'version-123',
        artifact_url: 's3://bucket/path/to/artifact',
        metadata: { package_id: 'com.example.app' }
      }
    })

    await run()

    expect(mockPostJson).toHaveBeenCalledWith(
      'https://backend.revyl.ai/api/v1/apps/test-build-var-id/builds/from-url',
      {
        version: '1.0.0',
        from_url: 'https://expo.dev/build/123',
        headers: {},
        metadata: {}
      }
    )
    expect(core.setOutput).toHaveBeenCalledWith('success', 'true')
    expect(core.setOutput).toHaveBeenCalledWith('version-id', 'version-123')
    expect(core.setOutput).toHaveBeenCalledWith('version', '1.0.0')
    expect(core.setOutput).toHaveBeenCalledWith('package-id', 'com.example.app')
  })

  test('should handle file upload flow', async () => {
    core.getInput.mockImplementation(name => {
      const inputs = {
        'build-var-id': 'test-build-var-id',
        version: '1.0.0',
        'file-path': '/path/to/file.apk',
        'backend-url': 'https://backend.revyl.ai'
      }
      return inputs[name] || ''
    })

    fs.existsSync.mockReturnValue(true)
    fs.readFileSync.mockReturnValue(Buffer.from('fake-file-content'))
    fs.createReadStream.mockReturnValue('fake-stream')

    // Mock upload URL response
    mockPostJson.mockResolvedValueOnce({
      statusCode: 200,
      result: {
        version_id: 'version-123',
        upload_url: 'https://s3.amazonaws.com/presigned-url',
        content_type: 'application/vnd.android.package-archive'
      }
    })

    // Mock S3 upload response
    mockSendStream.mockResolvedValue({
      message: { statusCode: 200 }
    })

    // Mock extract package ID response
    mockPostJson.mockResolvedValueOnce({
      statusCode: 200,
      result: { package_id: 'com.example.app' }
    })

    // Mock complete upload response
    mockPostJson.mockResolvedValueOnce({
      statusCode: 200,
      result: { message: 'Upload completed successfully' }
    })

    await run()

    expect(fs.existsSync).toHaveBeenCalledWith('/path/to/file.apk')
    expect(mockPostJson).toHaveBeenCalledWith(
      'https://backend.revyl.ai/api/v1/apps/test-build-var-id/builds/upload-url?version=1.0.0&file_name=file.apk',
      {}
    )
    expect(mockSendStream).toHaveBeenCalledWith(
      'PUT',
      'https://s3.amazonaws.com/presigned-url',
      'fake-stream',
      {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Length': '17'
      }
    )
    expect(core.setOutput).toHaveBeenCalledWith('success', 'true')
    expect(core.setOutput).toHaveBeenCalledWith('version-id', 'version-123')
  })

  test('should handle invalid JSON metadata', async () => {
    core.getInput.mockImplementation(name => {
      const inputs = {
        'build-var-id': 'test-build-var-id',
        version: '1.0.0',
        'expo-url': 'https://expo.dev/build/123',
        metadata: 'invalid-json'
      }
      return inputs[name] || ''
    })

    await run()

    expect(core.setFailed).toHaveBeenCalledWith(
      'Invalid JSON in metadata: Unexpected token \'i\', "invalid-json" is not valid JSON'
    )
  })

  test('should use pull request head SHA for SCM metadata', () => {
    process.env.GITHUB_ACTIONS = 'true'
    process.env.GITHUB_REPOSITORY = 'acme/mobile-app'
    process.env.GITHUB_RUN_ID = '12345'
    process.env.GITHUB_SHA = 'merge-sha'
    process.env.GITHUB_REF_NAME = '7/merge'
    process.env.GITHUB_EVENT_PATH = '/tmp/event.json'
    process.env.GITHUB_RUN_NUMBER = '55'
    process.env.GITHUB_RUN_ATTEMPT = '2'

    fs.readFileSync.mockReturnValue(
      JSON.stringify({
        number: 42,
        repository: { full_name: 'acme/mobile-app' },
        pull_request: {
          number: 42,
          head: { sha: 'true-head-sha' },
          base: { sha: 'base-sha' }
        }
      })
    )

    const metadata = collectGithubActionsMetadata('/tmp/app.apk')

    expect(metadata).toMatchObject({
      scm_provider: 'github',
      scm_namespace: 'acme',
      scm_project: 'mobile-app',
      scm_review_number: 42,
      scm_head_sha: 'true-head-sha',
      scm_base_sha: 'base-sha',
      scm_platform: 'android',
      commit_sha: 'merge-sha',
      ci_system: 'github-actions',
      ci_run_url: 'https://github.com/acme/mobile-app/actions/runs/12345'
    })
  })
})
