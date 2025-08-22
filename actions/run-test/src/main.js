const core = require('@actions/core')
const httpm = require('@actions/http-client')

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
    const deviceUrl = core.getInput('revyl-device-url', { required: false })
    const retries = core.getInput('retries', { required: false }) || 1
    const llm_model_name =
      core.getInput('llm_model_name', { required: false }) || ''
    const timeoutSeconds = parseInt(
      core.getInput('timeout', { required: false }) || '3600',
      10
    )
    let pollIntervalSeconds = parseInt(
      core.getInput('poll-interval', { required: false }) || '15',
      10
    )

    // Enforce sensible polling interval (>=5 seconds)
    const MIN_POLL_INTERVAL = 5
    if (
      Number.isNaN(pollIntervalSeconds) ||
      pollIntervalSeconds < MIN_POLL_INTERVAL
    ) {
      core.warning(
        `poll-interval must be an integer greater than or equal to ${MIN_POLL_INTERVAL}. Using ${MIN_POLL_INTERVAL} instead.`
      )
      pollIntervalSeconds = MIN_POLL_INTERVAL
    }

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
    const executionBaseUrl = deviceUrl || 'https://device-staging.cognisim.io'
    const statusBaseUrl = 'https://backend-staging.cognisim.io'

    const initEndpoint = testId
      ? '/api/execute_test_id_async'
      : '/api/execute_workflow_id_async'
    const statusEndpoint = testId
      ? '/api/v1/tests/get_enhanced_test_execution_task'
      : '/api/v1/workflows/tasks/workflow_task'

    const initUrl = `${executionBaseUrl}${initEndpoint}`

    console.log('ID:', testId || workflowId)
    console.log('Initial URL:', initUrl)

    // Construct the body based on whether we're running a test or workflow
    const body = testId
      ? {
          test_id: testId,
          retries,
          ...(llm_model_name && { llm_model_name })
        }
      : {
          workflow_id: workflowId,
          retries,
          ...(llm_model_name && { llm_model_name })
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

    console.log(`Task queued with id: ${taskId}. Starting polling.`)

    const startTime = Date.now()
    let elapsedSeconds = 0
    let finalStatus = null

    while (elapsedSeconds < timeoutSeconds) {
      // eslint-disable-next-line no-await-in-loop
      let statusUrl
      let taskInfo

      if (testId) {
        // For tests: use individual endpoint with task_id parameter
        statusUrl = `${statusBaseUrl}${statusEndpoint}?task_id=${taskId}`
        const statusRes = await client.getJson(statusUrl)
        if (statusRes.statusCode !== 200) {
          throw Error(`Status endpoint returned ${statusRes.statusCode}`)
        }

        taskInfo = statusRes.result

        if (!taskInfo) {
          throw Error('Malformed test status response: task info missing')
        }
      } else {
        // For workflows: use individual endpoint
        statusUrl = `${statusBaseUrl}${statusEndpoint}/${taskId}`
        const statusRes = await client.getJson(statusUrl)
        if (statusRes.statusCode !== 200) {
          throw Error(`Status endpoint returned ${statusRes.statusCode}`)
        }

        taskInfo = statusRes.result

        if (!taskInfo) {
          throw Error('Malformed workflow status response: task info missing')
        }
      }

      const currentStatus = taskInfo.status

      // Build detailed progress message
      let progressMessage = `Status: ${currentStatus}`
      if (taskInfo.phase) {
        progressMessage += ` | Phase: ${taskInfo.phase}`
      }

      if (testId) {
        // For test execution: show current step progress
        if (taskInfo.current_step) {
          progressMessage += ` | Current Step: "${taskInfo.current_step}"`
        }
        if (taskInfo.current_step_index !== undefined && taskInfo.total_steps) {
          const stepProgress = `${taskInfo.current_step_index + 1}/${taskInfo.total_steps}`
          progressMessage += ` | Step Progress: ${stepProgress}`
        }
      } else {
        // For workflow execution: show current test and overall progress
        if (taskInfo.current_test) {
          const testName =
            taskInfo.current_test.test_name || taskInfo.current_test.test_id
          const platform = taskInfo.current_test.platform
            ? ` (${taskInfo.current_test.platform})`
            : ''
          progressMessage += ` | Current Test: "${testName}"${platform}`
        }
        if (taskInfo.completed_tests !== undefined && taskInfo.total_tests) {
          const testProgress = `${taskInfo.completed_tests}/${taskInfo.total_tests}`
          progressMessage += ` | Test Progress: ${testProgress}`

          // Calculate and show percentage
          const percentage = Math.round(
            (taskInfo.completed_tests / taskInfo.total_tests) * 100
          )
          progressMessage += ` (${percentage}%)`
        }
      }

      core.info(progressMessage)

      if (['completed', 'failed', 'cancelled'].includes(currentStatus)) {
        finalStatus = currentStatus

        // Set additional outputs for GitHub Actions integration
        if (taskInfo.execution_time) {
          core.setOutput('execution_time', taskInfo.execution_time)
        }
        if (taskInfo.platform) {
          core.setOutput('platform', taskInfo.platform)
        }

        // For workflows: provide summary information
        if (workflowId) {
          if (taskInfo.total_tests) {
            core.setOutput('total_tests', taskInfo.total_tests.toString())
            core.setOutput(
              'completed_tests',
              (taskInfo.completed_tests || 0).toString()
            )
          }
          if (taskInfo.test_results && Array.isArray(taskInfo.test_results)) {
            const passedTests = taskInfo.test_results.filter(
              r => r.status === 'completed'
            ).length
            const failedTests = taskInfo.test_results.filter(
              r => r.status === 'failed'
            ).length
            core.setOutput('passed_tests', passedTests.toString())
            core.setOutput('failed_tests', failedTests.toString())
          }
        }

        // For tests: provide step information
        if (testId && taskInfo.total_steps) {
          core.setOutput('total_steps', taskInfo.total_steps.toString())
          core.setOutput(
            'completed_steps',
            (taskInfo.current_step_index || 0).toString()
          )
        }

        // Set error information if available
        if (finalStatus === 'failed' && taskInfo.error) {
          core.setOutput('error_message', taskInfo.error)
        }

        break
      }

      // Wait before next poll
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve =>
        setTimeout(resolve, pollIntervalSeconds * 1000)
      )
      elapsedSeconds = Math.floor((Date.now() - startTime) / 1000)
    }

    if (finalStatus === null) {
      throw Error(
        `Timeout of ${timeoutSeconds}s reached while waiting for task to finish`
      )
    }

    if (finalStatus === 'completed') {
      core.setOutput('success', 'true')
      return true
    }

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
