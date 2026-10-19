# Run Revyl Workflow Action

A dedicated CLI-first entrypoint for executing a Revyl workflow by
`workflow-id`, with real-time monitoring and workflow-focused outputs.

## Usage

```yaml
- name: Run Revyl Workflow
  uses: RevylAI/revyl-gh-action/run-workflow@main
  with:
    api-key: ${{ secrets.REVYL_API_KEY }}
    workflow-id: 'your-workflow-id'
    timeout: '3600'
```

Alternatively, you can set the API key as an environment variable:

```yaml
- name: Run Revyl Workflow
  uses: RevylAI/revyl-gh-action/run-workflow@main
  with:
    workflow-id: 'your-workflow-id'
    timeout: '3600'
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
```

### Run on a Branch

```yaml
- name: Run Revyl Workflow on staging
  uses: RevylAI/revyl-gh-action/run-workflow@main
  with:
    api-key: ${{ secrets.REVYL_API_KEY }}
    workflow-id: 'your-workflow-id'
    branch: 'staging'
```

`branch` runs every app in the workflow on that Revyl branch for this run only.
Each app runs the branch's default build (its pin, or its Latest build). A
branch you set never falls back. `branch` needs Revyl CLI 0.1.148 or later. Use
it for long-lived branches like `main` or `staging`.

Without `branch`, the workflow uses its saved choices; saved branches and exact
builds stay fixed. Tests saved on Default branch run on the job's Git branch (in
a pull request, its source branch, `owner:branch` for a fork), and each app
without a usable build there uses its own default branch.

Tests and workflow app overrides created in the dashboard start on All branches
· Latest build, so a pull request job can run another pull request's upload. To
test the pull request's own builds, save them on Default branch, or run the
upload with `run-test` and its `build-id`; see
[New saved choices](https://docs.revyl.com/builds/branches#new-saved-choices).

### Run on the Newest Build Across All Branches

```yaml
- name: Run Revyl Workflow on the newest builds
  uses: RevylAI/revyl-gh-action/run-workflow@main
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
  uses: RevylAI/revyl-gh-action/run-workflow@main
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
  uses: RevylAI/revyl-gh-action/run-workflow@main
  with:
    api-key: ${{ secrets.REVYL_API_KEY }}
    workflow-id: 'your-workflow-id'
    timeout: '3600'
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
        uses: RevylAI/revyl-gh-action/run-workflow@main
        with:
          api-key: ${{ secrets.REVYL_MONITORING_API_KEY }}
          workflow-id: 'your-workflow-id'
          timeout: '3600'
```

## Inputs

| Input          | Description                                                             | Required | Default       |
| -------------- | ----------------------------------------------------------------------- | -------- | ------------- |
| `api-key`      | Revyl API key for authentication (can also use `REVYL_API_KEY` env var) | No       |               |
| `workflow-id`  | The workflow id to run (preferred)                                      | Yes\*    |               |
| `workflow_id`  | Deprecated alias for `workflow-id`                                      | No       |               |
| `branch`       | Revyl branch to run every app in the workflow on                        | No       | Saved choices |
| `all-branches` | Run every app on its newest build across all branches                   | No       | `false`       |
| `retries`      | Number of retries for failed tests in the workflow                      | No       | `1`           |
| `timeout`      | Timeout in seconds for workflow execution                               | No       | `3600`        |
| `backend-url`  | Override backend base URL                                               | No       |               |
| `no-wait`      | Launch and exit immediately without waiting for completion              | No       | `false`       |
| `cli-version`  | CLI version used by the action runtime                                  | No       | `latest`      |

\* Provide either `workflow-id` (preferred) or the deprecated `workflow_id`
alias.

## Outputs

| Output            | Description                                   |
| ----------------- | --------------------------------------------- |
| `success`         | Whether the workflow completed successfully   |
| `status`          | Final workflow status when available          |
| `task_id`         | Task id returned by the async execution API   |
| `total_tests`     | Total number of tests in the workflow         |
| `completed_tests` | Number of tests completed within the workflow |
| `passed_tests`    | Number of tests that passed                   |
| `failed_tests`    | Number of tests that failed                   |
| `error_message`   | Error message if execution failed             |
| `report_link`     | Shareable link to the workflow report         |
| `execution_time`  | Total execution time reported by the CLI      |

## Environment Variables

- `REVYL_API_KEY` (optional): Your Revyl API key. Can also be passed via the
  `api-key` input parameter.

## Notes

- This action is CLI-first and always executes through `revyl-cli`.
- Pin to a release (e.g., `@v2.2.1`) or a commit SHA for stability.
