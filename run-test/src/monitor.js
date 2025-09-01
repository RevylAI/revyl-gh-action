const { monitorTest } = require('./monitorTest')
const { monitorWorkflow } = require('./monitorWorkflow')

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
async function monitorTaskViaSSE(taskId, testId, workflowId, backendBaseUrl, client, timeoutSeconds) {
  if (testId) return monitorTest(taskId, testId, backendBaseUrl, client, timeoutSeconds)
  if (workflowId) return monitorWorkflow(taskId, workflowId, backendBaseUrl, client, timeoutSeconds)
  return null
}

module.exports = { monitorTaskViaSSE, monitorTest, monitorWorkflow }


