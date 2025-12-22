const core = require('@actions/core')
const EventSource = require('eventsource')

// Reconnection configuration
const MAX_RECONNECT_ATTEMPTS = 10
const MAX_BACKOFF_MS = 30000 // 30 seconds
const INITIAL_BACKOFF_MS = 1000 // 1 second

// Dashboard URL for test reports
const DASHBOARD_BASE_URL = 'https://app.revyl.ai'

/**
 * Calculate exponential backoff delay
 * @param {number} attempts - Number of reconnection attempts
 * @returns {number} Delay in milliseconds
 */
function calculateBackoffDelay(attempts) {
  // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
  return Math.min(MAX_BACKOFF_MS, INITIAL_BACKOFF_MS * Math.pow(2, attempts))
}

/**
 * Safely parse JSON from SSE event data
 * @param {any} event - The SSE event
 * @param {string} eventType - The event type for logging
 * @returns {object|null} Parsed data or null if parsing fails
 */
function safeParseEventData(event, eventType) {
  try {
    return JSON.parse(event.data)
  } catch (error) {
    core.error(`Failed to parse ${eventType} event data: ${error.message}`)
    core.debug(`Malformed event data: ${event.data}`)
    return null
  }
}

/**
 * Fetch final workflow results from API (fallback when SSE fails)
 * @param {string} taskId - The task ID
 * @param {string} backendBaseUrl - Backend base URL
 * @param {object} client - HTTP client
 * @returns {Promise<object|null>} Final results or null
 */
async function fetchFinalWorkflowResults(taskId, backendBaseUrl, client) {
  try {
    const url = `${backendBaseUrl}/api/v1/workflows/tasks/workflow_task/${taskId}`
    const res = await client.get(url)

    if (res.message.statusCode === 200) {
      const body = await res.readBody()
      const data = JSON.parse(body)

      // The response should be a WorkflowTasksBaseSchema
      const task = data.data || data

      // Calculate passed/failed from tests array
      let passed_tests = 0
      let failed_tests = 0

      if (task.tests && Array.isArray(task.tests)) {
        passed_tests = task.tests.filter(
          t => t.status === 'passed' || t.status === 'success'
        ).length
        failed_tests = task.tests.filter(
          t => t.status === 'failed' || t.status === 'error'
        ).length
      }

      return {
        status: task.status,
        success: task.success,
        total_tests: task.total_tests || 0,
        completed_tests: task.completed_tests || 0,
        passed_tests,
        failed_tests,
        tests: task.tests || []
      }
    }
  } catch (error) {
    core.warning(`Failed to fetch workflow results: ${error.message}`)
  }
  return null
}

/**
 * Monitor a workflow task via SSE with automatic reconnection
 * @param {string} taskId - The task ID to monitor
 * @param {string} workflowId - The workflow ID
 * @param {string} backendBaseUrl - Backend base URL for SSE
 * @param {object} client - HTTP client for additional requests
 * @param {number} timeoutSeconds - Maximum time to wait
 * @returns {Promise<string|null>} Final status or null if timeout
 */
