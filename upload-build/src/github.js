const core = require('@actions/core')
const fs = require('fs')

function readGithubEventPayload() {
  if (!process.env.GITHUB_EVENT_PATH) {
    return null
  }
  try {
    return JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
  } catch {
    core.info('Could not read GitHub event payload for branch and SCM metadata')
    return null
  }
}

function repositoryFullName(value) {
  if (typeof value !== 'string') {
    return null
  }
  const fullName = value.trim()
  return /^[^/\s]+\/[^/\s]+$/.test(fullName) ? fullName : null
}

function detectGithubBranch(eventData) {
  if (process.env.GITHUB_ACTIONS !== 'true') {
    return null
  }
  const repository = repositoryFullName(process.env.GITHUB_REPOSITORY)
  if (!repository) {
    return null
  }

  const pullRequest = eventData?.pull_request
  const head = pullRequest?.head
  if (
    typeof head?.ref === 'string' &&
    head.ref &&
    typeof head.sha === 'string' &&
    head.sha
  ) {
    const baseRepository = repositoryFullName(pullRequest.base?.repo?.full_name)
    const headRepository = repositoryFullName(head.repo?.full_name)
    if (
      baseRepository?.toLowerCase() !== repository.toLowerCase() ||
      !headRepository
    ) {
      return null
    }
    const isFork = headRepository.toLowerCase() !== repository.toLowerCase()
    const branch = isFork
      ? `${headRepository.split('/')[0]}:${head.ref}`
      : head.ref
    return branch
  }

  const ref = process.env.GITHUB_REF || ''
  // An unusable PR event must never turn pull_request_target's base ref into a destination.
  if (
    pullRequest ||
    process.env.GITHUB_EVENT_NAME?.startsWith('pull_request') ||
    process.env.GITHUB_HEAD_REF ||
    process.env.GITHUB_REF_TYPE === 'tag' ||
    !ref.startsWith('refs/heads/')
  ) {
    return null
  }
  const branch = ref.slice('refs/heads/'.length)
  return branch || null
}

module.exports = { readGithubEventPayload, detectGithubBranch }
