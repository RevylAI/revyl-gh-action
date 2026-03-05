/**
 * Tests for CLI-based execution mode in the GitHub Action.
 *
 * These tests verify the CLI integration logic including:
 * - Download URL construction for different platforms
 * - Command building with various flag combinations
 * - JSON output parsing
 * - Backend URL backward compatibility
 */

describe('CLI Integration', () => {
  describe('Download URL Construction', () => {
    /**
     * Helper to construct CLI download URL.
     *
     * @param {string} os - Operating system (linux, darwin, windows)
     * @param {string} arch - Architecture (amd64, arm64)
     * @param {string} version - CLI version (latest or specific version like v0.1.0)
     * @returns {string} The download URL
     */
    function buildDownloadUrl(os, arch, version) {
      const ext = os === 'windows' ? '.exe' : ''
      const binary = `revyl-${os}-${arch}${ext}`

      if (version === 'latest') {
        return `https://github.com/RevylAI/revyl-cli/releases/latest/download/${binary}`
      }
      return `https://github.com/RevylAI/revyl-cli/releases/download/${version}/${binary}`
    }

    it('constructs correct URL for latest version on linux-amd64', () => {
      const url = buildDownloadUrl('linux', 'amd64', 'latest')
      expect(url).toBe(
        'https://github.com/RevylAI/revyl-cli/releases/latest/download/revyl-linux-amd64'
      )
    })

    it('constructs correct URL for latest version on linux-arm64', () => {
      const url = buildDownloadUrl('linux', 'arm64', 'latest')
      expect(url).toBe(
        'https://github.com/RevylAI/revyl-cli/releases/latest/download/revyl-linux-arm64'
      )
    })

    it('constructs correct URL for latest version on darwin-amd64', () => {
      const url = buildDownloadUrl('darwin', 'amd64', 'latest')
      expect(url).toBe(
        'https://github.com/RevylAI/revyl-cli/releases/latest/download/revyl-darwin-amd64'
      )
    })

    it('constructs correct URL for latest version on darwin-arm64', () => {
      const url = buildDownloadUrl('darwin', 'arm64', 'latest')
      expect(url).toBe(
        'https://github.com/RevylAI/revyl-cli/releases/latest/download/revyl-darwin-arm64'
      )
    })

    it('constructs correct URL for specific version on darwin-arm64', () => {
      const url = buildDownloadUrl('darwin', 'arm64', 'v0.1.0')
      expect(url).toBe(
        'https://github.com/RevylAI/revyl-cli/releases/download/v0.1.0/revyl-darwin-arm64'
      )
    })

    it('adds .exe extension for windows', () => {
      const url = buildDownloadUrl('windows', 'amd64', 'latest')
      expect(url).toBe(
        'https://github.com/RevylAI/revyl-cli/releases/latest/download/revyl-windows-amd64.exe'
      )
    })

    it('constructs correct URL for specific version on windows', () => {
      const url = buildDownloadUrl('windows', 'amd64', 'v0.2.0')
      expect(url).toBe(
        'https://github.com/RevylAI/revyl-cli/releases/download/v0.2.0/revyl-windows-amd64.exe'
      )
    })
  })

  describe('Command Building', () => {
    /**
     * Helper to build CLI command with arguments.
     *
     * @param {Object} params - Command parameters
     * @param {string} params.type - 'test' or 'workflow'
     * @param {string} params.id - Test or workflow ID
     * @param {number} [params.retries=1] - Number of retries
     * @param {string} [params.buildId] - Build version ID
     * @param {number} [params.timeout=3600] - Timeout in seconds
     * @param {boolean} [params.noWait=false] - No-wait mode
     * @param {boolean} [params.devMode=false] - Development mode
     * @returns {string} The full CLI command
     */
    function buildCommand(params) {
      const {
        type,
        id,
        retries = 1,
        buildId,
        timeout = 3600,
        noWait = false,
        devMode = false
      } = params

      let cmd = `./revyl ${type} run ${id}`
      let args = []

      if (retries !== 1) args.push(`--retries ${retries}`)
      if (buildId && type === 'test') args.push(`--build-id ${buildId}`)
      if (timeout !== 3600) args.push(`--timeout ${timeout}`)
      if (noWait) args.push('--no-wait')
      if (devMode) args.push('--dev')
      args.push('--json --github-actions --open=false')

      return `${cmd} ${args.join(' ')}`
    }

    it('builds basic test command', () => {
      const cmd = buildCommand({ type: 'test', id: 'test-123' })
      expect(cmd).toBe(
        './revyl test run test-123 --json --github-actions --open=false'
      )
    })

    it('builds basic workflow command', () => {
      const cmd = buildCommand({ type: 'workflow', id: 'workflow-789' })
      expect(cmd).toBe(
        './revyl workflow run workflow-789 --json --github-actions --open=false'
      )
    })

    it('builds test command with all flags', () => {
      const cmd = buildCommand({
        type: 'test',
        id: 'test-123',
        retries: 3,
        buildId: 'build-456',
        timeout: 1800,
        noWait: true
      })
      expect(cmd).toBe(
        './revyl test run test-123 --retries 3 --build-id build-456 --timeout 1800 --no-wait --json --github-actions --open=false'
      )
    })

    it('builds workflow command with retries', () => {
      const cmd = buildCommand({
        type: 'workflow',
        id: 'wf-abc',
        retries: 2
      })
      expect(cmd).toBe(
        './revyl workflow run wf-abc --retries 2 --json --github-actions --open=false'
      )
    })

    it('builds command with dev mode', () => {
      const cmd = buildCommand({
        type: 'test',
        id: 'test-dev',
        devMode: true
      })
      expect(cmd).toBe(
        './revyl test run test-dev --dev --json --github-actions --open=false'
      )
    })
  })

  describe('JSON Output Parsing', () => {
    /**
     * Helper to parse task_id from CLI output.
     *
     * @param {string} output - CLI JSON output
     * @returns {string|null} The task ID or null if not found
     */
    function parseTaskId(output) {
      const match = output.match(/"task_id":"([^"]*)"/)
      return match ? match[1] : null
    }

    /**
     * Helper to parse error message from CLI output.
     *
     * @param {string} output - CLI JSON output
     * @returns {string|null} The error message or null if not found
     */
    function parseError(output) {
      const match = output.match(/"error":"([^"]*)"/)
      return match ? match[1] : null
    }

    /**
     * Helper to parse workflow metrics from CLI output.
     *
     * @param {string} output - CLI JSON output
     * @returns {Object} Object with total_tests, passed_tests, failed_tests
     */
    function parseWorkflowMetrics(output) {
      const totalMatch = output.match(/"total_tests":(\d+)/)
      const passedMatch = output.match(/"passed_tests":(\d+)/)
      const failedMatch = output.match(/"failed_tests":(\d+)/)

      return {
        total_tests: totalMatch ? parseInt(totalMatch[1]) : null,
        passed_tests: passedMatch ? parseInt(passedMatch[1]) : null,
        failed_tests: failedMatch ? parseInt(failedMatch[1]) : null
      }
    }

    it('extracts task_id from test output', () => {
      const output = JSON.stringify({
        success: true,
        task_id: 'task-abc-123',
        test_id: 'test-456',
        status: 'passed'
      })

      expect(parseTaskId(output)).toBe('task-abc-123')
    })

    it('extracts task_id from workflow output', () => {
      const output = JSON.stringify({
        success: true,
        task_id: 'task-wf-789',
        workflow_id: 'wf-123',
        status: 'completed'
      })

      expect(parseTaskId(output)).toBe('task-wf-789')
    })

    it('returns null when task_id is missing', () => {
      const output = JSON.stringify({
        success: false,
        error: 'Authentication failed'
      })

      expect(parseTaskId(output)).toBeNull()
    })

    it('extracts error message when present', () => {
      const output = JSON.stringify({
        success: false,
        task_id: 'task-err-123',
        error: 'Test timed out after 3600s'
      })

      expect(parseError(output)).toBe('Test timed out after 3600s')
    })

    it('returns null when error is not present', () => {
      const output = JSON.stringify({
        success: true,
        task_id: 'task-ok-123'
      })

      expect(parseError(output)).toBeNull()
    })

    it('extracts workflow metrics from output', () => {
      const output = JSON.stringify({
        success: true,
        task_id: 'task-wf-123',
        total_tests: 5,
        passed_tests: 4,
        failed_tests: 1
      })

      const metrics = parseWorkflowMetrics(output)
      expect(metrics.total_tests).toBe(5)
      expect(metrics.passed_tests).toBe(4)
      expect(metrics.failed_tests).toBe(1)
    })

    it('handles workflow with all tests passed', () => {
      const output = JSON.stringify({
        success: true,
        task_id: 'task-wf-perfect',
        total_tests: 10,
        passed_tests: 10,
        failed_tests: 0
      })

      const metrics = parseWorkflowMetrics(output)
      expect(metrics.total_tests).toBe(10)
      expect(metrics.passed_tests).toBe(10)
      expect(metrics.failed_tests).toBe(0)
    })

    it('handles partial workflow metrics', () => {
      const output = JSON.stringify({
        success: false,
        task_id: 'task-wf-partial',
        total_tests: 3
        // passed_tests and failed_tests missing (workflow still running)
      })

      const metrics = parseWorkflowMetrics(output)
      expect(metrics.total_tests).toBe(3)
      expect(metrics.passed_tests).toBeNull()
      expect(metrics.failed_tests).toBeNull()
    })
  })

  describe('Backend URL Override', () => {
    /**
     * Helper to build endpoint override env from backend-url input.
     *
     * @param {string} backendUrl - backend-url input
     * @returns {Object} environment overrides
     */
    function buildBackendEnv(backendUrl) {
      if (!backendUrl || backendUrl === 'https://backend.revyl.ai') return {}
      return { REVYL_BACKEND_URL: backendUrl }
    }

    it('sets override for staging URL', () => {
      expect(buildBackendEnv('https://backend-staging.revyl.ai')).toEqual({
        REVYL_BACKEND_URL: 'https://backend-staging.revyl.ai'
      })
    })

    it('sets override for localhost URL', () => {
      expect(buildBackendEnv('http://localhost:8000')).toEqual({
        REVYL_BACKEND_URL: 'http://localhost:8000'
      })
    })

    it('omits override for default production URL', () => {
      expect(buildBackendEnv('https://backend.revyl.ai')).toEqual({})
    })

    it('omits override when backend-url is empty', () => {
      expect(buildBackendEnv('')).toEqual({})
      expect(buildBackendEnv(undefined)).toEqual({})
    })
  })

  describe('Platform Detection', () => {
    /**
     * Helper to map runner.os to CLI os value.
     *
     * @param {string} runnerOs - GitHub runner OS (Linux, macOS, Windows)
     * @returns {string} CLI os value (linux, darwin, windows)
     */
    function mapOs(runnerOs) {
      const mapping = {
        Linux: 'linux',
        macOS: 'darwin',
        Windows: 'windows'
      }
      if (!mapping[runnerOs]) {
        throw new Error(`Unsupported runner.os: ${runnerOs}`)
      }
      return mapping[runnerOs]
    }

    /**
     * Helper to map runner.arch to CLI arch value.
     *
     * @param {string} runnerArch - GitHub runner arch (X64, ARM64)
     * @returns {string} CLI arch value (amd64, arm64)
     */
    function mapArch(runnerArch) {
      const mapping = {
        X64: 'amd64',
        ARM64: 'arm64'
      }
      if (!mapping[runnerArch]) {
        throw new Error(`Unsupported runner.arch: ${runnerArch}`)
      }
      return mapping[runnerArch]
    }

    it('maps Linux to linux', () => {
      expect(mapOs('Linux')).toBe('linux')
    })

    it('maps macOS to darwin', () => {
      expect(mapOs('macOS')).toBe('darwin')
    })

    it('maps Windows to windows', () => {
      expect(mapOs('Windows')).toBe('windows')
    })

    it('maps X64 to amd64', () => {
      expect(mapArch('X64')).toBe('amd64')
    })

    it('maps ARM64 to arm64', () => {
      expect(mapArch('ARM64')).toBe('arm64')
    })

    it('throws for unknown OS', () => {
      expect(() => mapOs('Unknown')).toThrow('Unsupported runner.os: Unknown')
    })

    it('throws for unknown arch', () => {
      expect(() => mapArch('Unknown')).toThrow(
        'Unsupported runner.arch: Unknown'
      )
    })
  })
})
