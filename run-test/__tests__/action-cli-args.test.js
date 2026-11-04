const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const INDENT_OF_PATTERN = /\S/
const READ_INPUT_DEFAULTS_PATTERN = /^\S/
const NAME_MATCH_READ_INPUT_DEFAULTS_PATTERN = /^ {2}([\w-]+):$/
const DEFAULT_MATCH_READ_INPUT_DEFAULTS_DEFAULT_PATTERN =
  /^ {4}default: '(.*)'$/
const ENTRY_READ_STEP_PATTERN = /^([A-Z_]+): (.+)$/
const RENDERED_RENDER_INPUT_EXPRESSIONS_INPUTS_PATTERN =
  /\$\{\{\s*inputs\.([\w-]+)\s*\}\}/g
const UNRENDERED_RENDER_INPUT_EXPRESSIONS_PATTERN = /\$\{\{[^}]*\}\}/


const ACTIONS_ROOT = path.resolve(__dirname, '../..')
const STEP_TIMEOUT_MS = 10000

const FAKE_CLI = `#!/usr/bin/env bash
if [ "$1" = "version" ]; then
  printf '%s\\n' "\${FAKE_CLI_VERSION_OUTPUT:-revyl version 0.1.148}"
  exit 0
fi
printf '%s\\0' "$@" > "\${FAKE_CLI_ARGS_FILE}"
if [ -n "\${FAKE_CLI_OUTPUT_FILE:-}" ]; then
  cat "\${FAKE_CLI_OUTPUT_FILE}"
  exit "\${FAKE_CLI_EXIT_CODE:-0}"
fi
echo '{"success": true, "task_id": "task-123", "status": "completed"}'
`

function indentOf(line) {
  return line.search(INDENT_OF_PATTERN)
}

function readInputDefaults(lines) {
  const defaults = {}
  let inputName = null
  for (const line of lines.slice(lines.indexOf('inputs:') + 1)) {
    if (READ_INPUT_DEFAULTS_PATTERN.test(line)) break
    const nameMatch = line.match(NAME_MATCH_READ_INPUT_DEFAULTS_PATTERN)
    if (nameMatch) inputName = nameMatch[1]
    const defaultMatch = line.match(DEFAULT_MATCH_READ_INPUT_DEFAULTS_DEFAULT_PATTERN)
    if (defaultMatch && inputName) defaults[inputName] = defaultMatch[1]
  }
  return defaults
}

function readStep(actionFile, stepName) {
  const lines = fs
    .readFileSync(path.join(ACTIONS_ROOT, actionFile), 'utf8')
    .split('\n')
  const stepIndex = lines.findIndex(
    line => line.trim() === `- name: ${stepName}`
  )
  const runIndex = lines.findIndex(
    (line, index) => index > stepIndex && line.trim() === 'run: |'
  )
  if (stepIndex === -1 || runIndex === -1) {
    throw new Error(`Step not found in ${actionFile}: ${stepName}`)
  }

  const env = {}
  const envIndex = lines.findIndex(
    (line, index) =>
      index > stepIndex && index < runIndex && line.trim() === 'env:'
  )
  if (envIndex !== -1) {
    for (const line of lines.slice(envIndex + 1, runIndex)) {
      const entry = line.trim().match(ENTRY_READ_STEP_PATTERN)
      if (entry) env[entry[1]] = entry[2]
    }
  }

  const runKeyIndent = indentOf(lines[runIndex])
  const block = []
  for (const line of lines.slice(runIndex + 1)) {
    if (line.trim() !== '' && indentOf(line) <= runKeyIndent) break
    block.push(line)
  }
  const blockIndent = Math.min(
    ...block.filter(line => line.trim() !== '').map(indentOf)
  )
  return {
    defaults: readInputDefaults(lines),
    env,
    script: block.map(line => line.slice(blockIndent)).join('\n')
  }
}

function renderInputExpressions(text, inputs) {
  const rendered = text.replace(
    RENDERED_RENDER_INPUT_EXPRESSIONS_INPUTS_PATTERN,
    (_, name) => inputs[name] ?? ''
  )
  const unrendered = rendered.match(UNRENDERED_RENDER_INPUT_EXPRESSIONS_PATTERN)
  if (unrendered) {
    throw new Error(`No test value for expression ${unrendered[0]}`)
  }
  return rendered
}

