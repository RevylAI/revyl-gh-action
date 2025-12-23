const core = require('@actions/core')
const EventSource = require('eventsource')
const { monitorTest } = require('./monitorTest')
const { monitorWorkflow } = require('./monitorWorkflow')

// Dashboard URL for reports
const DASHBOARD_BASE_URL = 'https://app.revyl.ai'

/**
 * Monitor task execution via SSE (dispatcher)
 * @param {string} taskId - The task ID to monitor
 * @param {string|null} testId - Test ID if monitoring a test
 * @param {string|null} workflowId - Workflow ID if monitoring a workflow
 * @param {string} backendBaseUrl - Backend base URL for SSE and report API
 * @param {object} client - HTTP client for additional requests
 * @param {number} timeoutSeconds - Maximum time to wait
 * @returns {Promise<string|null>} Final status or null if timeout
 */
async function monitorTaskViaSSE(
  taskId,
  testId,
  workflowId,
  backendBaseUrl,
  client,
  timeoutSeconds
) {
  if (testId)
    return monitorTest(taskId, testId, backendBaseUrl, client, timeoutSeconds)
  if (workflowId)
    return monitorWorkflow(
      taskId,
      workflowId,
      backendBaseUrl,
      client,
      timeoutSeconds
    )
  return null
}

/**
 * Wait for test/workflow to start via SSE, then return immediately
 * Used for no-wait mode to confirm execution has started before exiting
 * @param {string} taskId - The task ID to wait for
 * @param {string|null} testId - Test ID if waiting for a test
 * @param {string|null} workflowId - Workflow ID if waiting for a workflow
 * @param {string} backendBaseUrl - Backend base URL for SSE
 * @param {number} timeoutSeconds - Maximum time to wait for start (default 120s)
 * @returns {Promise<object>} Object with started status and any child test info
 */
async function waitForStart(
  taskId,
  testId,
  workflowId,
  backendBaseUrl,
  timeoutSeconds = 120
) {
  return new Promise((resolve, reject) => {
    const sseUrl = `${backendBaseUrl}/api/v1/monitor/stream/unified`
    const eventSource = new EventSource(sseUrl, {
      headers: { Authorization: `Bearer ${process.env['REVYL_API_KEY']}` }
    })

    const startTime = Date.now()
    const childTests = [] // For workflows, track child test info

    const timeoutHandle = setTimeout(() => {
      eventSource.close()
      // Timeout - execution was queued but never started
      core.warning(
        `Timeout waiting for execution to start (${timeoutSeconds}s)`
      )
      resolve({ started: false, timedOut: true, childTests })
    }, timeoutSeconds * 1000)

    eventSource.onopen = () => {
      core.info(
        '🔗 SSE connection established - waiting for execution to start...'
      )
    }

    eventSource.onerror = error => {
      let errorMsg = 'SSE connection error while waiting for start'
      if (error && error.message) errorMsg += `: ${error.message}`

      eventSource.close()
      clearTimeout(timeoutHandle)
      // Don't fail on SSE error - task was still queued
      core.warning(errorMsg)
      resolve({ started: true, sseError: true, childTests })
    }

    // Check initial state for already-running executions
    eventSource.addEventListener('initial_state', event => {
      try {
        const data = JSON.parse(event.data)

        if (testId) {
          const runningTests = data.running_tests || []
          const ourTest = runningTests.find(t => t.task_id === taskId)
          if (ourTest) {
            core.info(`✅ Test already running: ${ourTest.test_name || testId}`)
            eventSource.close()
            clearTimeout(timeoutHandle)
            resolve({ started: true, testName: ourTest.test_name, childTests })
            return
          }
        }

        if (workflowId) {
          const runningWorkflows = data.running_workflows || []
          const ourWorkflow = runningWorkflows.find(
            wf => wf.task && wf.task.task_id === taskId
          )
          if (ourWorkflow) {
            core.info(
              `✅ Workflow already running: ${ourWorkflow.workflow_name || workflowId}`
            )
            // Collect any child tests
            const runningTests = data.running_tests || []
            runningTests.forEach(t => {
              if (t.parent_workflow_task_id === taskId) {
                childTests.push({
                  taskId: t.task_id,
                  testName: t.test_name,
                  reportUrl: `${DASHBOARD_BASE_URL}/tests/report?taskId=${t.task_id}`
                })
              }
            })
            eventSource.close()
            clearTimeout(timeoutHandle)
            resolve({
              started: true,
              workflowName: ourWorkflow.workflow_name,
              childTests
            })
            return
          }
        }
      } catch (e) {
        core.debug(`Failed to parse initial_state: ${e.message}`)
      }
    })

    // Track workflow info when it starts
    let workflowInfo = null

    // Listen for test start events
    eventSource.addEventListener('test_started', event => {
      try {
        const data = JSON.parse(event.data)
        const test = data.test

        // Direct test execution
        if (testId && test && test.task_id === taskId) {
          eventSource.close()
          clearTimeout(timeoutHandle)
          resolve({ started: true, testName: test.test_name, childTests })
          return
        }

        // Child test of workflow - collect all tests before exiting
        if (workflowId && test && test.parent_workflow_task_id === taskId) {
          const reportUrl = `${DASHBOARD_BASE_URL}/tests/report?taskId=${test.task_id}`
          childTests.push({
            taskId: test.task_id,
            testName: test.test_name,
            reportUrl
          })

          // Print in same format as regular monitoring
          core.info(`  🧪 ${test.test_name}`)
          core.info(`     📋 Report: ${reportUrl}`)

          // Exit once ALL tests have started (or if we don't know total, exit after first)
          const totalTests = workflowInfo?.totalTests || 1
          if (childTests.length >= totalTests) {
            eventSource.close()
            clearTimeout(timeoutHandle)
            resolve({
              started: true,
              workflowName: workflowInfo?.workflowName || workflowId,
              totalTests: workflowInfo?.totalTests,
              childTests
            })
          }
        }
      } catch (e) {
        core.debug(`Failed to parse test_started: ${e.message}`)
      }
    })

    // Listen for workflow start events
    eventSource.addEventListener('workflow_started', event => {
      try {
        const data = JSON.parse(event.data)
        if (
          data.workflow &&
          data.workflow.task &&
          data.workflow.task.task_id === taskId
        ) {
          const wf = data.workflow
          // Store workflow info but don't exit yet - wait for first test
          workflowInfo = {
            workflowName: wf.workflow_name,
            totalTests: wf.task.total_tests
          }
          core.info(
            `🚀 ${wf.workflow_name || workflowId} (${wf.task.total_tests || '?'} tests)`
          )
          core.info(``)
        }
      } catch (e) {
        core.debug(`Failed to parse workflow_started: ${e.message}`)
      }
    })

    // Also resolve if we see completion events (execution was fast)
    const completionEvents = [
      'test_completed',
      'test_completed_with_data',
      'test_failed',
      'test_failed_with_data',
      'workflow_completed',
      'workflow_failed'
    ]
    completionEvents.forEach(eventType => {
      eventSource.addEventListener(eventType, event => {
        try {
          const data = JSON.parse(event.data)
          if (data.task_id === taskId) {
            core.info(`⚡ Execution completed quickly`)
            eventSource.close()
            clearTimeout(timeoutHandle)
            resolve({ started: true, completed: true, childTests })
          }
        } catch (e) {
          // Ignore parse errors for completion events
        }
      })
    })
  })
}

module.exports = {
  monitorTaskViaSSE,
  monitorTest,
  monitorWorkflow,
  waitForStart
}
