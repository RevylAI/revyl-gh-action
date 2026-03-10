const fs = require('fs')
const path = require('path')

function readFile(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8')
}

describe('Action wiring', () => {
  it('keeps run-test CLI-first and removes use-cli input', () => {
    const runTestAction = readFile('../action.yml')

    expect(runTestAction).not.toMatch(/\n\s*use-cli:/)
    expect(runTestAction).toMatch(/\n\s*cli-version:/)
    expect(runTestAction).toMatch(/\n\s*workflow_id:/)
    expect(runTestAction).not.toMatch(/Run via Node\.js/)
    expect(runTestAction).toMatch(/id:\s+download-cli/)
    expect(runTestAction).toMatch(/download-cli\.sh/)
    expect(runTestAction).toMatch(/X64\|x64\|AMD64\|amd64/)
    expect(runTestAction).toMatch(/ARM64\|arm64/)
    expect(runTestAction).toMatch(/bash "\$\{\{ github\.action_path \}\}\/\.\.\/scripts\/download-cli\.sh"/)
    expect(runTestAction).toMatch(/- name: Run via CLI/)
    expect(runTestAction).toMatch(
      /workflow_id is deprecated\. Use workflow-id instead\./
    )
    expect(runTestAction).toMatch(/REVYL_CLI_PATH:/)
    expect(runTestAction).toMatch(
      /"\$\{REVYL_CLI_PATH\}" "\$\{RESOURCE\}" run "\$\{TARGET_ID\}"/
    )
    expect(runTestAction).toMatch(/--json --github-actions/)
    expect(runTestAction).not.toMatch(/curl -sL -o revyl/)
    expect(runTestAction).not.toMatch(/\.\/revyl version \|\| true/)
    expect(runTestAction).not.toMatch(/\n\s*start-timeout:/)
    expect(runTestAction).toMatch(/Unsupported runner\.os/)
    expect(runTestAction).toMatch(/Unsupported runner\.arch/)
    expect(runTestAction).toMatch(/DEFAULT_BACKEND_URL="https:\/\/backend\.revyl\.ai"/)
    expect(runTestAction).toMatch(
      /\[ "\$\{BACKEND_URL\}" != "\$\{DEFAULT_BACKEND_URL\}" \]/
    )
  })

  it('keeps run-workflow CLI-first and free of nested action path dependency', () => {
    const runWorkflowAction = readFile('../../run-workflow/action.yml')

    expect(runWorkflowAction).not.toMatch(/\n\s*use-cli:/)
    expect(runWorkflowAction).toMatch(/\n\s*cli-version:/)
    expect(runWorkflowAction).toMatch(/\n\s*status:\n\s*description:\s*'Final workflow status when available\.'/)
    expect(runWorkflowAction).toMatch(/id:\s+download-cli/)
    expect(runWorkflowAction).toMatch(/download-cli\.sh/)
    expect(runWorkflowAction).toMatch(/X64\|x64\|AMD64\|amd64/)
    expect(runWorkflowAction).toMatch(/ARM64\|arm64/)
    expect(runWorkflowAction).toMatch(/bash "\$\{\{ github\.action_path \}\}\/\.\.\/scripts\/download-cli\.sh"/)
    expect(runWorkflowAction).toMatch(/- name: Execute workflow via CLI/)
    expect(runWorkflowAction).not.toMatch(/uses:\s+\.\.\/run-test/)
    expect(runWorkflowAction).not.toMatch(
      /uses:\s+RevylAI\/revyl-gh-action\/run-test@/
    )
    expect(runWorkflowAction).toMatch(/REVYL_CLI_PATH:/)
    expect(runWorkflowAction).toMatch(/\n\s*workflow_id:/)
    expect(runWorkflowAction).toMatch(/echo "status=\$\{STATUS\}" >> \$GITHUB_OUTPUT/)
    expect(runWorkflowAction).toMatch(
      /"\$\{REVYL_CLI_PATH\}" workflow run "\$\{WORKFLOW_ID\}"/
    )
    expect(runWorkflowAction).toMatch(/--json --github-actions --open=false/)
    expect(runWorkflowAction).toMatch(
      /Using deprecated input 'workflow_id'\. Please use 'workflow-id' instead\./
    )
    expect(runWorkflowAction).toMatch(
      /Missing workflow input\. Provide 'workflow-id' \(preferred\) or 'workflow_id' \(legacy alias\)\./
    )
    expect(runWorkflowAction).toMatch(
      /DEFAULT_BACKEND_URL="https:\/\/backend\.revyl\.ai"/
    )
    expect(runWorkflowAction).toMatch(
      /\[ "\$\{BACKEND_URL\}" != "\$\{DEFAULT_BACKEND_URL\}" \]/
    )
    expect(runWorkflowAction).not.toMatch(/execute_workflow_id_async/)
    expect(runWorkflowAction).not.toMatch(/\/api\/v1\/workflows\/status\/status\//)
    expect(runWorkflowAction).not.toMatch(/curl -sS -X POST/)
    expect(runWorkflowAction).not.toMatch(/curl -sS -X GET/)
    expect(runWorkflowAction).not.toMatch(/curl -sL -o revyl/)
    expect(runWorkflowAction).not.toMatch(/\.\/revyl version \|\| true/)
    expect(runWorkflowAction).not.toMatch(/\n\s*start-timeout:/)
    expect(runWorkflowAction).toMatch(/Unsupported runner\.os/)
    expect(runWorkflowAction).toMatch(/Unsupported runner\.arch/)
  })
})
