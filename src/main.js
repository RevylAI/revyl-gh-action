const core = require('@actions/core')
const httpm = require('@actions/http-client')

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
async function run() {
  try {
    const testId = core.getInput('test-id', { required: true })
    const deviceUrl = core.getInput('revyl-device-url', { required: false }) // Retrieve input
    const retries = core.getInput('retries', { required: false }) || 1 // Retrieve input
    const llm_model_name = core.getInput('llm_model_name', { required: false }) || 'gpt-4o' // Retrieve input
    const multimodal = core.getInput('multimodal', {required: false}) || false // Retrieve input
    if (!process.env['REVYL_API_KEY']) {
      throw Error('Missing REVYL_API_KEY get API token from revyl settings')
    }

    const client = new httpm.HttpClient('revyl-run-action', [], {
      headers: {
        Authorization: `Bearer ${process.env['REVYL_API_KEY']}`,
        'Content-Type': 'application/json'
      }
    })

    const url = deviceUrl || 'https://device.cognisim.io/execute_test_id' // Use the input if provided
    console.log('Test ID:', testId)
    console.log('URL:', url)
    const body = { test_id: testId, retries: retries, llm_model_name: llm_model_name, multimodal: multimodal }
    const res = await client.postJson(url, body)

    if (res.statusCode !== 200) {
      throw Error(
        `Failed to run test: API returned status code ${res.statusCode}`
      )
    }
    if (res.result && res.result.success) {
      core.setOutput('success', 'true')
        // core.setOutput('result', JSON.stringify(res.result))
        // core.setOutput('report_link', res.result.html_report_link)
      return res.result.success
    } else if (res.result && !res.result.success) {

      core.setOutput('success', 'false')
      throw Error(
        `Test ran successfully but failed: View Artifacts at test with full reasoning`
      )
    } else {
      throw Error('Failed to run test: No result returned from API')
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

module.exports = {
  run
}
