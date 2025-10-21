# Release Notes

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
- `workflow_completed`, `workflow_failed`, `workflow_cancelled` - Terminal states
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

**Migration Guide**
No action needed if using latest backend. The action automatically uses the new endpoint.

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