async function monitorWorkflow(
  taskId,
  workflowId,
  backendBaseUrl,
  client,
  timeoutSeconds
) {
  return new Promise((resolve, reject) => {
    // State tracking for reconnection
    let reconnectAttempts = 0
    let currentEventSource = null
    let isIntentionallyClosed = false
    let finalStatus = null
    let workflowStarted = false
    let reconnectTimeoutHandle = null

    // Track child tests for this workflow
    const activeTests = new Map() // task_id -> { name, startTime }
    let testsPassed = 0
    let testsFailed = 0
    let workflowHeaderLogged = false // Prevent duplicate workflow header logging

    const sseUrl = `${backendBaseUrl}/api/v1/monitor/stream/unified`
    const timeoutMs = timeoutSeconds * 1000
    const startTime = Date.now()

    /**
     * Clean up all resources
     */
    function cleanup() {
      isIntentionallyClosed = true
      if (currentEventSource) {
        currentEventSource.close()
        currentEventSource = null
      }
      if (reconnectTimeoutHandle) {
        clearTimeout(reconnectTimeoutHandle)
        reconnectTimeoutHandle = null
      }
    }

    /**
     * Check if we've exceeded the overall timeout
     */
    function isTimedOut() {
      return Date.now() - startTime >= timeoutMs
    }

    /**
     * Get remaining time until timeout
     */
    function getRemainingTime() {
      return Math.max(0, timeoutMs - (Date.now() - startTime))
    }

    /**
     * Create and configure SSE connection
     */
    function createConnection() {
      if (isIntentionallyClosed) {
        return
      }

      if (isTimedOut()) {
        core.warning('Workflow monitoring timed out')
        cleanup()
        resolve(null)
        return
      }

      const attemptInfo = reconnectAttempts > 0
        ? ` (reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`
        : ''
      core.debug(`Connecting to SSE stream${attemptInfo}...`)

      const eventSource = new EventSource(sseUrl, {
        headers: { Authorization: `Bearer ${process.env['REVYL_API_KEY']}` }
      })
      currentEventSource = eventSource

      // Set a timeout for this connection attempt
      const connectionTimeout = setTimeout(() => {
        if (finalStatus === null && !isIntentionallyClosed) {
          core.warning('Workflow monitoring timed out')
          cleanup()
          resolve(null)
        }
      }, getRemainingTime())

      eventSource.onopen = () => {
        core.info('')
        core.info('🔗 SSE connection established')
        // Reset reconnection attempts on successful connection
        reconnectAttempts = 0
      }

      eventSource.onerror = error => {
        // Don't reconnect if we're done or intentionally closed
        if (isIntentionallyClosed || finalStatus !== null) {
          return
        }

        // Build error message
        let errorMsg = 'SSE connection error'
        if (error) {
          if (error.message) errorMsg += `: ${error.message}`
          else if (error.status) errorMsg += ` (HTTP ${error.status})`
        }

        core.warning(errorMsg)

        // Close current connection
        eventSource.close()
        currentEventSource = null

        // Check if we should attempt reconnection
        reconnectAttempts++

        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          core.error(`Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached`)
          clearTimeout(connectionTimeout)
          cleanup()

          // Try to fetch final status as fallback
          core.info('Attempting to fetch final status via REST API...')
          fetchFinalWorkflowResults(taskId, backendBaseUrl, client)
            .then(results => {
              if (results && results.status) {
                const status = results.status.toLowerCase()
                if (['completed', 'success'].includes(status)) {
                  setFinalOutputs(results, 'completed', true)
                  resolve('completed')
                } else if (['failed', 'error', 'timeout'].includes(status)) {
                  setFinalOutputs(results, 'failed', false)
                  resolve('failed')
                } else if (status === 'cancelled') {
                  setFinalOutputs(results, 'cancelled', false)
                  resolve('cancelled')
                } else {
                  // Still running or unknown - report as timeout
                  resolve(null)
                }
              } else {
                reject(new Error('SSE connection failed and could not fetch final status'))
              }
            })
            .catch(err => {
              reject(new Error(`SSE connection failed: ${err.message}`))
            })
          return
        }

        // Check if we still have time for reconnection
        if (isTimedOut()) {
          core.warning('No time remaining for reconnection')
          clearTimeout(connectionTimeout)
          cleanup()
          resolve(null)
          return
        }

        const delay = calculateBackoffDelay(reconnectAttempts - 1)
        core.info(`⏳ Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`)

        reconnectTimeoutHandle = setTimeout(() => {
          createConnection()
        }, delay)
      }

      eventSource.addEventListener('connection_ready', () => {
        // Silent - no need to log
      })

      eventSource.addEventListener('initial_state', event => {
        const data = safeParseEventData(event, 'initial_state')
        if (!data) return

        const runningWorkflows = data.running_workflows || []

        // Find our workflow in the array
        const ourWorkflow = runningWorkflows.find(
          wf => wf.task && wf.task.task_id === taskId
        )

        if (ourWorkflow) {
          workflowStarted = true

          // Only log workflow header once
          if (!workflowHeaderLogged) {
            workflowHeaderLogged = true
            const totalTests = ourWorkflow.task.total_tests || '?'
            core.info(`🚀 ${ourWorkflow.workflow_name} (${totalTests} tests)`)
            core.info('')
          }

          // Set initial outputs
          core.setOutput('status', ourWorkflow.task.status)
          core.setOutput('total_tests', (ourWorkflow.task.total_tests || 0).toString())
          core.setOutput('completed_tests', (ourWorkflow.task.completed_tests || 0).toString())
        } else if (workflowStarted) {
          // Workflow was previously seen but is no longer in running list
          core.info('Workflow no longer in running list - checking final status...')

          fetchFinalWorkflowResults(taskId, backendBaseUrl, client)
            .then(results => {
              if (results && results.status && finalStatus === null) {
                const status = results.status.toLowerCase()
                const totalTime = ((Date.now() - startTime) / 1000).toFixed(0)

                if (['completed', 'success'].includes(status)) {
                  logWorkflowSummary(true, results.workflow_name || workflowId, totalTime)
                  setFinalOutputs(results, 'completed', results.success !== false)
                  finalStatus = 'completed'
                  clearTimeout(connectionTimeout)
                  cleanup()
                  resolve('completed')
                } else if (['failed', 'error', 'timeout'].includes(status)) {
                  logWorkflowSummary(false, results.workflow_name || workflowId, totalTime)
                  setFinalOutputs(results, 'failed', false)
                  finalStatus = 'failed'
                  clearTimeout(connectionTimeout)
                  cleanup()
                  resolve('failed')
                } else if (status === 'cancelled') {
                  core.warning('⚠️ Workflow cancelled')
                  setFinalOutputs(results, 'cancelled', false)
                  finalStatus = 'cancelled'
                  clearTimeout(connectionTimeout)
                  cleanup()
                  resolve('cancelled')
                }
              }
            })
            .catch(err => {
              core.warning(`Could not fetch status after reconnection: ${err.message}`)
            })
        }
      })

      eventSource.addEventListener('workflow_started', event => {
        const data = safeParseEventData(event, 'workflow_started')
        if (!data) return

        if (
          data.workflow &&
          data.workflow.task &&
          data.workflow.task.task_id === taskId
        ) {
          const wf = data.workflow
          workflowStarted = true

          // Only log workflow header once
          if (!workflowHeaderLogged) {
            workflowHeaderLogged = true
            const totalTests = wf.task.total_tests || '?'
            core.info(`🚀 ${wf.workflow_name} (${totalTests} tests)`)
            core.info('')
          }

          core.setOutput('status', wf.task.status)
        }
      })

      eventSource.addEventListener('workflow_updated', event => {
        // Skip workflow updates - individual test progress is shown instead
      })

      eventSource.addEventListener('workflow_completed', event => {
        const data = safeParseEventData(event, 'workflow_completed')
        if (!data) return

        if (data.task_id === taskId) {
          finalStatus = 'completed'
          const totalTime = ((Date.now() - startTime) / 1000).toFixed(0)

          logWorkflowSummary(true, data.workflow_name || workflowId, totalTime)

          // Set final success outputs
          core.setOutput('success', 'true')
          core.setOutput('status', 'completed')

          // Fetch final results from the API
          fetchFinalWorkflowResults(taskId, backendBaseUrl, client)
            .then(results => {
              if (results) {
                core.setOutput('total_tests', (results.total_tests || 0).toString())
                core.setOutput('completed_tests', (results.completed_tests || 0).toString())
                core.setOutput('passed_tests', (results.passed_tests || 0).toString())
                core.setOutput('failed_tests', (results.failed_tests || 0).toString())
              }
            })
            .catch(err => core.warning(`Could not fetch final results: ${err.message}`))

          clearTimeout(connectionTimeout)
          cleanup()
          resolve(finalStatus)
        }
      })

      eventSource.addEventListener('workflow_failed', event => {
        const data = safeParseEventData(event, 'workflow_failed')
        if (!data) return

        if (data.task_id === taskId) {
          finalStatus = 'failed'
          const totalTime = ((Date.now() - startTime) / 1000).toFixed(0)

          logWorkflowSummary(false, data.workflow_name || workflowId, totalTime)

          // Set failure outputs
          core.setOutput('success', 'false')
          core.setOutput('status', 'failed')

          // Fetch final results from the API
          fetchFinalWorkflowResults(taskId, backendBaseUrl, client)
            .then(results => {
              if (results) {
                core.setOutput('total_tests', (results.total_tests || 0).toString())
                core.setOutput('completed_tests', (results.completed_tests || 0).toString())
                core.setOutput('passed_tests', (results.passed_tests || 0).toString())
                core.setOutput('failed_tests', (results.failed_tests || 0).toString())

                // Check for failed tests
                if (results.tests && Array.isArray(results.tests)) {
                  const failedTests = results.tests.filter(
                    t => t.status === 'failed' || t.status === 'error'
                  )
                  if (failedTests.length > 0 && failedTests[0].error) {
                    core.setOutput('error_message', failedTests[0].error)
                  }
                }
              }
            })
            .catch(err => core.warning(`Could not fetch final results: ${err.message}`))

          clearTimeout(connectionTimeout)
          cleanup()
          resolve(finalStatus)
        }
      })

      eventSource.addEventListener('workflow_cancelled', event => {
        const data = safeParseEventData(event, 'workflow_cancelled')
        if (!data) return

        if (data.task_id === taskId) {
          core.warning(`⚠️ Workflow cancelled`)

          finalStatus = 'cancelled'
          core.setOutput('success', 'false')
          core.setOutput('status', 'cancelled')

          clearTimeout(connectionTimeout)
          cleanup()
          resolve(finalStatus)
        }
      })

      eventSource.addEventListener('heartbeat', () => {
        // Keep-alive signal - connection is healthy
      })

      // === TEST EVENTS ===
      eventSource.addEventListener('test_started', event => {
        const data = safeParseEventData(event, 'test_started')
        if (!data) return

        const test = data.test
        if (test && test.parent_workflow_task_id === taskId) {
          const testTaskId = test.task_id

          // Only log test info once (prevent duplicates from reconnection)
          if (!activeTests.has(testTaskId)) {
            const testName = test.test_name || 'Unknown Test'
            const reportUrl = `${DASHBOARD_BASE_URL}/tests/report?taskId=${testTaskId}`

            activeTests.set(testTaskId, { name: testName, startTime: Date.now() })

            core.info(`  🧪 ${testName}`)
            core.info(`     📋 Report: ${reportUrl}`)
          }
        }
      })

      eventSource.addEventListener('test_updated', () => {
        // Skip step updates - user can watch live report
      })

      eventSource.addEventListener('test_completed', event => {
        handleTestCompletion(event, 'test_completed', true)
      })

      eventSource.addEventListener('test_completed_with_data', event => {
        handleTestCompletion(event, 'test_completed_with_data', true)
      })

      eventSource.addEventListener('test_failed', event => {
        handleTestCompletion(event, 'test_failed', false)
      })

      eventSource.addEventListener('test_failed_with_data', event => {
        handleTestCompletion(event, 'test_failed_with_data', false)
      })

      eventSource.addEventListener('test_cancelled_with_data', event => {
        const data = safeParseEventData(event, 'test_cancelled_with_data')
        if (!data) return

        const testTaskId = data.task_id
        if (activeTests.has(testTaskId)) {
          core.warning(`     ⚠️ cancelled`)
          core.info('')
          activeTests.delete(testTaskId)
        }
      })

      /**
       * Helper to handle test completion (passed or failed)
       */
      function handleTestCompletion(event, eventType, passed) {
        const data = safeParseEventData(event, eventType)
        if (!data) return

        const testTaskId = data.task_id
        if (activeTests.has(testTaskId)) {
          const testInfo = activeTests.get(testTaskId)
          const duration = ((Date.now() - testInfo.startTime) / 1000).toFixed(0)

          if (passed) {
            testsPassed++
            core.info(`     ✅ passed (${duration}s)`)
          } else {
            testsFailed++
            core.info(`     ❌ failed (${duration}s)`)
          }
          core.info('')

          activeTests.delete(testTaskId)
        }
      }

      /**
       * Log the workflow summary
       */
      function logWorkflowSummary(success, workflowName, totalTime) {
        core.info('')
        core.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        if (success) {
          core.info(`${workflowName} completed in ${totalTime}s`)
        } else {
          core.info(`${workflowName} failed after ${totalTime}s`)
        }
        core.info(`${testsPassed} passed, ${testsFailed} failed`)
        core.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      }

      eventSource.addEventListener('error', event => {
        const data = safeParseEventData(event, 'error')
        if (data) {
          const errorMessage = data.error || data.message || 'Unknown SSE error'
          core.error(`SSE error event: ${errorMessage}`)

          // For explicit error events, don't reconnect - these are usually auth errors
          clearTimeout(connectionTimeout)
          cleanup()
          reject(new Error(`SSE error: ${errorMessage}`))
        }
        // Non-JSON error events are handled by onerror
      })
    }

    /**
     * Helper to set final outputs
     */
    function setFinalOutputs(results, status, success) {
      core.setOutput('success', success ? 'true' : 'false')
      core.setOutput('status', status)
      if (results) {
        core.setOutput('total_tests', (results.total_tests || 0).toString())
        core.setOutput('completed_tests', (results.completed_tests || 0).toString())
        core.setOutput('passed_tests', (results.passed_tests || 0).toString())
        core.setOutput('failed_tests', (results.failed_tests || 0).toString())
      }
    }

    // Start the initial connection
    createConnection()
  })
}

module.exports = { monitorWorkflow }
