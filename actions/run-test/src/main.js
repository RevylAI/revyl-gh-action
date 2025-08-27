const core = require('@actions/core')
const httpm = require('@actions/http-client')
const { EventSource } = require('eventsource')

/**
 * Monitor task execution via Server-Sent Events (SSE)
 * @param {string} taskId - The task ID to monitor
 * @param {string} testId - The test ID (if monitoring a test)
 * @param {string} workflowId - The workflow ID (if monitoring a workflow)
 * @param {string} baseUrl - The base URL for the backend
 * @param {httpm.HttpClient} client - HTTP client for additional requests
 * @param {number} timeoutSeconds - Maximum time to wait
 * @returns {Promise<string|null>} Final status or null if timeout
 */
async function monitorTaskViaSSE(
  taskId,
  testId,
  workflowId,
  baseUrl,
  client,
  timeoutSeconds
) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    let finalStatus = null
    let reportLink = null

    // Create SSE connection to the monitor stream
    const sseUrl = `${baseUrl}/api/v1/tests/monitor/stream?include_queued=true`
    const eventSource = new EventSource(sseUrl, {
      headers: {
        Authorization: `Bearer ${process.env['REVYL_API_KEY']}`
      }
    })

    // Set up timeout
    const timeoutHandle = setTimeout(() => {
      eventSource.close()
      if (finalStatus === null) {
        resolve(null) // Timeout
      }
    }, timeoutSeconds * 1000)

    // Handle SSE events
    eventSource.onopen = () => {
      console.log('SSE connection established')
    }

    eventSource.onerror = error => {
      console.error('SSE connection error:', error)
      eventSource.close()
      clearTimeout(timeoutHandle)
      reject(new Error(`SSE connection failed: ${error.message || error}`))
    }

    // Handle connection ready event
    eventSource.addEventListener('connection_ready', event => {
      const data = JSON.parse(event.data)
      console.log(`SSE connected for org: ${data.org_id}`)
    })

    // Handle initial state (may contain our task if already running)
    eventSource.addEventListener('initial_state', event => {
      const data = JSON.parse(event.data)
      const runningTests = data.running_tests || []

      // Check if our task is already in the initial state
      const ourTask = runningTests.find(test => test.task_id === taskId)
      if (ourTask) {
        logProgress(ourTask, testId, workflowId)
      }
    })

    // Handle test started events
    eventSource.addEventListener('test_started', event => {
      const data = JSON.parse(event.data)
      if (data.test && data.test.task_id === taskId) {
        console.log(`Test started: ${data.test.test_name || testId}`)
        logProgress(data.test, testId, workflowId)
      }
    })

    // Handle test updated events (progress)
    eventSource.addEventListener('test_updated', event => {
      const data = JSON.parse(event.data)
      if (data.test && data.test.task_id === taskId) {
        logProgress(data.test, testId, workflowId)
      }
    })

    // Handle test completion with data
    eventSource.addEventListener('test_completed_with_data', event => {
      const data = JSON.parse(event.data)
      if (data.task_id === taskId) {
        console.log(`✅ Test completed successfully: ${data.test_name}`)

        // Extract report link from completed test data
        if (data.completed_test) {
          reportLink = extractReportLink(data.completed_test, baseUrl)
          if (reportLink) {
            console.log(`📊 Report available at: ${reportLink}`)
            core.setOutput('report_link', reportLink)
          }

          // Set additional outputs from completed test data
          setOutputsFromCompletedTest(data.completed_test, testId, workflowId)
        }

        finalStatus = 'completed'
        eventSource.close()
        clearTimeout(timeoutHandle)
        resolve(finalStatus)
      }
    })

    // Handle test failure with data
    eventSource.addEventListener('test_failed_with_data', event => {
      const data = JSON.parse(event.data)
      if (data.task_id === taskId) {
        console.log(`❌ Test failed: ${data.test_name}`)

        // Extract report link from failed test data
        if (data.failed_test) {
          reportLink = extractReportLink(data.failed_test, baseUrl)
          if (reportLink) {
            console.log(`📊 Report available at: ${reportLink}`)
            core.setOutput('report_link', reportLink)
          }

          // Set additional outputs from failed test data
          setOutputsFromCompletedTest(data.failed_test, testId, workflowId)
        }

        finalStatus = 'failed'
        eventSource.close()
        clearTimeout(timeoutHandle)
        resolve(finalStatus)
      }
    })

    // Handle basic completion events (fallback if no data available)
    eventSource.addEventListener('test_completed', event => {
      const data = JSON.parse(event.data)
      if (data.task_id === taskId) {
        console.log(`✅ Test completed: ${data.test_name}`)
        finalStatus = 'completed'
        eventSource.close()
        clearTimeout(timeoutHandle)
        resolve(finalStatus)
      }
    })

    // Handle basic failure events (fallback if no data available)
    eventSource.addEventListener('test_failed', event => {
      const data = JSON.parse(event.data)
      if (data.task_id === taskId) {
        console.log(`❌ Test failed: ${data.test_name}`)
        finalStatus = 'failed'
        eventSource.close()
        clearTimeout(timeoutHandle)
        resolve(finalStatus)
      }
    })

    // Handle cancellation events
    eventSource.addEventListener('test_cancelled', event => {
      const data = JSON.parse(event.data)
      if (data.task_id === taskId) {
        console.log(`🚫 Test cancelled: ${data.test_name}`)
        finalStatus = 'cancelled'
        eventSource.close()
        clearTimeout(timeoutHandle)
        resolve(finalStatus)
      }
    })

    // Handle workflow events if monitoring a workflow
    if (workflowId) {
      // Similar handlers for workflow events...
      eventSource.addEventListener('workflow_completed', event => {
        const data = JSON.parse(event.data)
        if (data.task_id === taskId) {
          console.log(`✅ Workflow completed: ${workflowId}`)
          finalStatus = 'completed'
          eventSource.close()
          clearTimeout(timeoutHandle)
          resolve(finalStatus)
        }
      })

      eventSource.addEventListener('workflow_failed', event => {
        const data = JSON.parse(event.data)
        if (data.task_id === taskId) {
          console.log(`❌ Workflow failed: ${workflowId}`)
          finalStatus = 'failed'
          eventSource.close()
          clearTimeout(timeoutHandle)
          resolve(finalStatus)
        }
      })
    }

    // Handle heartbeat events (keep connection alive)
    eventSource.addEventListener('heartbeat', event => {
      const data = JSON.parse(event.data)
      // Don't log every heartbeat, just use it to detect connection health
      if (data.active_tests === 0 && Date.now() - startTime > 30000) {
        // If no active tests for 30+ seconds, something might be wrong
        console.log('No active tests detected in heartbeat')
      }
    })

    // Handle error events
    eventSource.addEventListener('error', event => {
      const data = JSON.parse(event.data)
      console.error('SSE error event:', data.error || data.message)
      eventSource.close()
      clearTimeout(timeoutHandle)
      reject(new Error(`SSE error: ${data.error || data.message}`))
    })
  })
}

