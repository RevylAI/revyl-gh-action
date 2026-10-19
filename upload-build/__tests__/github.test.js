const { detectGithubBranch, readGithubEventPayload } = require('../src/github')
const fs = require('fs')
const os = require('os')
const path = require('path')

const originalEnv = process.env
let eventDirectory

beforeEach(() => {
  process.env = {
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: 'acme/mobile',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_REF_TYPE: 'branch'
  }
  eventDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'revyl-action-event-'))
})

afterEach(() => {
  process.env = originalEnv
  fs.rmSync(eventDirectory, { recursive: true, force: true })
})

function pullRequest(headRepository = 'acme/mobile', ref = 'feature/login') {
  return {
    pull_request: {
      head: { ref, sha: 'a'.repeat(40), repo: { full_name: headRepository } },
      base: { ref: 'main', repo: { full_name: 'acme/mobile' } }
    }
  }
}

test.each([
  ['same repository PR', 'acme/mobile', 'feature/login'],
  ['case insensitive repository', 'ACME/Mobile', 'feature/login'],
  ['fork PR', 'Contributor/mobile', 'Contributor:feature/login'],
  ['different repository under same owner', 'acme/fork', 'acme:feature/login']
])('%s uses the source branch', (_label, repository, expected) => {
  process.env.GITHUB_REF = 'refs/pull/7/merge'
  process.env.GITHUB_HEAD_REF = 'feature/login'
  expect(detectGithubBranch(pullRequest(repository))).toBe(expected)
})

test('pull_request_target uses the source branch, never its base ref', () => {
  process.env.GITHUB_EVENT_NAME = 'pull_request_target'
  process.env.GITHUB_HEAD_REF = 'feature/login'
  expect(detectGithubBranch(pullRequest())).toBe('feature/login')
})

test('push uses GITHUB_REF rather than display name', () => {
  process.env.GITHUB_REF = 'refs/heads/release/mobile'
  process.env.GITHUB_REF_NAME = 'unrelated'
  expect(detectGithubBranch(null)).toBe('release/mobile')
})

test.each([
  ['outside GitHub Actions', { GITHUB_ACTIONS: 'false' }],
  ['missing repository', { GITHUB_REPOSITORY: '' }],
  ['malformed repository', { GITHUB_REPOSITORY: 'mobile' }],
  ['tag ref', { GITHUB_REF: 'refs/tags/v1.0' }],
  ['tag type', { GITHUB_REF_TYPE: 'tag' }],
  ['missing ref', { GITHUB_REF: '' }],
  ['empty branch', { GITHUB_REF: 'refs/heads/' }],
  ['synthetic PR merge', { GITHUB_REF: 'refs/pull/7/merge' }],
  ['PR without payload', { GITHUB_HEAD_REF: 'feature/login' }],
  ['PR event without head ref', { GITHUB_EVENT_NAME: 'pull_request_target' }]
])('%s has no inferred destination', (_label, env) => {
  Object.assign(process.env, env)
  expect(detectGithubBranch(null)).toBeNull()
})

test.each([
  ['missing head SHA', event => delete event.pull_request.head.sha],
  ['non-string head SHA', event => (event.pull_request.head.sha = 1)],
  ['missing head repo', event => delete event.pull_request.head.repo],
  ['missing base repo', event => delete event.pull_request.base.repo],
  ['empty head ref', event => (event.pull_request.head.ref = '')],
  ['non-string head ref', event => (event.pull_request.head.ref = 1)],
  [
    'different base repo',
    event => (event.pull_request.base.repo.full_name = 'different/mobile')
  ]
])('%s cannot select the target branch', (_label, modify) => {
  const event = pullRequest()
  modify(event)
  expect(detectGithubBranch(event)).toBeNull()
})

test.each([' bad', 'bad ', 'bad\nname', 'bad\u007fname', 'a'.repeat(256)])(
  'rejects an invalid detected name %j',
  branch => {
    process.env.GITHUB_REF = `refs/heads/${branch}`
    expect(() => detectGithubBranch(null)).toThrow(
      'Detected Git branch is not a valid Revyl branch; set the branch input explicitly'
    )
  }
)

test('counts Unicode codepoints and validates the complete fork name', () => {
  const branch = '🦆'.repeat(255)
  process.env.GITHUB_REF = `refs/heads/${branch}`
  expect(detectGithubBranch(null)).toBe(branch)
  expect(() =>
    detectGithubBranch(pullRequest('contributor/mobile', branch))
  ).toThrow('Detected Git branch is not a valid Revyl branch')
})

test('reads the event file without a checkout', () => {
  process.env.GITHUB_EVENT_PATH = path.join(eventDirectory, 'event.json')
  fs.writeFileSync(process.env.GITHUB_EVENT_PATH, JSON.stringify(pullRequest()))
  expect(detectGithubBranch(readGithubEventPayload())).toBe('feature/login')
})

test.each(['missing', 'malformed'])('%s event file is unavailable', state => {
  process.env.GITHUB_EVENT_PATH = path.join(eventDirectory, 'event.json')
  process.env.GITHUB_HEAD_REF = 'feature/login'
  if (state === 'malformed') {
    fs.writeFileSync(process.env.GITHUB_EVENT_PATH, '{')
  }
  expect(detectGithubBranch(readGithubEventPayload())).toBeNull()
})