/**
 * Runs a composite step the way the runner does: inputs are substituted into
 * the script and the step env, and bash runs with `-eo pipefail`. The Revyl CLI
 * is replaced by a fake that records its argv.
 *
 * @param {string} actionFile Action metadata path relative to revyl-gh-action/.
 * @param {string} stepName Exact step name.
 * @param {Record<string, string>} inputs Action inputs; omitted inputs use their defaults.
 * @param {{versionOutput?: string, cliOutput?: string, cliExitCode?: number}} cli What the fake CLI prints for `version`, and for the run with its exit code.
 * @returns {{status: number | null, stdout: string, stderr: string, cliArgs: string[], outputs: string, summary: string, workDir: string}}
 */
function runStep(actionFile, stepName, inputs, cli = {}) {
  const step = readStep(actionFile, stepName)
  const resolvedInputs = { ...step.defaults, ...inputs }
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'revyl-action-step-'))
  const cliPath = path.join(workDir, 'revyl')
  const argsFile = path.join(workDir, 'cli-args')
  const outputFile = path.join(workDir, 'github-output')
  const summaryFile = path.join(workDir, 'step-summary')
  const cliOutputFile = path.join(workDir, 'cli-output')
  const scriptPath = path.join(workDir, 'step.sh')
  fs.writeFileSync(cliPath, FAKE_CLI, { mode: 0o755 })
  fs.writeFileSync(outputFile, '')
  if (cli.cliOutput !== undefined) {
    fs.writeFileSync(cliOutputFile, cli.cliOutput)
  }
  fs.writeFileSync(
    scriptPath,
    renderInputExpressions(step.script, resolvedInputs)
  )

  const runnerProvidedEnv = {
    REVYL_API_KEY: 'test-api-key',
    REVYL_CLI_PATH: cliPath
  }
  const stepEnv = {}
  for (const [name, expression] of Object.entries(step.env)) {
    stepEnv[name] =
      name in runnerProvidedEnv
        ? runnerProvidedEnv[name]
        : renderInputExpressions(expression, resolvedInputs)
  }

  const result = spawnSync(
    'bash',
    ['--noprofile', '--norc', '-eo', 'pipefail', scriptPath],
    {
      cwd: workDir,
      encoding: 'utf8',
      timeout: STEP_TIMEOUT_MS,
      env: {
        PATH: process.env.PATH,
        ...stepEnv,
        FAKE_CLI_ARGS_FILE: argsFile,
        ...(cli.versionOutput !== undefined && {
          FAKE_CLI_VERSION_OUTPUT: cli.versionOutput
        }),
        ...(cli.cliOutput !== undefined && {
          FAKE_CLI_OUTPUT_FILE: cliOutputFile,
          FAKE_CLI_EXIT_CODE: String(cli.cliExitCode ?? 0)
        }),
        GITHUB_OUTPUT: outputFile,
        GITHUB_STEP_SUMMARY: summaryFile
      }
    }
  )

  const cliArgs = fs.existsSync(argsFile)
    ? fs.readFileSync(argsFile, 'utf8').split('\0').slice(0, -1)
    : []
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    cliArgs,
    outputs: fs.readFileSync(outputFile, 'utf8'),
    summary: fs.existsSync(summaryFile)
      ? fs.readFileSync(summaryFile, 'utf8')
      : '',
    workDir
  }
}

const JSON_FLAGS = ['--json', '--github-actions', '--open=false']
const FIRST_ALL_BRANCHES_CLI = { versionOutput: 'revyl version 0.1.149' }

