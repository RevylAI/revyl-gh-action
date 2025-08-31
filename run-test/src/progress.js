const core = require('@actions/core')

/**
 * Log progress information with clean, single-line updates
 * @param {object} taskInfo - Current task info payload
 * @param {string|null} testId - Test ID if monitoring a test
 * @param {string|null} workflowId - Workflow ID if monitoring a workflow
 */
function logProgress(taskInfo, testId, workflowId) {
  const currentStatus = taskInfo.status

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

  const statusEmoji = statusEmojis[currentStatus] || statusEmojis[taskInfo.phase] || '📊'

  if (testId) {
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
    let message = `${statusEmoji} Workflow: ${currentStatus.toUpperCase()}`

    if (taskInfo.current_test) {
      const testName = taskInfo.current_test_name || taskInfo.current_test
      message += ` | Current: "${testName}"`
    }

    if (taskInfo.completed_tests !== undefined && taskInfo.total_tests) {
      const percentage = Math.round((taskInfo.completed_tests / taskInfo.total_tests) * 100)
      message += ` | Tests: ${taskInfo.completed_tests}/${taskInfo.total_tests} (${percentage}%)`
    }

    core.info(message)
  }
}

module.exports = { logProgress }


