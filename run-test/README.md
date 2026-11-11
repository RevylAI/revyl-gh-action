# Revyl Test Runner Action

A GitHub Action for running Revyl tests with real-time monitoring and report
generation.

## Features

- **CLI-first execution** using `revyl-cli`
- **Real-time monitoring** using Server-Sent Events (SSE) instead of polling
- **Automatic report link generation** from test completion events
- **Progress tracking** with detailed step and phase information
- **Configurable timeouts** and monitoring intervals
- **Support for both tests and workflows**

## Usage

### Basic Test Execution

```yaml
- name: Run Revyl Test
  uses: RevylAI/revyl-gh-action/run-test@main
  with:
    test-id: 'your-test-id'
    timeout: '1800' # 30 minutes
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
```

### Workflow Execution

```yaml
- name: Run Revyl Workflow
  uses: RevylAI/revyl-gh-action/run-test@main
  with:
    workflow-id: 'your-workflow-id'
    timeout: '3600' # 1 hour
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
```

### Build-to-Test Pipeline

```yaml
- name: Upload Build
  id: upload-build
  uses: RevylAI/revyl-gh-action/upload-build@main
  with:
    app-id: 'your-revyl-app-id'
    version: '${{ github.sha }}'
    file-path: 'path/to/your/build.apk'
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}

- name: Run Test with New Build
  uses: RevylAI/revyl-gh-action/run-test@main
  with:
    test-id: 'your-test-id'
    build-id: ${{ steps.upload-build.outputs.build-id }}
    timeout: '1800'
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
```

### Run on a Branch

```yaml
- name: Run Revyl Test on staging
  uses: RevylAI/revyl-gh-action/run-test@main
  with:
    test-id: 'your-test-id'
    branch: 'staging'
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
```

`branch` picks the Revyl branch for this run only. The run uses the branch's
default build (its pin, or its Latest build). A `build-id` given with `branch`
must belong to that branch, or the run fails before it starts. A branch you set
never falls back. `branch` needs Revyl CLI 0.1.148 or later. Use it for
long-lived branches like `main` or `staging`.

Without `branch`, the run uses the test's or workflow's saved choice; saved
branches and exact builds stay fixed. A test saved on Default branch runs on the
job's Git branch (in a pull request, its source branch, `owner:branch` for a
fork) when automatic Git branch detection is on for the app and that branch has
a usable build. Otherwise it runs on the app's default branch. Change the
setting on the app's Build branches page. Explicit branches, exact builds, and
All branches selections remain authoritative in either toggle state.

