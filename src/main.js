const core = require('@actions/core')
const httpm = require('@actions/http-client')

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
async function run() {
  try {
    // Check for API key first
    if (!process.env['REVYL_API_KEY']) {
      throw Error('Missing REVYL_API_KEY get API token from revyl settings')
    }

    // Get inputs and validate
    const testId = core.getInput('test-id', { required: false })
    const workflowId = core.getInput('workflow-id', { required: false })
    const deviceUrl = core.getInput('revyl-device-url', { required: false })
    const retries = core.getInput('retries', { required: false }) || 1
    const llm_model_name =
      core.getInput('llm_model_name', { required: false }) || 'gpt-4'
    const multimodal = core.getInput('multimodal', { required: false }) || false

    // Validate that either testId or workflowId is provided
    if (!testId && !workflowId) {
      throw Error('Either test-id or workflow-id must be provided')
    }
    if (testId && workflowId) {
      throw Error('Cannot provide both test-id and workflow-id')
    }

    const client = new httpm.HttpClient('revyl-run-action', [], {
      headers: {
        Authorization: `Bearer ${process.env['REVYL_API_KEY']}`,
        'Content-Type': 'application/json'
      }
    })

    // Determine the endpoint based on whether we're running a test or workflow
    const defaultUrl = testId
      ? 'https://device.cognisim.io/execute_test_id'
      : 'https://device.cognisim.io/execute_workflow_id'
    const url = deviceUrl || defaultUrl

    console.log('ID:', testId || workflowId)
    console.log('URL:', url)

    // Construct the body based on whether we're running a test or workflow
    const body = testId
      ? { test_id: testId, retries, llm_model_name, multimodal }
      : { workflow_id: workflowId, retries, llm_model_name, multimodal }

    const res = await client.postJson(url, body)

    if (res.statusCode !== 200) {
      throw Error(
        `Failed to run ${testId ? 'test' : 'workflow'}: API returned status code ${res.statusCode}`
      )
    }
    if (res.result && res.result.success) {
      core.setOutput('success', 'true')
      return res.result.success
    } else if (res.result && !res.result.success) {
      core.setOutput('success', 'false')
      throw Error(
        `${testId ? 'Test' : 'Workflow'} ran successfully but failed: View Artifacts for full reasoning`
      )
    } else {
      throw Error(
        `Failed to run ${testId ? 'test' : 'workflow'}: No result returned from API`
      )
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

module.exports = {
  run
}
