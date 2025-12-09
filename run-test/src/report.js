const fetch = require('node-fetch')

/**
 * Generate a shareable report link from completed test data
 * @param {object} completedTestData - Completed test payload
 * @param {string} backendBaseUrl - Backend base URL to use
 * @returns {Promise<string|null>} Shareable link or null
 */
async function generateShareableReportLink(completedTestData, backendBaseUrl) {
  try {
    let testId = null
    let historyId = null

    const enhancedTask = completedTestData.enhanced_task
    if (enhancedTask && enhancedTask.test_history_id) {
      testId = completedTestData.test_uid || enhancedTask.test_id
      historyId = enhancedTask.test_history_id
    } else {
      let metadata = completedTestData.metadata
      if (typeof metadata === 'string') {
        metadata = JSON.parse(metadata)
      }

      if (metadata && metadata.test_history_id) {
        testId = completedTestData.test_uid || completedTestData.id
        historyId = metadata.test_history_id
      } else if (completedTestData.id && completedTestData.test_uid) {
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

    const backendUrl = backendBaseUrl || 'https://backend.revyl.ai'
    const apiUrl = `${backendUrl}/api/v1/report/async-run/generate_shareable_report_link`

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env['REVYL_API_KEY']}`
      },
      body: JSON.stringify({
        test_id: testId,
        history_id: historyId,
        origin: 'https://app.revyl.ai'
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

module.exports = { generateShareableReportLink }