Tests created in the dashboard start on All branches · Latest build, so a pull
request job can run another pull request's upload. To test the pull request's
own build, pass the upload's `build-id` (test runs only), or save the test on
Default branch; see
[New saved choices](https://docs.revyl.com/builds/branches#new-saved-choices).

### Run on the Newest Build Across All Branches

```yaml
- name: Run Revyl Test on the newest build
  uses: RevylAI/revyl-gh-action/run-test@main
  with:
    test-id: 'your-test-id'
    all-branches: 'true'
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
```

`all-branches: 'true'` runs on the newest build across all of the app's branches
(All branches · Latest build) for this run only. With `workflow-id`, each app in
the workflow uses its own newest build. It can't be combined with `branch` or
`build-id`; the run fails before it starts. `all-branches` needs Revyl CLI
0.1.149 or later; the default `cli-version: latest` has it.

### Run the Checkout's Test Files

```yaml
- uses: actions/checkout@v4
- name: Run Revyl Test from this checkout
  uses: RevylAI/revyl-gh-action/run-test@main
  with:
    test-id: 'your-test-id'
    from-checkout: 'true'
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
```

`from-checkout: 'true'` runs the checked-out `.revyl/tests`, `.revyl/modules`
and `.revyl/scripts` files instead of the saved copies. `'false'` sends no
files, so the run reads its branch's files from Git when the project runs tests
from Git, and the saved copies otherwise. Omit it to let the CLI decide: it runs
the files when `.revyl/config.yaml` sets `run_test_definitions_from_git: true`.
The job needs `actions/checkout` before this step. The CLI looks for
`.revyl/config.yaml` from the job's workspace up, or from the
`working-directory` folder up when you set it. When the project is in a
subfolder, such as `apps/mobile/.revyl/`, set `working-directory: apps/mobile`.
`'true'` fails before the run starts when the CLI finds no `.revyl/config.yaml`.
The log's `Definition:` line shows what ran.

`from-checkout` needs Revyl CLI 0.1.234 or later, and so does a
`.revyl/config.yaml` that sets `run_test_definitions_from_git` (`true` or
`false`), with or without the input; the default `cli-version: latest` has it.
Older CLIs reject the key or run without the checkout's files, so with an older
`cli-version` the step fails before the run starts:
`The run_test_definitions_from_git key in .revyl/config.yaml needs Revyl CLI 0.1.234 or newer (found 0.1.210). Set cli-version to 0.1.234 or newer, or remove the key.`
With `working-directory`, the step checks the `.revyl/config.yaml` the CLI
reads: the first one from that folder up to the repository root. Without it, the
step checks every `.revyl/config.yaml` in the workspace, subfolders included,
and names the first that sets the key, because Revyl refuses a run from an older
CLI on a project that runs tests from Git wherever the CLI runs.

### No-Wait Mode

Launch tests without waiting for completion. The action succeeds immediately
after the test is queued, only failing if there was an error starting the
execution.

```yaml
- name: Launch Revyl Test (No-Wait)
  uses: RevylAI/revyl-gh-action/run-test@main
  with:
    test-id: 'your-test-id'
    no-wait: 'true'
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
```

### Advanced Configuration

```yaml
- name: Run Revyl Test with Custom Settings
  uses: RevylAI/revyl-gh-action/run-test@main
  with:
    test-id: 'your-test-id'
    retries: '2'
    build-id: 'specific-build-id'
    timeout: '2400' # 40 minutes
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
```

## Inputs

| Input               | Description                                                | Required | Default      |
| ------------------- | ---------------------------------------------------------- | -------- | ------------ |
| `test-id`           | ID of the test to run                                      | No\*     |              |
| `workflow-id`       | ID of the workflow to run (preferred)                      | No\*     |              |
| `workflow_id`       | Deprecated alias for `workflow-id`                         | No       |              |
| `retries`           | Number of retries for failed tests                         | No       | `1`          |
| `build-id`          | Exact build ID to run; test runs only                      | No       |              |
| `build-version-id`  | Deprecated alias for `build-id`                            | No       |              |
| `branch`            | Revyl branch to run on; a `build-id` must belong to it     | No       | Saved choice |
| `all-branches`      | Run on the newest build across all branches                | No       | `false`      |
| `from-checkout`     | Run the checkout's test files instead of the saved copies  | No       | From config  |
| `working-directory` | Folder to run the CLI in, such as the project's subfolder  | No       | Workspace    |
| `timeout`           | Maximum time to wait (seconds)                             | No       | `3600`       |
| `no-wait`           | Launch and exit immediately without waiting for completion | No       | `false`      |
| `cli-version`       | Revyl CLI version used by action runtime                   | No       | `latest`     |

\*Either `test-id`, `workflow-id` (preferred), or `workflow_id` (deprecated
alias) must be provided, but not both test and workflow IDs.

## Outputs

| Output            | Description                                                            |
| ----------------- | ---------------------------------------------------------------------- |
| `task_id`         | Unique task ID for the execution                                       |
| `success`         | Whether the test/workflow completed successfully (`true`/`false`)      |
| `execution_time`  | Total execution time in HH:MM:SS format                                |
| `platform`        | Platform the test ran on (web/ios/android)                             |
| `error_message`   | Error message if execution failed                                      |
| `report_link`     | Shareable link to the detailed test execution report                   |
| `total_steps`     | Total number of steps in the test (test executions only)               |
| `completed_steps` | Number of steps completed in the test (test executions only)           |
| `total_tests`     | Total number of tests in the workflow (workflow executions only)       |
| `completed_tests` | Number of tests completed in the workflow (workflow executions only)   |
| `passed_tests`    | Number of tests that passed in the workflow (workflow executions only) |
| `failed_tests`    | Number of tests that failed in the workflow (workflow executions only) |

## Real-time Monitoring

This action uses **Server-Sent Events (SSE)** for real-time monitoring instead
of traditional polling. This provides:

- **Instant updates** when test status changes
- **Lower server load** compared to polling
- **Detailed progress information** including current steps and phases
- **Automatic report link extraction** when tests complete

### Example Output

```
SSE connection established
SSE connected for org: org_123456
Test started: Login Flow Test
Status: running | Phase: executing | Current Step: "Navigate to login page" | Step Progress: 1/5 | Progress: 20%
Status: running | Phase: executing | Current Step: "Enter credentials" | Step Progress: 2/5 | Progress: 40%
Status: running | Phase: executing | Current Step: "Click login button" | Step Progress: 3/5 | Progress: 60%
Status: running | Phase: executing | Current Step: "Verify dashboard" | Step Progress: 4/5 | Progress: 80%
Status: running | Phase: executing | Current Step: "Logout" | Step Progress: 5/5 | Progress: 100%
✅ Test completed successfully: Login Flow Test
📊 Report available at: https://app.revyl.ai/tests/report?taskId=task_123
```

## Error Handling

The action handles various error scenarios:

- **Connection failures**: Automatic SSE reconnection
- **Timeouts**: Configurable timeout with graceful termination
- **Test failures**: Detailed error messages and report links
- **API errors**: Clear error reporting with HTTP status codes

## Environment Variables

| Variable        | Description                  | Required |
| --------------- | ---------------------------- | -------- |
| `REVYL_API_KEY` | Revyl API authentication key | Yes      |

Get your API key from the Revyl dashboard settings.

## Example Workflow

```yaml
name: Run Revyl Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Run Login Test
        id: login-test
        uses: RevylAI/revyl-gh-action/run-test@main
        with:
          test-id: 'login-flow-test'
          timeout: '1200'
        env:
          REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}

      - name: Check Test Results
        run: |
          echo "Test completed: ${{ steps.login-test.outputs.success }}"
          echo "Execution time: ${{ steps.login-test.outputs.execution_time }}"
          echo "Platform: ${{ steps.login-test.outputs.platform }}"
          echo "Report: ${{ steps.login-test.outputs.report_link }}"

          if [ "${{ steps.login-test.outputs.success }}" != "true" ]; then
            echo "Test failed: ${{ steps.login-test.outputs.error_message }}"
            exit 1
          fi

      - name: Post Report Link
        if: always()
        run: |
          if [ -n "${{ steps.login-test.outputs.report_link }}" ]; then
            echo "📊 View detailed test report: ${{ steps.login-test.outputs.report_link }}"
          fi
```

## Changelog

See the [release notes](../docs/release-notes.md).
