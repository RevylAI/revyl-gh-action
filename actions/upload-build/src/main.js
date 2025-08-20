const core = require('@actions/core')
const httm = require('@actions/http-client')
const fs = require('fs')
const path = require('path')

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

    // Get inputs and validate
    const buildVarId = core.getInput('build-var-id', { required: true })
    const version = core.getInput('version', { required: true })
    const filePath = core.getInput('file-path', { required: false })
    const expoUrl = core.getInput('expo-url', { required: false })
    const expoHeaders = core.getInput('expo-headers', { required: false })
    const metadata = core.getInput('metadata', { required: false })
    const packageName = core.getInput('package-name', { required: false })
    const backendUrl =
      core.getInput('backend-url', { required: false }) ||
      'https://api.revyl.dev'
    const timeoutSeconds = parseInt(
      core.getInput('timeout', { required: false }) || '1800',
      10
    )

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

      const fromUrlEndpoint = `/builds/vars/${buildVarId}/versions/from-url`
      const fromUrlBody = {
        version: version,
        from_url: expoUrl,
        headers: parsedExpoHeaders,
        metadata: parsedMetadata
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
    } else {
      // Handle file upload using the upload-url endpoint
      core.info(`Uploading build file: ${filePath}`)

      // Verify file exists
      if (!fs.existsSync(filePath)) {
        throw Error(`File not found: ${filePath}`)
      }

      const fileName = path.basename(filePath)
      const uploadUrlEndpoint = `/builds/vars/${buildVarId}/versions/upload-url`
      const uploadUrlParams = new URLSearchParams({
        version: version,
        file_name: fileName
      })

      core.info(
        `Getting upload URL from: ${backendUrl}${uploadUrlEndpoint}?${uploadUrlParams}`
      )

      // Get upload URL
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
        const extractEndpoint = `/builds/versions/${versionId}/extract-package-id`
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
      const completeEndpoint = `/builds/versions/${versionId}/complete-upload`
      const completeBody = {
        version_id: versionId, // Add this required field
        metadata: parsedMetadata,
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

      artifactUrl = `org/${buildVarId}/${version}/${fileName}` // Approximate S3 key
      core.info('Upload completed successfully')
    }

    const uploadTime = Math.round((Date.now() - startTime) / 1000)

    // Set outputs
    core.setOutput('success', 'true')
    core.setOutput('version-id', versionId)
    core.setOutput('version', version)
    if (packageId) {
      core.setOutput('package-id', packageId)
    }
    if (artifactUrl) {
      core.setOutput('artifact-url', artifactUrl)
    }
    core.setOutput('upload-time', uploadTime.toString())

    core.info(`✅ Build upload completed successfully in ${uploadTime}s`)
    core.info(`   Version ID: ${versionId}`)
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
  run
}
