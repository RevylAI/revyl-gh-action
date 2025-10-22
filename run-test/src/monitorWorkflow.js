const core = require('@actions/core')
const EventSource = require('eventsource')

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
    core.error(
      `Failed to parse ${eventType} event data: ${error.message}`
    )
    core.debug(`Malformed event data: ${event.data}`)
    return null
  }
}

/**
 * Monitor a workflow task via SSE using the unified stream endpoint
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
    let finalStatus = null

    const sseUrl = `${backendBaseUrl}/api/v1/monitor/stream/unified`
    const eventSource = new EventSource(sseUrl, {
      headers: { Authorization: `Bearer ${process.env['REVYL_API_KEY']}` }
    })

    const timeoutHandle = setTimeout(() => {
      eventSource.close()
      if (finalStatus === null) resolve(null)
    }, timeoutSeconds * 1000)

    eventSource.onopen = () => {
      core.info(
        '🔗 SSE connection established - monitoring workflow execution in real-time'
      )
    }

    eventSource.onerror = error => {
      // EventSource error events don't contain detailed error info
      // Try to extract what we can
      let errorMsg = 'SSE connection failed'

      if (error) {
        // Check various properties that might exist
        if (error.message) errorMsg += `: ${error.message}`
        else if (error.status) errorMsg += ` (HTTP ${error.status})`
        else if (error.type === 'error') errorMsg += ' - check network connectivity and authentication'
      }

      core.error(errorMsg)

      eventSource.close()
      clearTimeout(timeoutHandle)
      reject(new Error(errorMsg))
    }

    eventSource.addEventListener('connection_ready', event => {
      const data = safeParseEventData(event, 'connection_ready')
      if (data) {
        core.info(`🏢 Connected to organization: ${data.org_id}`)
      }
    })

    eventSource.addEventListener('initial_state', event => {
      const data = safeParseEventData(event, 'initial_state')
      if (!data) return

      const runningWorkflows = data.running_workflows || []

      // Find our workflow in the array (workflows are OrgWorkflowMonitorItem objects)
      const ourWorkflow = runningWorkflows.find(
        wf => wf.task && wf.task.task_id === taskId
      )

      if (ourWorkflow) {
        const task = ourWorkflow.task
        const progress = ourWorkflow.progress || 0

        core.info(`📊 Workflow: ${ourWorkflow.workflow_name}`)
        core.info(`📈 Progress: ${(progress * 100).toFixed(1)}%`)
        core.info(`🔄 Status: ${task.status}`)

        if (task.total_tests) {
          core.info(
            `🧪 Tests: ${task.completed_tests || 0}/${task.total_tests}`
          )
        }

        // Set initial outputs
        core.setOutput('status', task.status)
        core.setOutput('total_tests', (task.total_tests || 0).toString())
        core.setOutput(
          'completed_tests',
          (task.completed_tests || 0).toString()
        )
      } else {
        core.info(
          `📡 Connected to unified stream - waiting for workflow ${workflowId} (task: ${taskId}) to start...`
        )
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
        core.info(`🚀 Workflow started: ${wf.workflow_name}`)
        core.setOutput('status', wf.task.status)
      }
    })

    eventSource.addEventListener('workflow_updated', event => {
      const data = safeParseEventData(event, 'workflow_updated')
      if (!data) return

      if (
        data.workflow &&
        data.workflow.task &&
        data.workflow.task.task_id === taskId
      ) {
        const wf = data.workflow
        const task = wf.task
        const progress = wf.progress || 0

        core.info(
          `📊 Status: ${task.status} | Progress: ${(progress * 100).toFixed(1)}%`
        )

        if (task.total_tests) {
          core.info(
            `🧪 Tests: ${task.completed_tests || 0}/${task.total_tests}`
          )
        }

        // Update outputs
        core.setOutput('status', task.status)
        core.setOutput(
          'completed_tests',
          (task.completed_tests || 0).toString()
        )
        core.setOutput('total_tests', (task.total_tests || 0).toString())
      }
    })

    eventSource.addEventListener('workflow_completed', event => {
      const data = safeParseEventData(event, 'workflow_completed')
      if (!data) return

      if (data.task_id === taskId) {
        core.startGroup(
          `✅ Workflow Completed Successfully: ${data.workflow_name || workflowId}`
        )

        // Set final success outputs
        core.setOutput('success', 'true')
        core.setOutput('status', 'completed')

        // Fetch final results from the API
        fetchFinalWorkflowResults(taskId, backendBaseUrl, client)
          .then(results => {
            if (results) {
              core.setOutput(
                'total_tests',
                (results.total_tests || 0).toString()
              )
              core.setOutput(
                'completed_tests',
                (results.completed_tests || 0).toString()
              )
              core.setOutput(
                'passed_tests',
                (results.passed_tests || 0).toString()
              )
              core.setOutput(
                'failed_tests',
                (results.failed_tests || 0).toString()
              )
            }
          })
          .catch(err =>
            core.warning(`Could not fetch final results: ${err.message}`)
          )

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
      const data = safeParseEventData(event, 'workflow_failed')
      if (!data) return

      if (data.task_id === taskId) {
        core.startGroup(
          `❌ Workflow Failed: ${data.workflow_name || workflowId}`
        )

        // Set failure outputs
        core.setOutput('success', 'false')
        core.setOutput('status', 'failed')

        // Fetch final results from the API
        fetchFinalWorkflowResults(taskId, backendBaseUrl, client)
          .then(results => {
            if (results) {
              core.setOutput(
                'total_tests',
                (results.total_tests || 0).toString()
              )
              core.setOutput(
                'completed_tests',
                (results.completed_tests || 0).toString()
              )
              core.setOutput(
                'passed_tests',
                (results.passed_tests || 0).toString()
              )
              core.setOutput(
                'failed_tests',
                (results.failed_tests || 0).toString()
              )

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
          .catch(err =>
            core.warning(`Could not fetch final results: ${err.message}`)
          )

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

    eventSource.addEventListener('workflow_cancelled', event => {
      const data = safeParseEventData(event, 'workflow_cancelled')
      if (!data) return

      if (data.task_id === taskId) {
        core.warning(
          `⚠️ Workflow cancelled: ${data.workflow_name || workflowId}`
        )
        core.setOutput('success', 'false')
        core.setOutput('status', 'cancelled')
        finalStatus = 'cancelled'
        eventSource.close()
        clearTimeout(timeoutHandle)
        resolve(finalStatus)
      }
    })

    eventSource.addEventListener('heartbeat', event => {
      // Keep-alive signal from unified stream, no action needed
      // Optional: could log timestamp for debugging
    })

    eventSource.addEventListener('error', event => {
      const data = safeParseEventData(event, 'error')
      if (data) {
        const errorMessage = data.error || data.message || 'Unknown SSE error'
        core.error(`SSE error event: ${errorMessage}`)
        eventSource.close()
        clearTimeout(timeoutHandle)
        reject(new Error(`SSE error: ${errorMessage}`))
      } else {
        // Handle non-JSON error events - this is usually a connection-level issue
        core.error('SSE error event received (non-JSON) - likely a connection or authentication issue')
        core.error('Event details:', JSON.stringify({ type: event.type, data: event.data }))
        core.info('Troubleshooting: Verify REVYL_API_KEY is valid and backend service is healthy')
        eventSource.close()
        clearTimeout(timeoutHandle)
        reject(new Error('SSE connection error - check authentication and network connectivity'))
      }
    })
  })
}

/**
 * Fetch final workflow results from API
 * @param {string} taskId - The task ID
 * @param {string} backendBaseUrl - Backend base URL
 * @param {object} client - HTTP client
 * @returns {Promise<object|null>} Final results or null
 */
async function fetchFinalWorkflowResults(taskId, backendBaseUrl, client) {
  try {
    const url = `${backendBaseUrl}/api/v1/workflows/tasks/workflow_task?task_id=${taskId}`
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

module.exports = { monitorWorkflow }
