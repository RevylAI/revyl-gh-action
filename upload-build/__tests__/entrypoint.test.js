const { spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const entrypoint = path.resolve(__dirname, '../src/index.js')
const preload = path.resolve(__dirname, 'fixtures/upload-http.js')
let temporaryDirectory

beforeEach(() => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'revyl-upload-'))
})

afterEach(() => {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true })
})

function pullRequest(repository = 'acme/mobile', branch = 'feature/login') {
  return {
    number: 7,
    repository: { full_name: 'acme/mobile' },
    pull_request: {
      number: 7,
      head: {
        ref: branch,
        sha: 'a'.repeat(40),
        repo: { full_name: repository }
      },
      base: {
        ref: 'main',
        sha: 'b'.repeat(40),
        repo: { full_name: 'acme/mobile' }
      }
    }
  }
}

function invokeAction(source, scenario) {
  const artifactPath = path.join(temporaryDirectory, 'app.apk')
  const requestsPath = path.join(temporaryDirectory, 'requests.jsonl')
  const outputsPath = path.join(temporaryDirectory, 'outputs.txt')
  const eventPath = path.join(temporaryDirectory, 'event.json')
  fs.writeFileSync(artifactPath, 'fixture artifact')
  fs.writeFileSync(requestsPath, '')
  fs.writeFileSync(outputsPath, '')
  if (scenario.event) {
    fs.writeFileSync(eventPath, JSON.stringify(scenario.event))
  }
  const env = {
    PATH: process.env.PATH,
    REVYL_API_KEY: 'fixture-api-key',
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: 'acme/mobile',
    GITHUB_SHA: 'c'.repeat(40),
    GITHUB_REF: 'refs/heads/feature/push',
    GITHUB_REF_NAME: 'feature/push',
    GITHUB_REF_TYPE: 'branch',
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_OUTPUT: outputsPath,
    ACTION_TEST_REQUESTS: requestsPath,
    'INPUT_APP-ID': 'app-123',
    INPUT_VERSION: 'fixture-version',
    INPUT_BRANCH: scenario.explicitBranch || '',
    INPUT_METADATA: JSON.stringify({ fixture: true }),
    ...(source === 'binary'
      ? { 'INPUT_FILE-PATH': artifactPath }
      : {
          'INPUT_EXPO-URL': 'https://expo.example.invalid/app.apk',
          'INPUT_EXPO-HEADERS': JSON.stringify({ 'X-Fixture': 'preserved' })
        }),
    ...scenario.env
  }
  const processResult = spawnSync(
    process.execPath,
    ['--require', preload, entrypoint],
    {
      cwd: temporaryDirectory,
      env,
      encoding: 'utf8',
      timeout: 10000
    }
  )
  expect(processResult.error).toBeUndefined()
  return {
    ...processResult,
    requests: fs
      .readFileSync(requestsPath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(JSON.parse),
    outputs: fs.readFileSync(outputsPath, 'utf8')
  }
}

const scenarios = [
  { name: 'push', expected: 'feature/push' },
  {
    name: 'same repository PR',
    event: pullRequest(),
    env: { GITHUB_REF: 'refs/pull/7/merge', GITHUB_HEAD_REF: 'feature/login' },
    expected: 'feature/login'
  },
  {
    name: 'fork PR',
    event: pullRequest('Contributor/mobile'),
    env: { GITHUB_REF: 'refs/pull/7/merge', GITHUB_HEAD_REF: 'feature/login' },
    expected: 'Contributor:feature/login'
  },
  {
    name: 'PR target',
    event: pullRequest(),
    env: {
      GITHUB_REF: 'refs/heads/main',
      GITHUB_EVENT_NAME: 'pull_request_target'
    },
    expected: 'feature/login'
  },
  { name: 'tag', env: { GITHUB_REF: 'refs/tags/v1', GITHUB_REF_TYPE: 'tag' } },
  { name: 'missing context', env: { GITHUB_REF: '', GITHUB_REPOSITORY: '' } },
  {
    name: 'missing PR payload',
    env: { GITHUB_REF: 'refs/heads/main', GITHUB_HEAD_REF: 'feature/login' }
  },
  {
    name: 'explicit branch overrides a fork',
    event: pullRequest('Contributor/mobile'),
    explicitBranch: 'release'
  },
  {
    name: 'explicit branch overrides invalid context',
    env: { GITHUB_REF: 'refs/heads/ invalid' },
    explicitBranch: 'release'
  }
]

describe.each(['binary', 'expo'])('%s entrypoint', source => {
  test.each(scenarios)('$name without checkout', scenario => {
    const result = invokeAction(source, scenario)
    expect(result.status).toBe(0)
    const firstRequest = result.requests[0]
    const destination =
      source === 'binary'
        ? Object.fromEntries(new URL(firstRequest.url).searchParams)
        : firstRequest.body
    expect(destination.branch_name).toBe(scenario.explicitBranch)
    expect(destination.git_branch_name).toBe(scenario.expected)
    const completion =
      source === 'binary'
        ? result.requests.find(request =>
            request.url.endsWith('/complete-upload')
          )
        : firstRequest
    expect(completion.body).not.toHaveProperty('pin')
    expect(completion.body).not.toHaveProperty('set_as_current')
    expect(completion.body.metadata.fixture).toBe(true)
    expect(completion.body.metadata.branch).toBe(
      scenario.env?.GITHUB_HEAD_REF || 'feature/push'
    )
    if (scenario.event) {
      expect(completion.body.metadata.scm_head_sha).toBe('a'.repeat(40))
      expect(completion.body.metadata.scm_review_number).toBe(7)
    }
    if (source === 'expo') {
      expect(firstRequest.body.headers).toEqual({ 'X-Fixture': 'preserved' })
    } else {
      expect(
        result.requests.find(request => request.method === 'PUT').bytes
      ).toBe(16)
    }
    for (const [output, value] of [
      ['success', 'true'],
      ['build-id', 'build-123'],
      ['version-id', 'build-123'],
      ['package-id', 'com.example.app']
    ]) {
      expect(result.outputs).toMatch(
        new RegExp(`${output}<<[^\\n]+\\n${value}\\n`)
      )
    }
  })

  test('leaves detected-name validation to the server app policy', () => {
    const result = invokeAction(source, {
      env: { GITHUB_REF: 'refs/heads/ invalid' }
    })
    expect(result.status).toBe(0)
    const firstRequest = result.requests[0]
    const destination =
      source === 'binary'
        ? Object.fromEntries(new URL(firstRequest.url).searchParams)
        : firstRequest.body
    expect(destination.git_branch_name).toBe(' invalid')
  })

  test('destination rejection fails without a default-branch retry', () => {
    const result = invokeAction(source, {
      env: { ACTION_TEST_REJECT_DESTINATION: 'true' }
    })
    expect(result.status).toBe(1)
    expect(result.requests).toHaveLength(1)
    expect(result.stdout).toContain('Destination rejected')
    expect(result.outputs).toMatch(/success<<[^\n]+\nfalse\n/)
  })
})