describe('CLI arguments built by the composite actions', () => {
  const workDirs = []

  function run(actionFile, stepName, inputs, cli) {
    const result = runStep(actionFile, stepName, inputs, cli)
    workDirs.push(result.workDir)
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    return result
  }

  function runFailing(actionFile, stepName, inputs, cli) {
    const result = runStep(actionFile, stepName, inputs, cli)
    workDirs.push(result.workDir)
    expect(result.stderr).toBe('')
    expect(result.status).toBe(1)
    return result
  }

  function expectRefusedBeforeRun(result, message) {
    expect(result.cliArgs).toEqual([])
    expect(result.stdout).toContain(`::error::${message}`)
    expect(result.outputs).toContain(`error_message=${message}\n`)
    expect(result.outputs).toContain('success=false')
  }

  afterEach(() => {
    for (const workDir of workDirs.splice(0)) {
      fs.rmSync(workDir, { recursive: true, force: true })
    }
  })

  describe('run-test', () => {
    const runTest = (inputs, cli) =>
      run('run-test/action.yml', 'Run via CLI', inputs, cli)

    it('passes no branch when branch is omitted', () => {
      const result = runTest({ 'test-id': 'test-123' })

      expect(result.cliArgs).toEqual(['test', 'run', 'test-123', ...JSON_FLAGS])
      expect(result.outputs).toContain('success=true')
      expect(result.outputs).toContain('task_id=task-123')
    })

    it('passes branch as one argument even with spaces and slashes', () => {
      const result = runTest({
        'test-id': 'test-123',
        branch: 'feature/login flow'
      })

      expect(result.cliArgs).toEqual([
        'test',
        'run',
        'test-123',
        ...JSON_FLAGS,
        '--branch=feature/login flow'
      ])
    })

    it('passes both build-id and branch so the CLI can check they match', () => {
      const result = runTest({
        'test-id': 'test-123',
        'build-id': 'build-456',
        branch: 'staging'
      })

      expect(result.cliArgs).toEqual([
        'test',
        'run',
        'test-123',
        '--build-id',
        'build-456',
        ...JSON_FLAGS,
        '--branch=staging'
      ])
    })

    it('passes branch to workflow runs', () => {
      const result = runTest({ 'workflow-id': 'wf-123', branch: 'staging' })

      expect(result.cliArgs).toEqual([
        'workflow',
        'run',
        'wf-123',
        ...JSON_FLAGS,
        '--branch=staging'
      ])
    })

    it('never evaluates the branch value as shell code', () => {
      const branch = 'x$(touch injected)`touch injected-too`;touch injected-3'
      const result = runTest({ 'test-id': 'test-123', branch })

      expect(result.cliArgs).toEqual([
        'test',
        'run',
        'test-123',
        ...JSON_FLAGS,
        `--branch=${branch}`
      ])
      expect(
        fs
          .readdirSync(result.workDir)
          .filter(name => name.startsWith('injected'))
      ).toEqual([])
    })

    it('passes --all-branches when all-branches is true', () => {
      const result = runTest(
        { 'test-id': 'test-123', 'all-branches': 'true' },
        FIRST_ALL_BRANCHES_CLI
      )

      expect(result.cliArgs).toEqual([
        'test',
        'run',
        'test-123',
        ...JSON_FLAGS,
        '--all-branches'
      ])
    })

    it('passes --all-branches to workflow runs', () => {
      const result = runTest(
        { 'workflow-id': 'wf-123', 'all-branches': 'true' },
        FIRST_ALL_BRANCHES_CLI
      )

      expect(result.cliArgs).toEqual([
        'workflow',
        'run',
        'wf-123',
        ...JSON_FLAGS,
        '--all-branches'
      ])
    })
  })

  describe('run-workflow', () => {
    const runWorkflow = (inputs, cli) =>
      run('run-workflow/action.yml', 'Execute workflow via CLI', inputs, cli)

    it('passes no branch when branch is omitted', () => {
      const result = runWorkflow({ 'workflow-id': 'wf-123' })

      expect(result.cliArgs).toEqual([
        'workflow',
        'run',
        'wf-123',
        ...JSON_FLAGS
      ])
      expect(result.outputs).toContain('status=completed')
    })

    it('passes branch as one argument', () => {
      const result = runWorkflow({
        'workflow-id': 'wf-123',
        branch: 'feature/login flow'
      })

      expect(result.cliArgs).toEqual([
        'workflow',
        'run',
        'wf-123',
        ...JSON_FLAGS,
        '--branch=feature/login flow'
      ])
    })

    it('never evaluates the branch value as shell code', () => {
      const branch = 'x$(touch injected)`touch injected-too`'
      const result = runWorkflow({ 'workflow-id': 'wf-123', branch })

      expect(result.cliArgs).toEqual([
        'workflow',
        'run',
        'wf-123',
        ...JSON_FLAGS,
        `--branch=${branch}`
      ])
      expect(
        fs
          .readdirSync(result.workDir)
          .filter(name => name.startsWith('injected'))
      ).toEqual([])
    })

    it('passes --all-branches when all-branches is true', () => {
      const result = runWorkflow(
        { 'workflow-id': 'wf-123', 'all-branches': 'true' },
        FIRST_ALL_BRANCHES_CLI
      )

      expect(result.cliArgs).toEqual([
        'workflow',
        'run',
        'wf-123',
        ...JSON_FLAGS,
        '--all-branches'
      ])
    })
  })

  const MISSING_BRANCH_ERROR = `Branch "typo" doesn't exist for Shop iOS`
  const refusedRun = fields =>
    `${JSON.stringify(
      {
        ...fields,
        error: MISSING_BRANCH_ERROR,
        status: '',
        success: false,
        task_id: ''
      },
      null,
      2
    )}\nError: ${MISSING_BRANCH_ERROR}\n`
  const refusedTestOutput = refusedRun({
    branch_name: '',
    build_id: '',
    build_version: '',
    test_name: ''
  })
  const refusedWorkflowOutput = refusedRun({ tests: [], total_tests: 0 })

  for (const [actionFile, stepName, target, refusedOutput] of [
    [
      'run-test/action.yml',
      'Run via CLI',
      { 'test-id': 'test-123' },
      refusedTestOutput
    ],
    [
      'run-workflow/action.yml',
      'Execute workflow via CLI',
      { 'workflow-id': 'wf-123' },
      refusedWorkflowOutput
    ]
  ]) {
    const resource = actionFile.split('/')[0]
  }

  describe('literal text in job summaries', () => {
    const literal =
      'Checkout & <b>Pay</b> &lt; | `code` *bold* _em_ [link](target) ~~strike~~ #'
    const escaped =
      'Checkout &amp; &lt;b&gt;Pay&lt;/b&gt; &amp;lt; &#124; &#96;code&#96; &#42;bold&#42; &#95;em&#95; &#91;link&#93;(target) &#126;&#126;strike&#126;&#126; &#35;'

    for (const [actionFile, stepName, resource] of [
      ['run-test/action.yml', 'Run via CLI', 'test'],
      ['run-test/action.yml', 'Run via CLI', 'workflow'],
      ['run-workflow/action.yml', 'Execute workflow via CLI', 'workflow']
    ]) {
      for (const success of [true, false]) {
        it(`${actionFile} escapes ${resource} summary text with success=${success} and preserves raw outputs`, () => {
          const testResult = {
            branch_name: literal,
            build_version: literal,
            duration: literal,
            platform: literal,
            success,
            test_name: literal
          }
          const cliOutput = JSON.stringify(
            {
              ...(resource === 'test'
                ? testResult
                : { workflow_name: literal, tests: [testResult] }),
              duration: literal,
              error: success ? '' : literal,
              status: literal,
              success,
              task_id: 'task-123'
            },
            null,
            2
          )
          const result = (success ? run : runFailing)(
            actionFile,
            stepName,
            { [`${resource}-id`]: 'target-123' },
            { cliOutput, cliExitCode: success ? 0 : 1 }
          )
          const title = resource === 'test' ? 'Test' : 'Workflow'
          const buildLabel = resource === 'test' ? 'Build' : 'Builds'

          expect(result.summary).toContain(`## Revyl ${title}: ${escaped}\n`)
          expect(result.summary).toContain(
            `**Status:** <code>${escaped}</code> | **Duration:** ${escaped}\n`
          )
          expect(result.summary).toContain(
            `**${buildLabel}:** ${escaped} from branch ${escaped}\n`
          )
          expect(result.stdout).toContain(cliOutput)
          expect(result.stdout).toContain(
            `${buildLabel}: ${literal} from branch ${literal}\n`
          )
          expect(result.outputs).toContain(`execution_time=${literal}\n`)
          if (!success) {
            expect(result.summary).toContain(`**Error:** ${escaped}\n`)
            expect(result.outputs).toContain(`error_message=${literal}\n`)
          }
          if (resource === 'workflow') {
            expect(result.summary).toContain(
              `| ${escaped} | ${escaped} | ${success ? 'Passed' : 'Failed'} | ${escaped} |\n`
            )
          }
          if (actionFile === 'run-workflow/action.yml') {
            expect(result.outputs).toContain(`status=${literal}\n`)
          }
        })
      }
    }
  })

  describe('build the run used', () => {

    const workflowTest = (testName, branchName, buildID, buildVersion) => ({
      branch_name: branchName,
      build_id: buildID,
      build_version: buildVersion,
      duration: '12.0s',
      error_message: '',
      platform: 'ios',
      status: 'completed',
      success: true,
      test_name: testName
    })
    const workflowOutput = JSON.stringify(
      {
        status: 'completed',
        success: true,
        task_id: 'task-123',
        tests: [
          workflowTest('Login', 'main', 'b1', 'v1.3'),
          workflowTest('Cart', 'main', 'b1', 'v1.3'),
          workflowTest('Search', 'staging', 'b2', 'v2.0'),
          workflowTest('Never started', '', '', '')
        ],
        total_tests: 4
      },
      null,
      2
    )
  })
})
