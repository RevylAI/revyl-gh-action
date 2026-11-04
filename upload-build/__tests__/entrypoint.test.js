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

describe.each(['binary', 'expo'])('%s entrypoint', source => {

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
})
