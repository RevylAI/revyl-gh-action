const core = require('@actions/core')
const httm = require('@actions/http-client')

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

    // Get inputs
    const buildVarId = core.getInput('build-var-id', { required: true })
    const version = core.getInput('version', { required: true })

    // Hardcode the correct backend URL - users shouldn't need to know this
    const backendUrl = 'https://backend-staging.cognisim.io'

    const client = new httm.HttpClient('revyl-verify-resolution-action', [], {
      headers: {
        Authorization: `Bearer ${process.env['REVYL_API_KEY']}`,
        'Content-Type': 'application/json'
      }
    })

    core.info(`Verifying resolution for version: ${version}`)
    core.info(`Build Variable: ${buildVarId}`)

    // Call the resolve endpoint
    const resolveEndpoint = `/api/v1/builds/resolve?include_download_url=true`
    const resolveBody = {
      build_var_id: buildVarId,
      pinned_version: version
    }

    core.info(`Making request to: ${backendUrl}${resolveEndpoint}`)

    const resolveRes = await client.postJson(
      `${backendUrl}${resolveEndpoint}`,
      resolveBody
    )

    if (resolveRes.statusCode !== 200) {
      const errorMsg =
        resolveRes.result?.detail ||
        `API returned status code ${resolveRes.statusCode}`
      throw Error(`Failed to resolve build: ${errorMsg}`)
    }

    const result = resolveRes.result

    // Verify response structure
    if (!result.version) {
      throw Error('Response missing version field')
    }

    if (result.version !== version) {
      throw Error(
        `Version mismatch: expected ${version}, got ${result.version}`
      )
    }

    if (!result.download_url) {
      throw Error('Response missing download_url field')
    }

    // Set outputs
    core.setOutput('success', 'true')
    core.setOutput('version', result.version)
    core.setOutput('download-url', result.download_url)
    if (result.artifact_url) {
      core.setOutput('artifact-url', result.artifact_url)
    }

    core.info('✅ Verification successful')
    core.info(`   Version: ${result.version}`)
    core.info(`   Download URL: ${result.download_url}`)

    return true
  } catch (error) {
    core.setOutput('success', 'false')
    core.setOutput('error-message', error.message)
    core.setFailed(error.message)
  }
}

module.exports = {
  run
}