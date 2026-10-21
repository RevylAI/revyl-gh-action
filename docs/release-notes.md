# Release Notes

## v2.3.0 - Uploads follow the Git branch (unreleased)

### Changes

- Without `branch`, `upload-build` respects each app's Automatic Git branch
  detection setting on its Build branches page. Off uploads to the app default.
  On (the initial setting) uploads to the run's Git branch: the pull request's
  source branch (`owner:branch` for forks) or the branch the run is on, even
  without a checkout, and creates it if needed. Tag runs, and jobs with no
  branch to read, still upload to the app's default branch. A detected name that
  can't be a Revyl branch fails before upload. Uploads don't pin the branch.
- With automatic detection on, every branch you upload from becomes a Revyl
  branch, and branches can't be deleted. Merge queue runs
  (`gh-readonly-queue/...`, one per entry) and bot branches create one each; set
  `branch` in those workflows.
- With CLI 0.1.177 or later, tests saved on Default branch run on the job's Git
  branch in `run-test` and `run-workflow` when it has a usable build, otherwise
  on the app's default branch. Turning automatic detection off always uses the
  app default for inferred Git context. Older CLIs use the app's default branch.
  Saved branches, exact builds, `branch` and `all-branches` aren't affected.
- Tests and workflow app overrides created in the dashboard start on All
  branches · Latest build, so a pull request job can run another pull request's
  upload. To test a pull request's own build, pass the upload's `build-id` to
  `run-test`, or save the test on Default branch; see
  [New saved choices](https://docs.revyl.com/builds/branches#new-saved-choices).

### Upgrading

- A job on `main` now uploads to a Revyl branch named `main`, not to the app's
  default branch (`base` unless you changed it). Embeds, the app's preview link,
  and dashboard and scheduled runs saved on Default branch use the default
  branch, so they stop picking up new CI builds. Make `main` the default branch
  (`revyl app branch default main --app <app>`), or set `branch: base` (your
  default branch's name, if you changed it), or turn off Automatic Git branch
  detection on the app's Build branches page to keep the default destination.
- Workflows on `@v2` or `@main` get this change without edits. Pin `@v2.2.1`, or
  set `branch`, to keep the old destination.
- Runs follow the Git branch through the CLI, not the Action, so with the
  default `cli-version: latest` every Action version does from CLI 0.1.177 on.
  To keep the old run behavior, pin `cli-version` to an earlier release, such as
  `v0.1.174`.

See
[Keep a source-of-truth branch current](https://docs.revyl.com/builds/branches#keep-a-source-of-truth-branch-current)
and
[Choose where CI uploads go](https://docs.revyl.com/builds/ci-builds#choose-where-ci-uploads-go).

---

## v2.2.1 - Literal summary text (2026-10-13)

### Changes

- `run-test` and `run-workflow` preserve literal HTML and Markdown characters in
  job-summary names, errors, build details, and result tables. CLI JSON, console
  logs, and Action outputs keep their original values.

---

## v2.2.0 - All-branches input (2026-10-12)

### Changes

- Added an optional `all-branches` input to `run-test` and `run-workflow`. Set
  to `true`, a run uses the newest build across all of the app's branches (All
  branches · Latest build) for this run only; in a workflow, each app uses its
  own newest build.
- `all-branches` defaults to `false`, so existing workflows run as before. It
  accepts only `true` or `false`; a blank value means `false`.
- `all-branches` can't be combined with `branch`, or with `build-id` in
  `run-test`. The action stops before the run and says so in `error_message`,
  for example
  `The all-branches input can't be combined with branch. Remove one of them.`
- `all-branches` needs Revyl CLI 0.1.149 or newer. With an older `cli-version`,
  the action stops before the run with
  `The all-branches input needs Revyl CLI 0.1.149 or newer (found 0.1.148).` in
  `error_message`. `branch` still needs Revyl CLI 0.1.148 or newer.
- `upload-build` never pins a branch. When the branch is already pinned to the
  uploaded build, its summary now says `Branch: staging (pinned to this build)`
  instead of `default build is now <version>`. When it is pinned to another
  build, the summary says
  `Branch: staging (pinned to v1.2; runs that don't choose a build keep using v1.2)`
  instead of `default build stays v1.2; runs won't use this upload`.
- `run-test` and `run-workflow` name the branch each build came from, as
  `Build: v1.3 from branch main` or
  `Builds: v1.3 from branch main, v2.0 from branch staging`, instead of
  `v1.3 on main`.

```yaml
- uses: RevylAI/revyl-gh-action/run-workflow@v2.2.0
  with:
    api-key: ${{ secrets.REVYL_API_KEY }}
    workflow-id: 'your-workflow-id'
    all-branches: 'true'
```

---

## v2.1.0 - Branch input (2026-10-11)

### Changes

- Added an optional `branch` input to `upload-build`, `run-test`, and
  `run-workflow`. `upload-build` uploads to that Revyl branch and creates it if
  it does not exist. `run-test` and `run-workflow` run on that branch for this
  run only.
- Without `branch`, every action behaves as before: uploads go to the app
  default branch and runs use their saved selections.
- In `run-test`, a `build-id` given with `branch` must belong to that branch, or
  the run fails before it starts.
- `branch` in `run-test` and `run-workflow` needs Revyl CLI 0.1.148 or newer.
  With an older `cli-version`, the action stops before the run with
  `The branch input needs Revyl CLI 0.1.148 or newer (found 0.1.147).` in
  `error_message`.
- Every action ignores whitespace around `branch`; a blank value means no
  branch.
- `run-test` and `run-workflow` say which build ran, as `Build: v1.3 on main` or
  `Builds: v1.3 on main, v2.0 on staging`, in the log and the job summary. A
  branch that doesn't exist fails the run before it starts, with the reason in
  `error_message`.
- `upload-build` logs which build runs on the branch after the upload, for
  example
  `Branch: staging (default build stays v1.2; runs won't use this upload)`.
- `upload-build` records the pull request's branch as build metadata `branch` on
  `pull_request` runs, instead of `<pr_number>/merge`.

```yaml
- uses: RevylAI/revyl-gh-action/upload-build@v2.1.0
  with:
    app-id: ${{ vars.REVYL_APP_ID }}
    version: ${{ github.sha }}
    file-path: ./app.apk
    branch: staging
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
```

---

## v2.0.5 - Workflow action API-key input (2026-08-10)

### Changes

- Added an optional `api-key` input to `run-workflow`; when omitted, the action
  continues to read `REVYL_API_KEY` from the environment.
- Kept input authentication consistent with `run-test` while preserving the
  existing environment-variable contract.
- Documented the exact `v2.0.5` release pin for reproducible CI workflows.

### Upgrade note for v2.0.0

Customers pinned to `v2.0.0` should upgrade to `v2.0.5`. The older Node runner
connected to the legacy `backend.cognisim.io` SSE endpoint; its cross-origin
redirect to `backend.revyl.ai` could discard the authorization header and fail
monitoring with `401 Unauthorized` after a workflow had already queued. `v2.0.5`
ships the CLI-first runner with the canonical backend endpoint.

Both authentication forms are supported:

```yaml
- uses: RevylAI/revyl-gh-action/run-workflow@v2.0.5
  with:
    api-key: ${{ secrets.REVYL_API_KEY }}
    workflow-id: 'your-workflow-id'
```

```yaml
- uses: RevylAI/revyl-gh-action/run-workflow@v2.0.5
  with:
    workflow-id: 'your-workflow-id'
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
```

---

## v2.0.4 - Canonical Build API for upload-build (2026-07-18)

### 🔧 Changes

**upload-build: migrate off the deprecated `/api/v1/builds` mount**

- The published `v2` bundle still called the deprecated `/api/v1/builds/*`
  endpoints; this release ships the already-migrated source, which calls the
  canonical `/api/v1/apps/*` build endpoints.
- No input/output contract changes — drop-in for `@v2` users.

---

## v2.0.0 - Unified Monitoring Endpoint (2025-01-21)

### 🚀 Major Changes

**Unified SSE Monitoring**

- Migrated to unified SSE monitoring endpoint (`/api/v1/monitor/stream/unified`)
- Single efficient stream for both tests and workflows
- Reduced server load and improved performance
- Better real-time event delivery

**Enhanced Failure Detection**

- Workflows that fail now correctly trigger `workflow_failed` events
- Tests that fail now correctly trigger `test_failed_with_data` events
- Proper status reporting in GitHub Actions outputs
- Failed workflows/tests no longer appear as successful

**Improved Error Handling**

- Better SSE connection error messages
- Graceful handling of connection drops
- Non-JSON error event handling
- More descriptive error outputs

### 🔧 Technical Improvements

**Backend Integration**

- Updated to use `GlobalStreamingContext` on backend
- Redis pub/sub for event-driven updates (no polling)
- Cached initial state for faster connection
- Race condition fix: subscribes before sending initial state

**Event Handling**

- `connection_ready` - Connection established
- `initial_state` - Current running tests and workflows
- `workflow_started`, `workflow_updated` - Real-time progress
- `workflow_completed`, `workflow_failed`, `workflow_cancelled` - Terminal
  states
- `test_started`, `test_updated` - Test progress
- `test_completed_with_data`, `test_failed_with_data` - Test results
- `heartbeat` - Connection keep-alive

### ⚠️ Breaking Changes

**Backend Requirements**

- Requires backend with unified monitoring service
- Old endpoints no longer supported:
  - ❌ `/api/v1/tests/monitor/stream`
  - ❌ `/api/v1/workflows/monitor/stream`
  - ✅ `/api/v1/monitor/stream/unified` (new)

**Migration Guide** No action needed if using latest backend. The action
automatically uses the new endpoint.

### 🐛 Bug Fixes

- Fixed workflow failures being incorrectly reported as successful
- Fixed test failures being incorrectly reported as completed
- Improved SSE connection stability
- Better handling of edge cases in initial state parsing
- Fixed race condition in workflow monitoring initialization

### 📊 Outputs

All existing outputs remain the same:

- `task_id` - Unique task identifier
- `success` - `true`/`false` completion status
- `status` - Final status (completed/failed/cancelled)
- `total_tests` - Total tests in workflow
- `completed_tests` - Tests completed
- `passed_tests` - Tests that passed
- `failed_tests` - Tests that failed
- `error_message` - Error details on failure
- `report_link` - Link to test/workflow report

### 🎯 Usage

```yaml
- name: Run Revyl Workflow
  uses: RevylAI/revyl-gh-action/run-test@v2.0.0
  with:
    workflow-id: 'your-workflow-id'
    timeout: '3600'
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
```

Or use `@main` for latest:

```yaml
uses: RevylAI/revyl-gh-action/run-test@main
```

### 📝 Related Changes

- Backend: Unified monitoring service implementation
- Frontend: GlobalStreamingContext integration
- Schemas: OrgWorkflowMonitorItem and OrgTestMonitorItem types

---

## Previous Releases

### v1.x - Legacy Monitoring

- Separate SSE endpoints for tests and workflows
- Polling-based status updates
- Basic error handling