/**
 * Log progress information for a test or workflow
 */
function logProgress(taskInfo, testId, workflowId) {
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
    if (taskInfo.progress !== undefined) {
      const percentage = Math.round(taskInfo.progress * 100)
      progressMessage += ` | Progress: ${percentage}%`
    }
  } else if (workflowId) {
    // For workflow execution: show current test and overall progress
    if (taskInfo.current_test) {
      const testName = taskInfo.current_test_name || taskInfo.current_test
      progressMessage += ` | Current Test: "${testName}"`
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
}

/**
 * Extract report link from completed test data
 */
function extractReportLink(completedTestData, baseUrl) {
  try {
    // Try to get test history ID from enhanced task data
    const enhancedTask = completedTestData.enhanced_task
    if (enhancedTask && enhancedTask.test_history_id) {
      // Generate report link using test history ID
      const testId = completedTestData.test_uid || enhancedTask.test_id
      return `${baseUrl}/tests/${testId}/history/${enhancedTask.test_history_id}`
    }

    // Fallback: try to extract from metadata
    let metadata = completedTestData.metadata
    if (typeof metadata === 'string') {
      metadata = JSON.parse(metadata)
    }

    if (metadata && metadata.test_history_id) {
      const testId = completedTestData.test_uid || completedTestData.id
      return `${baseUrl}/tests/${testId}/history/${metadata.test_history_id}`
    }

    // Another fallback: use the completed test ID directly
    if (completedTestData.id && completedTestData.test_uid) {
      return `${baseUrl}/tests/${completedTestData.test_uid}/history/${completedTestData.id}`
    }

    return null
  } catch (error) {
    console.warn('Failed to extract report link:', error.message)
    return null
  }
}

/**
 * Set GitHub Actions outputs from completed test data
 */
function setOutputsFromCompletedTest(completedTestData, testId, workflowId) {
  try {
    const enhancedTask = completedTestData.enhanced_task || {}

    // Set execution time
    if (completedTestData.duration) {
      const duration = formatDuration(completedTestData.duration)
      core.setOutput('execution_time', duration)
    }

    // Set platform
    if (enhancedTask.platform) {
      core.setOutput('platform', enhancedTask.platform)
    }

    // Set step information for tests
    if (testId) {
      if (enhancedTask.total_steps) {
        core.setOutput('total_steps', enhancedTask.total_steps.toString())
      }
      if (enhancedTask.current_step_index !== undefined) {
        core.setOutput(
          'completed_steps',
          (enhancedTask.current_step_index + 1).toString()
        )
      }
    }

    // Set error information if available
    if (completedTestData.status === 'failed' && enhancedTask.error_message) {
      core.setOutput('error_message', enhancedTask.error_message)
    }

    // Set success flag
    core.setOutput(
      'success',
      (completedTestData.status === 'completed').toString()
    )
  } catch (error) {
    console.warn(
      'Failed to set outputs from completed test data:',
      error.message
    )
  }
}

/**
 * Format duration from seconds to HH:MM:SS
 */
function formatDuration(seconds) {
  if (!seconds || typeof seconds !== 'number') return null

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = Math.floor(seconds % 60)

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
}

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
    const buildVersionId = core.getInput('build-version-id', { required: false }) || null
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
          ...(llm_model_name && { llm_model_name }),
          ...(buildVersionId && { build_version_id: buildVersionId })
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

    console.log(`Task queued with id: ${taskId}. Starting SSE monitoring.`)

    // Use SSE (Server-Sent Events) for real-time monitoring instead of polling
    const finalStatus = await monitorTaskViaSSE(
      taskId,
      testId,
      workflowId,
      statusBaseUrl,
      client,
      timeoutSeconds
    )

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
