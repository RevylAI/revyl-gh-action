const core = require('@actions/core')
const httpm = require('@actions/http-client')
const EventSource = require('eventsource')
const fetch = require('node-fetch')

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
      core.info(
        '🔗 SSE connection established - monitoring test execution in real-time'
      )
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
      core.info(`🏢 Connected to organization: ${data.org_id}`)
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
        core.startGroup(`🚀 Test Started: ${data.test.test_name || testId}`)
        logProgress(data.test, testId, workflowId)
        core.endGroup()
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
    eventSource.addEventListener('test_completed_with_data', async event => {
      const data = JSON.parse(event.data)
      if (data.task_id === taskId) {
        core.startGroup(`✅ Test Completed Successfully: ${data.test_name}`)

        // Extract report link from completed test data
        if (data.completed_test) {
          core.info('🔗 Generating shareable report link...')
          reportLink = await generateShareableReportLink(
            data.completed_test,
            baseUrl
          )
          if (reportLink) {
            // Use GitHub's built-in notice feature for important information
            core.notice(`📊 Test Report: ${reportLink}`, {
              title: '✅ Test Completed Successfully',
              file: 'test-execution'
            })
            core.setOutput('report_link', reportLink)

            // Add job summary with rich formatting
            core.summary
              .addHeading('🎉 Test Execution Completed', 2)
              .addRaw(
                `
**Test ID:** \`${data.test_name}\`
**Status:** ✅ Success
**Report:** [View Detailed Report](${reportLink})

The test has completed successfully! Click the report link above to view detailed execution logs, screenshots, and performance metrics.
              `
              )
              .write()
          } else {
            core.warning('⚠️  Could not generate shareable report link')
          }

          // Set additional outputs from completed test data
          setOutputsFromCompletedTest(data.completed_test, testId, workflowId)
        }

        core.endGroup()
        finalStatus = 'completed'
        eventSource.close()
        clearTimeout(timeoutHandle)
        resolve(finalStatus)
      }
    })

    // Handle test failure with data
    eventSource.addEventListener('test_failed_with_data', async event => {
      const data = JSON.parse(event.data)
      if (data.task_id === taskId) {
        core.startGroup(`❌ Test Failed: ${data.test_name}`)

        // Extract report link from failed test data
        if (data.failed_test) {
          core.info('🔗 Generating shareable report link for failed test...')
          reportLink = await generateShareableReportLink(
            data.failed_test,
            baseUrl
          )
          if (reportLink) {
            // Use GitHub's error annotation for failures
            core.error(`❌ Test Failed: ${data.test_name}`, {
              title: 'Test Execution Failed',
              file: 'test-execution'
            })

            core.notice(`📊 Failure Report: ${reportLink}`, {
              title: '🔍 Debug Information Available'
            })
            core.setOutput('report_link', reportLink)

            // Add failure summary with debugging info
            core.summary
              .addHeading('❌ Test Execution Failed', 2)
              .addRaw(
                `
**Test ID:** \`${data.test_name}\`
**Status:** ❌ Failed
**Report:** [View Failure Analysis](${reportLink})

The test execution failed. The detailed report contains:
- 📸 Screenshots at failure point
- 📋 Execution logs and error details  
- 🔍 Step-by-step execution trace
- 💡 Suggested debugging steps

Click the report link above to investigate the failure.
              `
              )
              .write()
          } else {
            core.warning('⚠️  Could not generate shareable report link')
          }

          // Set additional outputs from failed test data
          setOutputsFromCompletedTest(data.failed_test, testId, workflowId)
        }

        core.endGroup()
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
          core.startGroup(`✅ Workflow Completed Successfully: ${workflowId}`)

          // Set workflow-specific outputs if available in the data
          if (data.workflow_results) {
            const results = data.workflow_results
            if (results.total_tests !== undefined) {
              core.setOutput('total_tests', results.total_tests.toString())
            }
            if (results.completed_tests !== undefined) {
              core.setOutput(
                'completed_tests',
                results.completed_tests.toString()
              )
            }
            if (results.passed_tests !== undefined) {
              core.setOutput('passed_tests', results.passed_tests.toString())
            }
            if (results.failed_tests !== undefined) {
              core.setOutput('failed_tests', results.failed_tests.toString())
            }
          }

          core.notice(`✅ Workflow completed successfully`)
          core.info(`🆔 Task ID: ${taskId}`)
          core.endGroup()

          finalStatus = 'completed'
          eventSource.close()
          clearTimeout(timeoutHandle)
          resolve(finalStatus)
        }
      })

      eventSource.addEventListener('workflow_failed', event => {
        const data = JSON.parse(event.data)
        if (data.task_id === taskId) {
          core.startGroup(`❌ Workflow Failed: ${workflowId}`)

          // Set workflow-specific outputs even for failed workflows if available
          if (data.workflow_results) {
            const results = data.workflow_results
            if (results.total_tests !== undefined) {
              core.setOutput('total_tests', results.total_tests.toString())
            }
            if (results.completed_tests !== undefined) {
              core.setOutput(
                'completed_tests',
                results.completed_tests.toString()
              )
            }
            if (results.passed_tests !== undefined) {
              core.setOutput('passed_tests', results.passed_tests.toString())
            }
            if (results.failed_tests !== undefined) {
              core.setOutput('failed_tests', results.failed_tests.toString())
            }
          }

          core.error(`❌ Workflow failed`, {
            title: 'Workflow Execution Failed',
            file: 'workflow-execution'
          })
          core.info(`🆔 Task ID: ${taskId}`)
          core.endGroup()

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
 * Log progress information with clean, single-line updates
 */
function logProgress(taskInfo, testId, workflowId) {
  const currentStatus = taskInfo.status

  // Status emoji mapping
  const statusEmojis = {
    queued: '⏳',
    running: '🏃',
    setup: '🔧',
    executing: '⚡',
    teardown: '🧹',
    completed: '✅',
    failed: '❌',
    cancelled: '🚫'
  }

  const statusEmoji =
    statusEmojis[currentStatus] || statusEmojis[taskInfo.phase] || '📊'

  if (testId) {
    // For test execution: clean single-line format
    let message = `${statusEmoji} Status: ${currentStatus.toUpperCase()}`

    if (taskInfo.phase && taskInfo.phase !== currentStatus) {
      message += ` | Phase: ${taskInfo.phase}`
    }

    if (taskInfo.current_step) {
      message += ` | Step: "${taskInfo.current_step}"`
    }

    if (taskInfo.current_step_index !== undefined && taskInfo.total_steps) {
      const stepProgress = taskInfo.current_step_index + 1
      message += ` | Progress: ${stepProgress}/${taskInfo.total_steps}`
    }

    if (taskInfo.progress !== undefined) {
      const percentage = Math.round(taskInfo.progress * 100)
      message += ` | ${percentage}%`
    }

    core.info(message)
  } else if (workflowId) {
    // For workflow execution: clean single-line format
    let message = `${statusEmoji} Workflow: ${currentStatus.toUpperCase()}`

    if (taskInfo.current_test) {
      const testName = taskInfo.current_test_name || taskInfo.current_test
      message += ` | Current: "${testName}"`
    }

    if (taskInfo.completed_tests !== undefined && taskInfo.total_tests) {
      const percentage = Math.round(
        (taskInfo.completed_tests / taskInfo.total_tests) * 100
      )
      message += ` | Tests: ${taskInfo.completed_tests}/${taskInfo.total_tests} (${percentage}%)`
    }

    core.info(message)
  }
}

/**
 * Generate a shareable report link from completed test data
 */
async function generateShareableReportLink(completedTestData, baseUrl) {
  try {
    // Extract test_id and history_id from completed test data
    let testId = null
    let historyId = null

    // Try to get test history ID from enhanced task data
    const enhancedTask = completedTestData.enhanced_task
    if (enhancedTask && enhancedTask.test_history_id) {
      testId = completedTestData.test_uid || enhancedTask.test_id
      historyId = enhancedTask.test_history_id
    } else {
      // Fallback: try to extract from metadata
      let metadata = completedTestData.metadata
      if (typeof metadata === 'string') {
        metadata = JSON.parse(metadata)
      }

      if (metadata && metadata.test_history_id) {
        testId = completedTestData.test_uid || completedTestData.id
        historyId = metadata.test_history_id
      } else if (completedTestData.id && completedTestData.test_uid) {
        // Another fallback: use the completed test ID directly
        testId = completedTestData.test_uid
        historyId = completedTestData.id
      }
    }

    if (!testId || !historyId) {
      console.warn(
        'Could not extract test_id or history_id from completed test data'
      )
      return null
    }

    // Call the shareable report link API (use backend URL, not device URL)
    const backendUrl = 'https://backend-staging.cognisim.io'
    const apiUrl = `${backendUrl}/api/v1/report/async-run/generate_shareable_report_link`

    console.log(
      `Generating shareable link for test_id: ${testId}, history_id: ${historyId}`
    )
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env['REVYL_API_KEY']}`
      },
      body: JSON.stringify({
        test_id: testId,
        history_id: historyId,
        origin: 'https://app.revyl.ai' // Use proper frontend origin
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.warn(
        `Failed to generate shareable link: ${response.status} ${response.statusText}`
      )
      console.warn(`Error response body: ${errorText}`)
      return null
    }

    const result = await response.json()
    return result.shareable_link || result.link || null
  } catch (error) {
    console.warn('Failed to generate shareable report link:', error.message)
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
    const executionBaseUrl = 'https://device-staging.cognisim.io'
    const statusBaseUrl = 'https://backend-staging.cognisim.io'

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
