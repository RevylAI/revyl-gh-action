# Revyl Test Runner Action

A GitHub Action for running Revyl tests with real-time monitoring and report
generation.

## Features

- **Real-time monitoring** using Server-Sent Events (SSE) instead of polling
- **Automatic report link generation** from test completion events
- **Progress tracking** with detailed step and phase information
- **Configurable timeouts** and monitoring intervals
- **Support for both tests and workflows**

## Usage

### Basic Test Execution

```yaml
- name: Run Revyl Test
  uses: ./actions/run-test
  with:
    test-id: 'your-test-id'
    revyl-device-url: 'https://device-staging.revyl.ai'
    timeout: '1800' # 30 minutes
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
```

### Workflow Execution

```yaml
- name: Run Revyl Workflow
  uses: ./actions/run-test
  with:
    workflow-id: 'your-workflow-id'
    revyl-device-url: 'https://device-staging.revyl.ai'
    timeout: '3600' # 1 hour
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
```

### Build-to-Test Pipeline

```yaml
- name: Upload Build
  id: upload-build
  uses: ./actions/upload-build
  with:
    build-var-id: 'your-build-var-id'
    version: '${{ github.sha }}'
    file-path: 'path/to/your/build.apk'
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}

- name: Run Test with New Build
  uses: ./actions/run-test
  with:
    test-id: 'your-test-id'
    build-version-id: ${{ steps.upload-build.outputs.version-id }}
    timeout: '1800'
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
```

### Advanced Configuration

```yaml
- name: Run Revyl Test with Custom Settings
  uses: ./actions/run-test
  with:
    test-id: 'your-test-id'
    revyl-device-url: 'https://device-staging.revyl.ai'
    retries: '2'
    build-version-id: 'specific-build-version-id'
    llm_model_name: 'gpt-4o'
    timeout: '2400' # 40 minutes
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
```

## Inputs

| Input              | Description                                               | Required | Default                           |
| ------------------ | --------------------------------------------------------- | -------- | --------------------------------- |
| `test-id`          | ID of the test to run                                     | No\*     |                                   |
| `workflow-id`      | ID of the workflow to run                                 | No\*     |                                   |
| `revyl-device-url` | Revyl device service URL                                  | No       | `https://device-staging.revyl.ai` |
| `retries`          | Number of retries for failed tests                        | No       | `1`                               |
| `llm_model_name`   | LLM model to use                                          | No       |                                   |
| `build-version-id` | Build version ID to use (overrides test's attached build) | No       |                                   |
| `timeout`          | Maximum time to wait (seconds)                            | No       | `3600`                            |

\*Either `test-id` or `workflow-id` must be provided, but not both.

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
📊 Report available at: https://backend-staging.revyl.ai/tests/test_123/history/hist_456
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
        uses: ./actions/run-test
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

### v2.0.0 (Current)

- **NEW**: Real-time monitoring via Server-Sent Events
- **NEW**: Automatic report link extraction and output
- **NEW**: Enhanced progress tracking with phases and steps
- **IMPROVED**: Better error handling and timeout management
- **IMPROVED**: More detailed logging and status updates

### v1.0.0

- Basic polling-based test execution
- Simple status checking
- Basic timeout handling
