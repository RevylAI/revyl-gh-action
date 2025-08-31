const core = require('@actions/core')
const EventSource = require('eventsource')
const { logProgress } = require('./progress')
const { generateShareableReportLink } = require('./report')
const { setOutputsFromCompletedTest } = require('./outputs')

/**
 * Monitor task execution via Server-Sent Events (SSE)
 * @param {string} taskId - The task ID to monitor
 * @param {string|null} testId - Test ID if monitoring a test
 * @param {string|null} workflowId - Workflow ID if monitoring a workflow
 * @param {string} backendBaseUrl - Backend base URL for SSE and report API
 * @param {object} client - HTTP client for additional requests
 * @param {number} timeoutSeconds - Maximum time to wait
 * @returns {Promise<string|null>} Final status or null if timeout
 */
async function monitorTaskViaSSE(taskId, testId, workflowId, backendBaseUrl, client, timeoutSeconds) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    let finalStatus = null
    let reportLink = null

    const sseUrl = `${backendBaseUrl}/api/v1/tests/monitor/stream?include_queued=true`
    const eventSource = new EventSource(sseUrl, {
      headers: { Authorization: `Bearer ${process.env['REVYL_API_KEY']}` }
    })

    const timeoutHandle = setTimeout(() => {
      eventSource.close()
      if (finalStatus === null) {
        resolve(null)
      }
    }, timeoutSeconds * 1000)

    eventSource.onopen = () => {
      core.info('🔗 SSE connection established - monitoring test execution in real-time')
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
      if (ourTask) {
        logProgress(ourTask, testId, workflowId)
      }
    })

    eventSource.addEventListener('test_started', event => {
      const data = JSON.parse(event.data)
      if (data.test && data.test.task_id === taskId) {
        core.startGroup(`🚀 Test Started: ${data.test.test_name || testId}`)
        logProgress(data.test, testId, workflowId)
        core.endGroup()
      }
    })

    eventSource.addEventListener('test_updated', event => {
      const data = JSON.parse(event.data)
      if (data.test && data.test.task_id === taskId) {
        logProgress(data.test, testId, workflowId)
      }
    })

    eventSource.addEventListener('test_completed_with_data', async event => {
      const data = JSON.parse(event.data)
      if (data.task_id === taskId) {
        core.startGroup(`✅ Test Completed Successfully: ${data.test_name}`)

        if (data.completed_test) {
          core.info('🔗 Generating shareable report link...')
          reportLink = await generateShareableReportLink(data.completed_test, backendBaseUrl)
          if (reportLink) {
            core.notice(`📊 Test Report: ${reportLink}`, { title: '✅ Test Completed Successfully', file: 'test-execution' })
            core.setOutput('report_link', reportLink)
            core.summary
              .addHeading('Test Execution Completed 🎉 ', 2)
              .addRaw(`
**Test Name:** \`${data.test_name}\`
**Status:** ✅ Success
**Report:** [View Detailed Report](${reportLink})

The test has completed successfully! Click the report link above to view detailed execution logs, screenshots, and performance metrics.
              `)
              .write()
          } else {
            core.warning('⚠️  Could not generate shareable report link')
          }

          setOutputsFromCompletedTest(data.completed_test, testId, workflowId)
        }

        core.endGroup()
        finalStatus = 'completed'
        eventSource.close()
        clearTimeout(timeoutHandle)
        resolve(finalStatus)
      }
    })

    eventSource.addEventListener('test_failed_with_data', async event => {
      const data = JSON.parse(event.data)
      if (data.task_id === taskId) {
        core.startGroup(`❌ Test Failed: ${data.test_name}`)

        if (data.failed_test) {
          core.info('🔗 Generating shareable report link for failed test...')
          reportLink = await generateShareableReportLink(data.failed_test, backendBaseUrl)
          if (reportLink) {
            core.error(`❌ Test Failed: ${data.test_name}`, { title: 'Test Execution Failed', file: 'test-execution' })
            core.notice(`📊 Failure Report: ${reportLink}`, { title: '🔍 Debug Information Available' })
            core.setOutput('report_link', reportLink)
            core.summary
              .addHeading('Test Execution Failed ❌', 2)
              .addRaw(`
**Test ID:** \`${data.test_name}\`
**Status:** ❌ Failed
**Report:** [View Failure Analysis](${reportLink})

The test execution failed. The detailed report contains:
- 📸 Screenshots at failure point
- 📋 Execution logs and error details  
- 🔍 Step-by-step execution trace
- 💡 Suggested debugging steps

Click the report link above to investigate the failure.
              `)
              .write()
          } else {
            core.warning('⚠️  Could not generate shareable report link')
          }

          setOutputsFromCompletedTest(data.failed_test, testId, workflowId)
        }

        core.endGroup()
        finalStatus = 'failed'
        eventSource.close()
        clearTimeout(timeoutHandle)
        resolve(finalStatus)
      }
    })

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

    if (workflowId) {
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
    }

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

module.exports = { monitorTaskViaSSE }


