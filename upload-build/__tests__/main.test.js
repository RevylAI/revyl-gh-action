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
    delete process.env.GITHUB_HEAD_REF
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

  describe('branch input', () => {
    function mockInputs(inputs) {
      core.getInput.mockImplementation(name => inputs[name] || '')
    }

    function mockFileUploadResponses() {
      fs.existsSync.mockReturnValue(true)
      fs.readFileSync.mockReturnValue(Buffer.from('fake-file-content'))
      fs.createReadStream.mockReturnValue('fake-stream')
      mockPostJson
        .mockResolvedValueOnce({
          statusCode: 200,
          result: {
            version_id: 'version-123',
            upload_url: 'https://s3.amazonaws.com/presigned-url',
            content_type: 'application/vnd.android.package-archive'
          }
        })
        .mockResolvedValueOnce({
          statusCode: 200,
          result: { package_id: 'com.example.app' }
        })
        .mockResolvedValueOnce({ statusCode: 200, result: {} })
      mockSendStream.mockResolvedValue({ message: { statusCode: 200 } })
    }

    function mockFromUrlResponses() {
      mockPostJson.mockResolvedValue({
        statusCode: 200,
        result: { id: 'version-123', metadata: {} }
      })
    }

    const uploadUrlEndpoint =
      'https://backend.revyl.ai/api/v1/apps/test-app-id/builds/upload-url'
    const fromUrlEndpoint =
      'https://backend.revyl.ai/api/v1/apps/test-app-id/builds/from-url'

    test('omits branch_name from the upload URL when branch is not set', async () => {
      mockInputs({
        'app-id': 'test-app-id',
        version: '1.0.0',
        'file-path': '/path/to/file.apk'
      })
      mockFileUploadResponses()

      await run()

      expect(core.setFailed).not.toHaveBeenCalled()
      expect(mockPostJson.mock.calls[0][0]).toBe(
        `${uploadUrlEndpoint}?version=1.0.0&file_name=file.apk`
      )
    })

    test('omits branch_name from the from-url body when branch is not set', async () => {
      mockInputs({
        'app-id': 'test-app-id',
        version: '1.0.0',
        'expo-url': 'https://expo.dev/build/123'
      })
      mockFromUrlResponses()

      await run()

      expect(core.setFailed).not.toHaveBeenCalled()
      expect(mockPostJson.mock.calls[0][0]).toBe(fromUrlEndpoint)
      expect(mockPostJson.mock.calls[0][1]).not.toHaveProperty('branch_name')
    })

    test('sends branch_name as an encoded upload URL query parameter', async () => {
      mockInputs({
        'app-id': 'test-app-id',
        version: '1.0.0',
        'file-path': '/path/to/file.apk',
        branch: 'feature/login flow'
      })
      mockFileUploadResponses()

      await run()

      expect(core.setFailed).not.toHaveBeenCalled()
      expect(mockPostJson).toHaveBeenNthCalledWith(
        1,
        `${uploadUrlEndpoint}?version=1.0.0&file_name=file.apk&branch_name=feature%2Flogin+flow`,
        {}
      )
      expect(core.setOutput).toHaveBeenCalledWith('build-id', 'version-123')
    })

    test('sends branch_name in the from-url body', async () => {
      mockInputs({
        'app-id': 'test-app-id',
        version: '1.0.0',
        'expo-url': 'https://expo.dev/build/123',
        branch: 'staging'
      })
      mockFromUrlResponses()

      await run()

      expect(core.setFailed).not.toHaveBeenCalled()
      expect(mockPostJson).toHaveBeenNthCalledWith(1, fromUrlEndpoint, {
        version: '1.0.0',
        from_url: 'https://expo.dev/build/123',
        headers: {},
        metadata: {},
        branch_name: 'staging'
      })
    })

    test('keeps the Git ref as branch metadata separate from the Revyl branch', async () => {
      process.env.GITHUB_ACTIONS = 'true'
      process.env.GITHUB_REF_NAME = 'feature/login'
      mockInputs({
        'app-id': 'test-app-id',
        version: '1.0.0',
        'expo-url': 'https://expo.dev/build/123',
        branch: 'staging'
      })
      mockFromUrlResponses()

      await run()

      const fromUrlBody = mockPostJson.mock.calls[0][1]
      expect(fromUrlBody.branch_name).toBe('staging')
      expect(fromUrlBody.metadata.branch).toBe('feature/login')
    })
  })

  describe('branch line after the upload', () => {
    const resolveEndpoint = 'https://backend.revyl.ai/api/v1/apps/resolve'
    const branchEndpoint =
      'https://backend.revyl.ai/api/v1/apps/test-app-id/branches/branch-1'

    function mockFileUpload(branchId = 'branch-1') {
      core.getInput.mockImplementation(
        name =>
          ({
            'app-id': 'test-app-id',
            version: '1.0.0',
            'file-path': '/path/to/file.apk',
            branch: 'staging'
          })[name] || ''
      )
      fs.existsSync.mockReturnValue(true)
      fs.readFileSync.mockReturnValue(Buffer.from('fake-file-content'))
      fs.createReadStream.mockReturnValue('fake-stream')
      mockSendStream.mockResolvedValue({ message: { statusCode: 200 } })
      mockPostJson
        .mockResolvedValueOnce({
          statusCode: 200,
          result: {
            version_id: 'version-123',
            branch_id: branchId,
            upload_url: 'https://s3.amazonaws.com/presigned-url',
            content_type: 'application/vnd.android.package-archive'
          }
        })
        .mockResolvedValueOnce({ statusCode: 200, result: {} })
        .mockResolvedValueOnce({ statusCode: 200, result: {} })
    }

    function mockRunBuild(versionId, version, pinnedBuildId = null) {
      mockPostJson.mockResolvedValueOnce({
        statusCode: 200,
        result: {
          version_id: versionId,
          version,
          branch_id: 'branch-1',
          branch_name: 'staging',
          resolution_status: 'resolved'
        }
      })
      mockGetJson.mockResolvedValueOnce({
        statusCode: 200,
        result: {
          id: 'branch-1',
          name: 'staging',
          pinned_build_id: pinnedBuildId
        }
      })
    }

    test.each([
      [
        'the branch stays pinned to another build',
        ['version-12', 'v1.2', 'version-12'],
        "   Branch: staging (pinned to v1.2; runs that don't choose a build keep using v1.2)"
      ],
      [
        'Latest build uses the upload',
        ['version-123', '1.0.0'],
        '   Branch: staging (Latest build: runs use this upload)'
      ],
      [
        'Latest build resolves to another build',
        ['version-12', 'v1.2'],
        '   Branch: staging (Latest build: runs use v1.2)'
      ]
    ])('says which build runs when %s', async (_, runBuild, line) => {
      mockFileUpload()
      mockRunBuild(...runBuild)

      await run()

      expect(core.setFailed).not.toHaveBeenCalled()
      expect(mockPostJson).toHaveBeenLastCalledWith(resolveEndpoint, {
        build_var_id: 'test-app-id',
        branch_id: 'branch-1'
      })
      expect(mockGetJson).toHaveBeenCalledWith(branchEndpoint)
      expect(core.info).toHaveBeenCalledWith(line)
      expect(core.warning).not.toHaveBeenCalled()
    })

    test('names the branch from an Expo upload that reused the default build', async () => {
      core.getInput.mockImplementation(
        name =>
          ({
            'app-id': 'test-app-id',
            version: '1.0.0',
            'expo-url': 'https://expo.dev/build/123'
          })[name] || ''
      )
      mockPostJson
        .mockResolvedValueOnce({
          statusCode: 200,
          result: {
            id: 'version-123',
            branch_id: 'branch-1',
            branch_name: 'staging',
            metadata: {}
          }
        })
        .mockResolvedValueOnce({ statusCode: 200, result: {} })
      mockRunBuild('version-123', '1.0.0', 'version-123')

      await run()

      expect(mockPostJson).toHaveBeenLastCalledWith(resolveEndpoint, {
        build_var_id: 'test-app-id',
        branch_id: 'branch-1'
      })
      expect(core.info).toHaveBeenCalledWith(
        '   Branch: staging (pinned to this build)'
      )
    })

    test('warns without failing the upload when the check fails', async () => {
      mockFileUpload()
      const lookupError = new Error('{"detail":"Branch resolution failed"}')
      lookupError.result = { detail: 'Branch resolution failed' }
      mockPostJson.mockRejectedValueOnce(lookupError)

      await run()

      expect(core.setFailed).not.toHaveBeenCalled()
      expect(core.setOutput).toHaveBeenCalledWith('success', 'true')
      expect(core.info).toHaveBeenCalledWith('   Branch: staging')
      expect(core.warning).toHaveBeenCalledWith(
        "Couldn't check which build runs on staging: Branch resolution failed"
      )
    })

    test('resolves the app default branch when the upload names no branch', async () => {
      mockFileUpload(null)
      core.getInput.mockImplementation(
        name =>
          ({
            'app-id': 'test-app-id',
            version: '1.0.0',
            'file-path': '/path/to/file.apk'
          })[name] || ''
      )
      mockPostJson.mockResolvedValueOnce({
        statusCode: 200,
        result: { resolution_status: 'no_compatible_build', branch_id: null }
      })

      await run()

      expect(mockPostJson).toHaveBeenLastCalledWith(resolveEndpoint, {
        build_var_id: 'test-app-id'
      })
      expect(core.warning).toHaveBeenCalledWith(
        "Couldn't check which build runs on the app default branch: no usable build (no_compatible_build)"
      )
      expect(core.setFailed).not.toHaveBeenCalled()
    })
  })

  test('should use the pull request head SHA and branch for metadata', () => {
    process.env.GITHUB_ACTIONS = 'true'
    process.env.GITHUB_REPOSITORY = 'acme/mobile-app'
    process.env.GITHUB_RUN_ID = '12345'
    process.env.GITHUB_SHA = 'merge-sha'
    process.env.GITHUB_HEAD_REF = 'feature/login'
    process.env.GITHUB_REF_NAME = '42/merge'
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
      branch: 'feature/login',
      commit_sha: 'merge-sha',
      ci_system: 'github-actions',
      ci_run_url: 'https://github.com/acme/mobile-app/actions/runs/12345'
    })
  })

  test('should use the pushed branch or tag for metadata on push runs', () => {
    process.env.GITHUB_ACTIONS = 'true'
    process.env.GITHUB_HEAD_REF = ''
    process.env.GITHUB_REF_NAME = 'main'

    expect(collectGithubActionsMetadata('/tmp/app.apk').branch).toBe('main')
  })
})
