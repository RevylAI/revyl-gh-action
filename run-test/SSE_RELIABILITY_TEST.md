# SSE Reliability Test

This script tests the reliability of SSE (Server-Sent Events) streaming for
workflow completion events.

## Problem Statement

In the past, SSE streaming seemed to occasionally fail (around 50% of the time)
to deliver the completion event for workflows, causing GitHub Actions to never
finish and eventually timeout.

## What This Script Does

The script:

1. Launches a workflow (ID: `4a10a411-dbf4-4db5-84af-2b718d307baf`)
2. Connects to the SSE stream to monitor for completion
3. Waits for the workflow to complete with a 3-minute timeout
4. Tracks statistics on successful completions vs timeouts
5. Repeats the process continuously until interrupted

## Usage

### Prerequisites

Make sure you have your `REVYL_API_KEY` environment variable set:

```bash
export REVYL_API_KEY=your_api_key_here
```

### Running the Test

From the `run-test` directory:

```bash
# Using npm script (production)
npm run test-sse-reliability

# Using npm script (local development)
npm run test-sse-reliability-local

# Or directly (production)
node sse-reliability-test.js

# Or directly (local development)
node sse-reliability-test.js --local

# Or as executable
./sse-reliability-test.js
./sse-reliability-test.js --local
```

### Using a Different Workflow ID

You can specify a different workflow ID using the `--workflow-id` flag:

```bash
# Test with a custom workflow
node sse-reliability-test.js --workflow-id=your-workflow-id-here

# Combine with local mode
node sse-reliability-test.js --local --workflow-id=your-workflow-id-here
```

### Using a Custom Timeout

You can specify a custom timeout (in seconds) using the `--timeout` flag:

```bash
# Test with a 5-minute timeout
node sse-reliability-test.js --timeout=300

# Test with a 30-second timeout
node sse-reliability-test.js --timeout=30

# Combine with other flags
node sse-reliability-test.js --local --workflow-id=my-workflow --timeout=120
```

Default timeout is 180 seconds (3 minutes).

### Pause on Timeout

Use the `--pause-on-timeout` flag to pause the script after a timeout occurs,
allowing you to investigate logs before the next workflow is launched:

```bash
# Pause after timeouts for investigation
node sse-reliability-test.js --pause-on-timeout

# Combine with other flags
node sse-reliability-test.js --local --pause-on-timeout --timeout=60

# Using npm script
npm run test-sse-reliability-pause
```

When a timeout occurs, the script will display "PAUSED - Press Enter to
continue..." and wait for you to press Enter before continuing to the next
iteration.

### Local Development Mode

Use the `--local` flag to test against local development servers:

```bash
# This will use:
# - Backend: http://localhost:8000
# - Device: http://localhost:8001
npm run test-sse-reliability-local
```

### Optional Environment Variables

You can override the default URLs (ignored when using `--local` flag):

```bash
export BACKEND_URL=https://backend-staging.revyl.ai
export DEVICE_URL=https://device-staging.revyl.ai
npm run test-sse-reliability
```

## Output

The script provides real-time output for each test iteration, including:

- Workflow launch status
- SSE connection events
- Progress updates
- Completion/timeout/error status
- Running statistics

### Example Output

```
🔬 SSE Reliability Test Starting
────────────────────────────────────────────────────────────────────────────────
Workflow ID:           4a10a411-dbf4-4db5-84af-2b718d307baf
Timeout:               180s (3 minutes)
Device URL:            https://device.revyl.ai
Backend URL:           https://backend.revyl.ai
────────────────────────────────────────────────────────────────────────────────

================================================================================
TEST ITERATION #1
================================================================================

🚀 Launching workflow 4a10a411-dbf4-4db5-84af-2b718d307baf...
✅ Workflow queued with task ID: abc123...
📡 Connecting to SSE: https://backend.revyl.ai/api/v1/monitor/stream/unified
🔗 SSE connection established
🏢 Connected to org: org_xyz
📡 Waiting for workflow abc123 to appear...
🚀 Workflow started: Test Workflow
📊 Update - Status: running | Progress: 50.0%
✅ WORKFLOW COMPLETED: Test Workflow

✅ RESULT: SUCCESS in 65.2s

────────────────────────────────────────────────────────────────────────────────
📊 STATISTICS
────────────────────────────────────────────────────────────────────────────────
Total Runs:            1
✅ Successful:          1 (100.0%)
⏰ Timeouts:            0 (0.0%)
❌ Errors:              0
⏱️  Total Time:          70.3s
────────────────────────────────────────────────────────────────────────────────
```

## Stopping the Test

Press `Ctrl+C` to stop the test. The script will print final statistics before
exiting.

## Interpreting Results

- **Success Rate**: Percentage of runs that received the completion event
  successfully
- **Timeout Rate**: Percentage of runs that timed out after 3 minutes without
  receiving completion event
- **Errors**: Connection errors, API errors, or workflow failures

If the timeout rate is high (e.g., 50%), this indicates a reliability issue with
SSE event delivery.

## Troubleshooting

### "REVYL_API_KEY environment variable not set"

Make sure to export your API key:

```bash
export REVYL_API_KEY=your_api_key_here
```

### Connection Errors

- Check that you have network access to the backend/device URLs
- Verify your API key is valid
- Check if the workflow ID exists and is accessible

### Dependencies Missing

From the `run-test` directory:

```bash
npm install
```
