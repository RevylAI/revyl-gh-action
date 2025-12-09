const core = require('@actions/core')
const httpm = require('@actions/http-client')
const { monitorTaskViaSSE } = require('./monitor')

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
async function run() {
  try {
    // Check for API key first
    if (!process.env['REVYL_API_KEY']) {
      throw Error('Missing REVYL_API_KEY get API token from revyl settings')
    }

    // Get inputs and validate
    const testId = core.getInput('test-id', { required: false })
    const workflowId = core.getInput('workflow-id', { required: false })
    const retries = core.getInput('retries', { required: false }) || 1
    const buildVersionId =
      core.getInput('build-version-id', { required: false }) || null
    const timeoutSeconds = parseInt(
      core.getInput('timeout', { required: false }) || '3600',
      10
    )

    // Validate that either testId or workflowId is provided
    if (!testId && !workflowId) {
      throw Error('Either test-id or workflow-id must be provided')
    }
    if (testId && workflowId) {
      throw Error('Cannot provide both test-id and workflow-id')
    }

    const client = new httpm.HttpClient('revyl-run-action', [], {
      headers: {
        Authorization: `Bearer ${process.env['REVYL_API_KEY']}`,
        'Content-Type': 'application/json'
      }
    })

    // Determine the base URL and endpoints (updated for async execution)
    const deviceBaseUrl =
      core.getInput('revyl-device-url', { required: false }) ||
      'https://device.revyl.ai'
    const backendBaseUrl =
      core.getInput('backend-url', { required: false }) ||
      'https://backend.revyl.ai'

    const executionBaseUrl = deviceBaseUrl
    const statusBaseUrl = backendBaseUrl

    const initEndpoint = testId
      ? '/api/execute_test_id_async'
      : '/api/execute_workflow_id_async'
    const statusEndpoint = testId
      ? '/api/v1/tests/get_enhanced_test_execution_task'
      : '/api/v1/workflows/tasks/workflow_task'

    const initUrl = `${executionBaseUrl}${initEndpoint}`

    core.startGroup(`🚀 Starting ${testId ? 'Test' : 'Workflow'} Execution`)
    core.info(`🎯 ${testId ? 'Test' : 'Workflow'} ID: ${testId || workflowId}`)
    if (buildVersionId) {
      core.info(`📦 Build Version ID: ${buildVersionId}`)
    }
    core.info(`🌐 Execution URL: ${initUrl}`)
    core.info(
      `⏱️  Timeout: ${timeoutSeconds}s (${Math.round(timeoutSeconds / 60)} minutes)`
    )
    core.endGroup()

    // Construct the body based on whether we're running a test or workflow
    const body = testId
      ? {
          test_id: testId,
          retries,
          ...(buildVersionId && { build_version_id: buildVersionId })
        }
      : {
          workflow_id: workflowId,
          retries
        }

    const res = await client.postJson(initUrl, body)

    if (res.statusCode !== 200) {
      throw Error(
        `Failed to queue ${testId ? 'test' : 'workflow'}: API returned status code ${res.statusCode}`
      )
    }

    if (!res.result || !res.result.task_id) {
      throw Error(
        `Failed to queue ${testId ? 'test' : 'workflow'}: task_id missing in API response`
      )
    }

    const taskId = res.result.task_id
    core.setOutput('task_id', taskId)

    core.startGroup(`📡 Task Queued Successfully`)
    core.info(`🆔 Task ID: ${taskId}`)
    core.info(`🔄 Starting real-time SSE monitoring...`)
    core.endGroup()

    // Use SSE (Server-Sent Events) for real-time monitoring instead of polling
    const result = await monitorTaskViaSSE(
      taskId,
      testId,
      workflowId,
      statusBaseUrl,
      client,
      timeoutSeconds
    )

    const finalStatus = result?.status || result

    if (finalStatus === null) {
      throw Error(
        `Timeout of ${timeoutSeconds}s reached while waiting for task to finish`
      )
    }

    if (finalStatus === 'completed') {
      core.startGroup(
        `🎉 ${testId ? 'Test' : 'Workflow'} Execution Completed Successfully!`
      )
      core.notice(`✅ ${testId ? 'Test' : 'Workflow'} completed successfully`)
      core.info(`🆔 Task ID: ${taskId}`)
      // Report link will be shown in the SSE completion handler
      core.endGroup()
      core.setOutput('success', 'true')
      return true
    }

    // Handle failure cases with detailed information
    core.startGroup(`❌ ${testId ? 'Test' : 'Workflow'} Execution Failed`)
    core.setFailed(
      `${testId ? 'Test' : 'Workflow'} finished with status: ${finalStatus}`
    )
    core.info(`🆔 Task ID: ${taskId}`)

    // Error details and report links will be shown in the SSE failure handler
    core.notice(
      `Check the detailed logs above for error information and report links`
    )

    core.endGroup()
    core.setOutput('success', 'false')

    throw Error(
      `${testId ? 'Test' : 'Workflow'} finished with status '${finalStatus}'. Check logs or artifacts for details.`
    )
  } catch (error) {
    core.setFailed(error.message)
  }
}

module.exports = {
  run
}
