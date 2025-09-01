const core = require('@actions/core')
const EventSource = require('eventsource')
const { logProgress } = require('./progress')

/**
 * Monitor a workflow task via SSE
 * @param {string} taskId - The task ID to monitor
 * @param {string} workflowId - The workflow ID
 * @param {string} backendBaseUrl - Backend base URL for SSE
 * @param {object} client - HTTP client for additional requests
 * @param {number} timeoutSeconds - Maximum time to wait
 * @returns {Promise<string|null>} Final status or null if timeout
 */
async function monitorWorkflow(taskId, workflowId, backendBaseUrl, client, timeoutSeconds) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    let finalStatus = null

    const sseUrl = `${backendBaseUrl}/api/v1/tests/monitor/stream?include_queued=true`
    const eventSource = new EventSource(sseUrl, {
      headers: { Authorization: `Bearer ${process.env['REVYL_API_KEY']}` }
    })

    const timeoutHandle = setTimeout(() => {
      eventSource.close()
      if (finalStatus === null) resolve(null)
    }, timeoutSeconds * 1000)

    eventSource.onopen = () => {
      core.info('🔗 SSE connection established - monitoring workflow execution in real-time')
    }

    eventSource.onerror = error => {
      console.error('SSE connection error:', error)
      eventSource.close()
      clearTimeout(timeoutHandle)
      reject(new Error(`SSE connection failed: ${error.message || error}`))
    }

    eventSource.addEventListener('connection_ready', event => {
      const data = JSON.parse(event.data)
      core.info(`🏢 Connected to organization: ${data.org_id}`)
    })

    eventSource.addEventListener('initial_state', event => {
      const data = JSON.parse(event.data)
      const runningTests = data.running_tests || []
      const ourTask = runningTests.find(test => test.task_id === taskId)
      if (ourTask) logProgress(ourTask, null, workflowId)
    })

    eventSource.addEventListener('workflow_completed', event => {
      const data = JSON.parse(event.data)
      if (data.task_id === taskId) {
        core.startGroup(`✅ Workflow Completed Successfully: ${workflowId}`)
        if (data.workflow_results) {
          const results = data.workflow_results
          if (results.total_tests !== undefined) core.setOutput('total_tests', results.total_tests.toString())
          if (results.completed_tests !== undefined) core.setOutput('completed_tests', results.completed_tests.toString())
          if (results.passed_tests !== undefined) core.setOutput('passed_tests', results.passed_tests.toString())
          if (results.failed_tests !== undefined) core.setOutput('failed_tests', results.failed_tests.toString())
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
        if (data.workflow_results) {
          const results = data.workflow_results
          if (results.total_tests !== undefined) core.setOutput('total_tests', results.total_tests.toString())
          if (results.completed_tests !== undefined) core.setOutput('completed_tests', results.completed_tests.toString())
          if (results.passed_tests !== undefined) core.setOutput('passed_tests', results.passed_tests.toString())
          if (results.failed_tests !== undefined) core.setOutput('failed_tests', results.failed_tests.toString())
        }
        core.error(`❌ Workflow failed`, { title: 'Workflow Execution Failed', file: 'workflow-execution' })
        core.info(`🆔 Task ID: ${taskId}`)
        core.endGroup()
        finalStatus = 'failed'
        eventSource.close()
        clearTimeout(timeoutHandle)
        resolve(finalStatus)
      }
    })

    eventSource.addEventListener('heartbeat', event => {
      const data = JSON.parse(event.data)
      if (data.active_tests === 0 && Date.now() - startTime > 30000) {
        console.log('No active tests detected in heartbeat')
      }
    })

    eventSource.addEventListener('error', event => {
      const data = JSON.parse(event.data)
      console.error('SSE error event:', data.error || data.message)
      eventSource.close()
      clearTimeout(timeoutHandle)
      reject(new Error(`SSE error: ${data.error || data.message}`))
    })
  })
}

module.exports = { monitorWorkflow }


