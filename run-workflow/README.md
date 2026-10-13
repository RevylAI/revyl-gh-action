# Run Revyl Workflow Action

A dedicated CLI-first entrypoint for executing a Revyl workflow by
`workflow-id`, with real-time monitoring and workflow-focused outputs.

## Usage

```yaml
- name: Run Revyl Workflow
  uses: RevylAI/revyl-gh-action/run-workflow@v2.2.1
  with:
    api-key: ${{ secrets.REVYL_API_KEY }}
    workflow-id: 'your-workflow-id'
    timeout: '3600'
```

Alternatively, you can set the API key as an environment variable:

```yaml
- name: Run Revyl Workflow
  uses: RevylAI/revyl-gh-action/run-workflow@v2.2.1
  with:
    workflow-id: 'your-workflow-id'
    timeout: '3600'
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
```

### Run on a Branch

```yaml
- name: Run Revyl Workflow on staging
  uses: RevylAI/revyl-gh-action/run-workflow@v2.2.1
  with:
    api-key: ${{ secrets.REVYL_API_KEY }}
    workflow-id: 'your-workflow-id'
    branch: 'staging'
```

`branch` runs every app in the workflow on that Revyl branch for this run only.
Each app runs the branch's default build: its pinned build, or its newest build
when it isn't pinned. Without `branch`, the workflow uses its saved selections,
which use the app default branch unless changed. `branch` needs Revyl CLI
0.1.148 or later; the default `cli-version: latest` has it. Use long-lived
branches like `main` or `staging`. Don't pass per-PR values like
`${{ github.head_ref }}`; branches can't be deleted.

### Run on the Newest Build Across All Branches

```yaml
- name: Run Revyl Workflow on the newest builds
  uses: RevylAI/revyl-gh-action/run-workflow@v2.2.1
  with:
    api-key: ${{ secrets.REVYL_API_KEY }}
    workflow-id: 'your-workflow-id'
    all-branches: 'true'
```

`all-branches: 'true'` runs every app in the workflow on its newest build across
all of its branches (All branches · Latest build) for this run only. It can't be
combined with `branch`; the run fails before it starts. `all-branches` needs
Revyl CLI 0.1.149 or later; the default `cli-version: latest` has it.

### No-Wait Mode

Launch workflows without waiting for completion. The action succeeds immediately
after the workflow is queued, only failing if there was an error starting the
execution.

```yaml
- name: Launch Revyl Workflow (No-Wait)
  uses: RevylAI/revyl-gh-action/run-workflow@v2.2.1
  with:
    api-key: ${{ secrets.REVYL_API_KEY }}
    workflow-id: 'your-workflow-id'
    no-wait: 'true'
```

### Pinned CLI Version

Execution always runs through the Revyl CLI. Pin a known CLI release for
reproducibility.

```yaml
- name: Run Revyl Workflow via CLI
  uses: RevylAI/revyl-gh-action/run-workflow@v2.2.1
  with:
    api-key: ${{ secrets.REVYL_API_KEY }}
    workflow-id: 'your-workflow-id'
    timeout: '3600'
    cli-version: 'v0.1.5'
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
        uses: RevylAI/revyl-gh-action/run-workflow@v2.2.1
        with:
          api-key: ${{ secrets.REVYL_MONITORING_API_KEY }}
          workflow-id: 'your-workflow-id'
          timeout: '3600'
```

## Inputs

| Input          | Required | Description                                                             | Default          |
| -------------- | -------- | ----------------------------------------------------------------------- | ---------------- |
| `api-key`      | No       | Revyl API key for authentication (can also use `REVYL_API_KEY` env var) |                  |
| `workflow-id`  | Yes\*    | The workflow id to run (preferred)                                      |                  |
| `workflow_id`  | No       | Deprecated alias for `workflow-id`                                      |                  |
| `branch`       | No       | Revyl branch to run every app in the workflow on                        | Saved selections |
| `all-branches` | No       | Run every app on its newest build across all branches                   | `false`          |
| `retries`      | No       | Number of retries for failed tests in the workflow                      | `1`              |
| `timeout`      | No       | Timeout in seconds for workflow execution                               | `3600`           |
| `backend-url`  | No       | Override backend base URL                                               | -                |
| `no-wait`      | No       | Launch and exit immediately without waiting for completion              | `false`          |
| `cli-version`  | No       | CLI version used by the action runtime                                  | `latest`         |

\* Provide either `workflow-id` (preferred) or the deprecated `workflow_id`
alias.

## Outputs

| Output            | Description                                   |
| ----------------- | --------------------------------------------- |
| `success`         | Whether the workflow completed successfully   |
| `task_id`         | Task id returned by the async execution API   |
| `total_tests`     | Total number of tests in the workflow         |
| `completed_tests` | Number of tests completed within the workflow |
| `execution_time`  | Total execution time reported by the CLI      |

## Environment Variables

- `REVYL_API_KEY` (optional): Your Revyl API key. Can also be passed via the
  `api-key` input parameter.

## Notes

- This action is CLI-first and always executes through `revyl-cli`.
- Pin to a release (e.g., `@v2.2.1`) or a commit SHA for stability.
