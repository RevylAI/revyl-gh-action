const core = require('@actions/core')
const httm = require('@actions/http-client')
const fs = require('fs')
const path = require('path')

function splitRepository(repository) {
  if (!repository || !repository.includes('/')) {
    return { namespace: null, project: null }
  }
  const [namespace, ...rest] = repository.split('/')
  return { namespace, project: rest.join('/') || null }
}

function readGithubEventPayload() {
  if (!process.env.GITHUB_EVENT_PATH) {
    return null
  }
  try {
    return JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
  } catch (e) {
    core.info('Could not read GitHub event payload for SCM metadata')
    return null
  }
}

function inferPlatformFromFilePath(filePath) {
  const lower = (filePath || '').toLowerCase()
  if (lower.endsWith('.apk') || lower.endsWith('.aab')) {
    return 'android'
  }
  if (
    lower.endsWith('.ipa') ||
    lower.endsWith('.app') ||
    lower.endsWith('.app.zip') ||
    lower.endsWith('.tar.gz') ||
    lower.endsWith('.tgz')
  ) {
    return 'ios'
  }
  return null
}

function collectGithubActionsMetadata(filePath) {
  const autoMetadata = {}
  if (process.env.GITHUB_ACTIONS !== 'true') {
    return autoMetadata
  }

  const eventData = readGithubEventPayload()
  const repository =
    eventData?.repository?.full_name || process.env.GITHUB_REPOSITORY
  const { namespace, project } = splitRepository(repository)
  const pullRequest = eventData?.pull_request
  const pullRequestHeadSha = pullRequest?.head?.sha
  const pullRequestBaseSha = pullRequest?.base?.sha
  const headSha = pullRequestHeadSha || process.env.GITHUB_SHA

  if (repository && process.env.GITHUB_RUN_ID) {
    autoMetadata.ci_run_url = `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`
  }
  if (process.env.GITHUB_SHA) {
    autoMetadata.commit_sha = process.env.GITHUB_SHA
  }
  if (process.env.GITHUB_REF_NAME) {
    autoMetadata.branch = process.env.GITHUB_REF_NAME
  }

  if (namespace && project && headSha) {
    autoMetadata.scm_provider = 'github'
    autoMetadata.scm_namespace = namespace
    autoMetadata.scm_project = project
    autoMetadata.scm_head_sha = headSha
    const inferredPlatform = inferPlatformFromFilePath(filePath)
    if (inferredPlatform) {
      autoMetadata.scm_platform = inferredPlatform
    }
  }

  if (pullRequest?.number || eventData?.number) {
    autoMetadata.pr_number = pullRequest?.number || eventData.number
    autoMetadata.scm_review_number = pullRequest?.number || eventData.number
  }
  if (pullRequestBaseSha) {
    autoMetadata.scm_base_sha = pullRequestBaseSha
  }

  autoMetadata.ci_system = 'github-actions'
  autoMetadata.ci_build_number = process.env.GITHUB_RUN_NUMBER
  autoMetadata.ci_build_attempt = process.env.GITHUB_RUN_ATTEMPT

  return autoMetadata
}

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
async function run() {
  try {
    // Check for API key first
    if (!process.env['REVYL_API_KEY']) {
      throw Error('Missing REVYL_API_KEY - get API token from revyl settings')
    }

    // Get inputs and validate - support both new (app-id) and deprecated (build-var-id)
    const appId = core.getInput('app-id', { required: false })
    const buildVarId = core.getInput('build-var-id', { required: false })

    // Use app-id if provided, fall back to build-var-id for backwards compatibility
    const resolvedAppId = appId || buildVarId
    if (!resolvedAppId) {
      throw Error(
        'app-id is required (or build-var-id for backwards compatibility)'
      )
    }

    // Warn if using deprecated input
    if (!appId && buildVarId) {
      core.warning('build-var-id is deprecated. Please use app-id instead.')
    }

    const version = core.getInput('version', { required: true })
    const filePath = core.getInput('file-path', { required: false })
    const expoUrl = core.getInput('expo-url', { required: false })
    const expoHeaders = core.getInput('expo-headers', { required: false })
    const metadata = core.getInput('metadata', { required: false })
    const packageName = core.getInput('package-name', { required: false })
    const timeoutSeconds = parseInt(
      core.getInput('timeout', { required: false }) || '1800',
      10
    )

    // Hardcode the correct backend URL - users shouldn't need to know this
    const backendUrl = 'https://backend.revyl.ai'

    // Validate inputs
    if (!filePath && !expoUrl) {
      throw Error('Either file-path or expo-url must be provided')
    }
    if (filePath && expoUrl) {
      throw Error(
        'Cannot provide both file-path and expo-url - they are mutually exclusive'
      )
    }

    // Parse metadata if provided
    let parsedMetadata = {}
    if (metadata) {
      try {
        parsedMetadata = JSON.parse(metadata)
      } catch (e) {
        throw Error(`Invalid JSON in metadata: ${e.message}`)
      }
    }

    // Automatically inject GitHub Actions CI/CD + SCM metadata.
    const autoMetadata = collectGithubActionsMetadata(filePath)

    // Merge auto metadata with user metadata (user metadata takes precedence)
    const finalMetadata = { ...autoMetadata, ...parsedMetadata }

    // Log what metadata is being added automatically
    if (Object.keys(autoMetadata).length > 0) {
      core.info('🤖 Auto-injected CI/CD metadata:')
      Object.entries(autoMetadata).forEach(([key, value]) => {
        // Only log if not overridden by user
        if (!parsedMetadata.hasOwnProperty(key)) {
          core.info(`   ${key}: ${value}`)
        }
      })
    }

    // Parse Expo headers if provided
    let parsedExpoHeaders = {}
    if (expoHeaders) {
      try {
        parsedExpoHeaders = JSON.parse(expoHeaders)
      } catch (e) {
        throw Error(`Invalid JSON in expo-headers: ${e.message}`)
      }
    }

    const client = new httm.HttpClient('revyl-upload-build-action', [], {
      headers: {
        Authorization: `Bearer ${process.env['REVYL_API_KEY']}`,
        'Content-Type': 'application/json'
      }
    })

    const startTime = Date.now()
    let versionId = null
    let packageId = null
    let artifactUrl = null

    if (expoUrl) {
      // Handle Expo URL upload using the from-url endpoint
      core.info(`Uploading build from Expo URL: ${expoUrl}`)

      const fromUrlEndpoint = `/api/v1/apps/${resolvedAppId}/builds/from-url`
      const fromUrlBody = {
        version: version,
        from_url: expoUrl,
        headers: parsedExpoHeaders,
        metadata: finalMetadata
      }

      core.info(`Making request to: ${backendUrl}${fromUrlEndpoint}`)

      const fromUrlRes = await client.postJson(
        `${backendUrl}${fromUrlEndpoint}`,
        fromUrlBody
      )

      if (fromUrlRes.statusCode !== 200) {
        const errorMsg =
          fromUrlRes.result?.detail ||
          `API returned status code ${fromUrlRes.statusCode}`
        throw Error(`Failed to upload from Expo URL: ${errorMsg}`)
      }

      if (!fromUrlRes.result || !fromUrlRes.result.id) {
        throw Error(
          'Failed to upload from Expo URL: version ID missing in API response'
        )
      }

      versionId = fromUrlRes.result.id
      artifactUrl = fromUrlRes.result.artifact_url
      packageId = fromUrlRes.result.metadata?.package_id || null

      core.info(
        `Successfully uploaded build from Expo URL. Version ID: ${versionId}`
      )

      // Extract package ID if not already available
      // if (!packageId) {
      try {
        core.info('Attempting to extract package ID from Expo build...')
        const extractEndpoint = `/api/v1/apps/builds/${versionId}/extract-package-id`
        const extractRes = await client.postJson(
          `${backendUrl}${extractEndpoint}`,
          {}
        )

        if (extractRes.statusCode === 200 && extractRes.result?.package_id) {
          packageId = extractRes.result.package_id
          core.info(`Extracted package ID: ${packageId}`)
        } else if (extractRes.result?.error) {
          core.warning(
            `Could not extract package ID: ${extractRes.result.error}`
          )
        }
      } catch (e) {
        core.warning(`Could not extract package ID: ${e.message}`)
      }
      // }
    } else {
      // Handle file upload using the upload-url endpoint
      core.info(`Uploading build file: ${filePath}`)

      // Verify file exists
      if (!fs.existsSync(filePath)) {
        throw Error(`File not found: ${filePath}`)
      }

      const fileName = path.basename(filePath)
      const uploadUrlEndpoint = `/api/v1/apps/${resolvedAppId}/builds/upload-url`
      const uploadUrlParams = new URLSearchParams({
        version: version,
        file_name: fileName
      })

      core.info(
        `Getting upload URL from: ${backendUrl}${uploadUrlEndpoint}?${uploadUrlParams}`
      )

      // Get upload URL - NOTE: This should be a POST request according to the backend
      const uploadUrlRes = await client.postJson(
        `${backendUrl}${uploadUrlEndpoint}?${uploadUrlParams}`,
        {}
      )

      if (uploadUrlRes.statusCode !== 200) {
        const errorMsg =
          uploadUrlRes.result?.detail ||
          `API returned status code ${uploadUrlRes.statusCode}`
        throw Error(`Failed to get upload URL: ${errorMsg}`)
      }

      if (
        !uploadUrlRes.result ||
        !uploadUrlRes.result.upload_url ||
        !uploadUrlRes.result.version_id
      ) {
        throw Error(
          'Failed to get upload URL: missing upload_url or version_id in API response'
        )
      }

      versionId = uploadUrlRes.result.version_id
      const uploadUrl = uploadUrlRes.result.upload_url
      const contentType = uploadUrlRes.result.content_type

      core.info(`Got upload URL. Version ID: ${versionId}`)

      // Upload file to S3
      core.info('Uploading file to S3...')
      const fileContent = fs.readFileSync(filePath)

      const uploadClient = new httm.HttpClient('revyl-upload-build-action')
      const uploadRes = await uploadClient.sendStream(
        'PUT',
        uploadUrl,
        fs.createReadStream(filePath),
        {
          'Content-Type': contentType,
          'Content-Length': fileContent.length.toString()
        }
      )

      if (uploadRes.message.statusCode !== 200) {
        throw Error(
          `Failed to upload file to S3: status code ${uploadRes.message.statusCode}`
        )
      }

      core.info('File uploaded to S3 successfully')

      // Extract package ID if possible
      try {
        core.info('Attempting to extract package ID...')
        const extractEndpoint = `/api/v1/apps/builds/${versionId}/extract-package-id`
        const extractRes = await client.postJson(
          `${backendUrl}${extractEndpoint}`,
          {}
        )

        if (extractRes.statusCode === 200 && extractRes.result?.package_id) {
          packageId = extractRes.result.package_id
          core.info(`Extracted package ID: ${packageId}`)
        } else if (extractRes.result?.error) {
          core.warning(
            `Could not extract package ID: ${extractRes.result.error}`
          )
        }
      } catch (e) {
        core.warning(`Could not extract package ID: ${e.message}`)
      }

      // Complete the upload
      core.info('Completing upload...')
      const completeEndpoint = `/api/v1/apps/builds/${versionId}/complete-upload`

      // Add file_name to metadata so backend uses correct S3 key
      const completeMetadata = {
        ...finalMetadata,
        file_name: fileName // Ensure backend uses the correct filename
      }

      const completeBody = {
        version_id: versionId,
        metadata: completeMetadata,
        package_name: packageName || packageId || undefined
      }

      const completeRes = await client.postJson(
        `${backendUrl}${completeEndpoint}`,
        completeBody
      )

      if (completeRes.statusCode !== 200) {
        const errorMsg =
          completeRes.result?.detail ||
          `API returned status code ${completeRes.statusCode}`
        throw Error(`Failed to complete upload: ${errorMsg}`)
      }

      artifactUrl = `org/${resolvedAppId}/${version}/${fileName}` // Approximate S3 key
      core.info('Upload completed successfully')
    }

    const uploadTime = Math.round((Date.now() - startTime) / 1000)

    // Set outputs - both new names and deprecated aliases
    core.setOutput('success', 'true')
    core.setOutput('build-id', versionId) // New name
    core.setOutput('version-id', versionId) // Deprecated alias
    core.setOutput('version', version)
    if (packageId) {
      core.setOutput('package-id', packageId)
    }
    core.setOutput('upload-time', uploadTime.toString())

    core.info(`✅ Build upload completed successfully in ${uploadTime}s`)
    core.info(`   Build ID: ${versionId}`)
    core.info(`   Version: ${version}`)
    if (packageId) {
      core.info(`   Package ID: ${packageId}`)
    }

    return true
  } catch (error) {
    core.setOutput('success', 'false')
    core.setOutput('error-message', error.message)
    core.setFailed(error.message)
  }
}

module.exports = {
  run,
  collectGithubActionsMetadata,
  inferPlatformFromFilePath
}
