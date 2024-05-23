const core = require('@actions/core')
const httpm = require('@actions/http-client')

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
async function run() {
  try {
    const testId = core.getInput('test-id', { required: true })

    // `who-to-greet` input defined in action metadata fil
    if (!process.env['COGNISIM_API_TOKEN']) {
      throw Error(
        'Missing COGNISIM_API_TOKEN get API token from cognisim settings'
      )
    }

    const client = new httpm.HttpClient('cognisim-run-action', [], {
      headers: {
        Authorization: `Bearer ${process.env['COGNISIM_API_TOKEN']}`,
        'Content-Type': 'application/json'
      }
    })
    console.log(testId)
    const url = 'https://device.cognisim.io/execute_test_id'
    const body = { test_id: testId }
    const res = await client.postJson(url, body)
    //console.log(res)
    if (res.statusCode !== 200) {
      throw Error(
        `Failed to run test: API returned status code ${res.statusCode}`
      )
    }
    if (res.result && res.result.success) {
      console.log(
        'Test run successfully and passed View Artifacts at cognisim.io/testhistory '
      )
      return res.result.success
    } else if (res.result && !res.result.success) {
      throw Error(
        `Test ran successfully but failed: View Artifacts at cognisim.io/testhistory with full reasoning`
      )
    } else {
      throw Error(`Failed to run test: No result returned from API`)
    }
  } catch (error) {
    // Fail the workflow run if an error occurs
    core.setFailed(error.message)
  }
}

module.exports = {
  run
}
