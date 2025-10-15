const core = require('@actions/core')
const EventSource = require('eventsource')
const { logProgress } = require('./progress')
const { generateShareableReportLink } = require('./report')
const { setOutputsFromCompletedTest } = require('./outputs')

/**
 * Monitor a single test task via SSE using the unified stream endpoint
 * @param {string} taskId - The task ID to monitor
 * @param {string} testId - The test ID
 * @param {string} backendBaseUrl - Backend base URL for SSE and report API
 * @param {object} client - HTTP client for additional requests
 * @param {number} timeoutSeconds - Maximum time to wait
 * @returns {Promise<string|null>} Final status or null if timeout
 */
async function monitorTest(
  taskId,
  testId,
  backendBaseUrl,
  client,
  timeoutSeconds
) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    let finalStatus = null
    let reportLink = null

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
        '🔗 SSE connection established - monitoring test execution in real-time'
      )
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

      // Find our test in the array (tests are OrgTestMonitorItem objects)
      const ourTestItem = runningTests.find(item => item.task_id === taskId)
      if (ourTestItem) {
        // Convert OrgTestMonitorItem to the format expected by logProgress
        // OrgTestMonitorItem has: task_id, test_id, test_name, status, phase, etc.
        const testData = {
          task_id: ourTestItem.task_id,
          test_id: ourTestItem.test_id,
          test_name: ourTestItem.test_name,
          status: ourTestItem.status,
          phase: ourTestItem.phase,
          current_step: ourTestItem.current_step,
          current_step_index: ourTestItem.current_step_index,
          total_steps: ourTestItem.total_steps,
          steps_completed: ourTestItem.steps_completed,
          progress: ourTestItem.progress
        }
        logProgress(testData, testId, null)
      } else {
        core.info(
          `📡 Connected to unified stream - waiting for test ${testId} (task: ${taskId}) to start...`
        )
      }
    })

    eventSource.addEventListener('test_started', event => {
      const data = JSON.parse(event.data)
      if (data.test && data.test.task_id === taskId) {
        core.startGroup(`🚀 Test Started: ${data.test.test_name || testId}`)
        logProgress(data.test, testId, null)
        core.endGroup()
      }
    })

    eventSource.addEventListener('test_updated', event => {
      const data = JSON.parse(event.data)
      if (data.test && data.test.task_id === taskId)
        logProgress(data.test, testId, null)
    })

    eventSource.addEventListener('test_completed_with_data', async event => {
      const data = JSON.parse(event.data)
      if (data.task_id === taskId) {
        core.startGroup(`✅ Test Completed Successfully: ${data.test_name}`)
        if (data.completed_test) {
          core.info('🔗 Generating shareable report link...')
          reportLink = await generateShareableReportLink(
            data.completed_test,
            backendBaseUrl
          )
          if (reportLink) {
            core.notice(`📊 Test Report: ${reportLink}`, {
              title: '✅ Test Completed Successfully',
              file: 'test-execution'
            })
            core.setOutput('report_link', reportLink)
            core.summary
              .addHeading('Test Execution Completed 🎉 ', 2)
              .addRaw(
                `
**Test Name:** \`${data.test_name}\`
**Status:** ✅ Success
**Report:** [View Detailed Report](${reportLink})

The test has completed successfully! Click the report link above to view detailed execution logs, screenshots, and performance metrics.
              `
              )
              .write()
          } else {
            core.warning('⚠️  Could not generate shareable report link')
          }
          setOutputsFromCompletedTest(data.completed_test, testId, null)
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
          reportLink = await generateShareableReportLink(
            data.failed_test,
            backendBaseUrl
          )
          if (reportLink) {
            core.error(`❌ Test Failed: ${data.test_name}`, {
              title: 'Test Execution Failed',
              file: 'test-execution'
            })
            core.notice(`📊 Failure Report: ${reportLink}`, {
              title: '🔍 Debug Information Available'
            })
            core.setOutput('report_link', reportLink)
            core.summary
              .addHeading('Test Execution Failed ❌', 2)
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
          setOutputsFromCompletedTest(data.failed_test, testId, null)
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

    eventSource.addEventListener('heartbeat', event => {
      // Keep-alive signal from unified stream
      // The unified endpoint doesn't include active_tests count in heartbeat
      // No action needed, connection is healthy
    })

    eventSource.addEventListener('error', event => {
      try {
        const data = JSON.parse(event.data)
        console.error('SSE error event:', data.error || data.message)
        eventSource.close()
        clearTimeout(timeoutHandle)
        reject(new Error(`SSE error: ${data.error || data.message}`))
      } catch (e) {
        // Handle non-JSON error events
        console.error('SSE error (non-JSON):', event)
        eventSource.close()
        clearTimeout(timeoutHandle)
        reject(new Error('SSE connection error'))
      }
    })
  })
}

module.exports = { monitorTest }
