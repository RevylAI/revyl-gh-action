const core = require('@actions/core')
const { formatDuration } = require('./time')

/**
 * Set GitHub Actions outputs from completed test data
 * @param {object} completedTestData - Completed test payload
 * @param {string|null} testId - Test ID if a test
 * @param {string|null} workflowId - Workflow ID if a workflow
 */
function setOutputsFromCompletedTest(completedTestData, testId, workflowId) {
  try {
    const enhancedTask = completedTestData.enhanced_task || {}

    if (completedTestData.duration) {
      const duration = formatDuration(completedTestData.duration)
      core.setOutput('execution_time', duration)
    }

    if (enhancedTask.platform) {
      core.setOutput('platform', enhancedTask.platform)
    }

    if (testId) {
      if (enhancedTask.total_steps) {
        core.setOutput('total_steps', enhancedTask.total_steps.toString())
      }
      if (enhancedTask.current_step_index !== undefined) {
        core.setOutput('completed_steps', (enhancedTask.current_step_index + 1).toString())
      }
    }

    if (completedTestData.status === 'failed' && enhancedTask.error_message) {
      core.setOutput('error_message', enhancedTask.error_message)
    }

    core.setOutput('success', (completedTestData.status === 'completed').toString())
  } catch (error) {
    console.warn('Failed to set outputs from completed test data:', error.message)
  }
}

module.exports = { setOutputsFromCompletedTest }


