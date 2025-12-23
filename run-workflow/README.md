# Run Revyl Workflow Action

A dedicated entrypoint for executing a Revyl workflow by `workflow-id`, with real-time monitoring and workflow-focused outputs. This is a thin wrapper around the core runner to provide a clear, separate interface from tests.

## Usage

```yaml
- name: Run Revyl Workflow
  uses: RevylAI/revyl-gh-action/run-workflow@v1
  with:
    workflow-id: 'your-workflow-id'
    timeout: '3600'
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
```

### No-Wait Mode

Launch workflows without waiting for completion. The action succeeds immediately
after the workflow is queued, only failing if there was an error starting the execution.

```yaml
- name: Launch Revyl Workflow (No-Wait)
  uses: RevylAI/revyl-gh-action/run-workflow@v1
  with:
    workflow-id: 'your-workflow-id'
    no-wait: 'true'
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
```

### Scheduled monitoring example

```yaml
name: Revyl Workflow Monitoring
on:
  schedule:
    - cron: '0 * * * *' # hourly

permissions:
  contents: read

jobs:
  monitor:
    runs-on: ubuntu-latest
    steps:
      - name: Execute workflow
        uses: RevylAI/revyl-gh-action/run-workflow@v1
        with:
          workflow-id: 'your-workflow-id'
          timeout: '3600'
        env:
          REVYL_API_KEY: ${{ secrets.REVYL_MONITORING_API_KEY }}
```

## Inputs

| Input             | Required | Description                                              | Default |
| ----------------- | -------- | -------------------------------------------------------- | ------- |
| `workflow-id`     | Yes      | The workflow id to run                                   |         |
| `retries`         | No       | Number of retries for failed tests in the workflow       | `1`     |
| `timeout`         | No       | Timeout in seconds for workflow execution                | `3600`  |
| `no-wait`         | No       | Launch and exit immediately without waiting for completion | `false` |

## Outputs

| Output            | Description                                   |
| ----------------- | --------------------------------------------- |
| `success`         | Whether the workflow completed successfully   |
| `task_id`         | Task id returned by the async execution API   |
| `total_tests`     | Total number of tests in the workflow         |
| `completed_tests` | Number of tests completed within the workflow |


## Environment Variables

- `REVYL_API_KEY` (required): Your Revyl API key

## Notes

- This action delegates to the core `run-test` action for execution, leveraging the same real-time SSE monitoring and error handling.
- Pin to a release (e.g., `@v1`) or a commit SHA for stability.
