#!/bin/bash

# poll-workflow-status.sh
# Purpose: Monitor workflow task status via Server-Sent Events (SSE) to match GitHub action behavior
# Usage: ./poll.sh [--debug] [--timeout SECONDS] [--backend-url URL] <task_id>
# Example: ./poll.sh c0a93499-5bf1-45f1-a0d1-98f78509e3f8
# Example with debug: ./poll.sh --debug c0a93499-5bf1-45f1-a0d1-98f78509e3f8
#
# Use with test.sh to queue and monitor:
#   TASK_ID=$(./test.sh <workflow_id>)
#   ./poll.sh $TASK_ID

# Check if required tools are available
command -v curl >/dev/null 2>&1 || { echo "Error: curl is required but not installed. Aborting."; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "Error: jq is required but not installed. Aborting."; exit 1; }

# Function to display help message
show_help() {
    echo "Usage: $0 [OPTIONS] <task_id>"
    echo ""
    echo "Options:"
    echo "  --debug              Enable debug mode with verbose logging"
    echo "  --timeout SECONDS    Maximum time to wait for workflow completion (default: 3600)"
    echo "  --backend-url URL    Override backend base URL (default: https://backend.cognisim.io)"
    echo "  -h, --help           Show this help message"
    echo ""
    echo "Arguments:"
    echo "  task_id              The task ID returned from test.sh"
    echo ""
    echo "Environment variables:"
    echo "  REVYL_API_KEY        API key for Revyl (required)"
    exit 1
}

# Initialize variables
DEBUG_MODE=false
TIMEOUT_SECONDS=3600
BACKEND_BASE_URL=""
TASK_ID=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --debug)
            DEBUG_MODE=true
            shift
            ;;
        --timeout)
            TIMEOUT_SECONDS="$2"
            shift 2
            ;;
        --backend-url)
            BACKEND_BASE_URL="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            ;;
        *)
            TASK_ID="$1"
            shift
            ;;
    esac
done

# Debug function to log API calls and responses
debug_log() {
    if [ "$DEBUG_MODE" = true ]; then
        echo "[DEBUG] $1"
    fi
}

# Check if required environment variables are set
if [ -z "$REVYL_API_KEY" ]; then
    echo "Error: REVYL_API_KEY environment variable is not set." >&2
    show_help
fi

# Check if required parameters are provided
if [ -z "$TASK_ID" ]; then
    echo "Error: task_id parameter is required." >&2
    show_help
fi

# Validate timeout is a positive integer
if ! [[ "$TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]]; then
    echo "Error: timeout must be a positive integer." >&2
    exit 1
fi

# Log debug status
debug_log "Debug mode enabled"
debug_log "Task ID: $TASK_ID"
debug_log "Timeout: ${TIMEOUT_SECONDS}s"

# Constants
REVYL_BACKEND_HOST="${BACKEND_BASE_URL:-https://backend.cognisim.io}"
SSE_URL="${REVYL_BACKEND_HOST}/api/v1/monitor/stream/unified"
FINAL_RESULTS_URL="${REVYL_BACKEND_HOST}/api/v1/workflows/tasks/workflow_task?task_id=${TASK_ID}"

# Global state variables
FINAL_STATUS=""
CURL_PID=""
TIMEOUT_PID=""
PIPE_FILE=""
LAST_STATUS=""
LAST_PROGRESS_VALUE="0"

echo "🆔 Task ID: $TASK_ID"
echo "🔄 Starting real-time SSE monitoring..."

# Fetch final workflow results from API (called on completion/failure)
fetch_final_results() {
    local task_id="$1"
    local results_url="${REVYL_BACKEND_HOST}/api/v1/workflows/tasks/workflow_task?task_id=${task_id}"
    
    debug_log "Fetching final results from: $results_url"
    
    local temp_file=$(mktemp)
    local http_code=$(curl -s -o "$temp_file" -w "%{http_code}" "$results_url" \
        -H "Authorization: Bearer $REVYL_API_KEY" \
        -H "Content-Type: application/json" 2>/dev/null)
    
    if [ "$http_code" = "200" ]; then
        local response_data=$(cat "$temp_file")
        local task=$(echo "$response_data" | jq -r '.data // .')
        
        if [ "$task" != "null" ] && [ -n "$task" ]; then
            local total_tests=$(echo "$task" | jq -r '.total_tests // 0')
            local completed_tests=$(echo "$task" | jq -r '.completed_tests // 0')
            
            # Calculate passed/failed from tests array if available
            local passed_tests=0
            local failed_tests=0
            local tests_array=$(echo "$task" | jq -r '.tests // []')
            
            if [ "$tests_array" != "[]" ] && [ "$tests_array" != "null" ]; then
                passed_tests=$(echo "$tests_array" | jq '[.[] | select(.status == "passed" or .status == "success")] | length')
                failed_tests=$(echo "$tests_array" | jq '[.[] | select(.status == "failed" or .status == "error")] | length')
            fi
            
            debug_log "Final results: total=$total_tests, completed=$completed_tests, passed=$passed_tests, failed=$failed_tests"
        fi
    else
        debug_log "Could not fetch final results: HTTP $http_code"
    fi
    
    rm -f "$temp_file"
}

# Safely parse JSON from SSE event data
safe_parse_event_data() {
    local json_data="$1"
    local event_type="$2"
    
    if [ -z "$json_data" ]; then
        return 1
    fi
    
    # Validate JSON
    if ! echo "$json_data" | jq . >/dev/null 2>&1; then
        debug_log "Failed to parse $event_type event data: invalid JSON"
        debug_log "Malformed event data: ${json_data:0:200}"
        return 1
    fi
    
    echo "$json_data"
    return 0
}

# Handle connection errors from SSE stream
handle_sse_connection_error() {
    local error_line="$1"
    
    # Check for common curl errors
    if echo "$error_line" | grep -q "curl:"; then
        local error_msg=$(echo "$error_line" | sed 's/^curl: //')
        echo "SSE connection error: $error_msg" >&2
        FINAL_STATUS="error"
        return 0
    fi
    
    # Check for HTTP errors in stderr
    if echo "$error_line" | grep -qE "HTTP/[0-9]"; then
        local http_code=$(echo "$error_line" | grep -oE "HTTP/[0-9.]+ [0-9]{3}" | grep -oE "[0-9]{3}" | tail -1)
        if [ "$http_code" = "401" ] || [ "$http_code" = "403" ]; then
            echo "SSE connection error: Authentication failed (HTTP $http_code)" >&2
            echo "Troubleshooting: Verify REVYL_API_KEY is valid" >&2
        elif [ "$http_code" = "404" ]; then
            echo "SSE connection error: Endpoint not found (HTTP $http_code)" >&2
        else
            echo "SSE connection error: HTTP $http_code" >&2
        fi
        FINAL_STATUS="error"
        return 0
    fi
    
    return 1
}

# Event handler: connection_ready
handle_connection_ready() {
    local data="$1"
    local org_id=$(echo "$data" | jq -r '.org_id // ""')
    
    if [ -n "$org_id" ] && [ "$org_id" != "null" ]; then
        echo "🏢 Connected to organization: $org_id"
    fi
}

# Event handler: initial_state
handle_initial_state() {
    local data="$1"
    local running_workflows=$(echo "$data" | jq -r '.running_workflows // []')
    
    # Find our workflow in the array
    local our_workflow=$(echo "$running_workflows" | jq --arg task_id "$TASK_ID" \
        '[.[] | select(.task.task_id == $task_id)] | .[0]')
    
    if [ "$our_workflow" != "null" ] && [ -n "$our_workflow" ]; then
        local workflow_name=$(echo "$our_workflow" | jq -r '.workflow_name // ""')
        local task=$(echo "$our_workflow" | jq -r '.task // {}')
        local progress=$(echo "$our_workflow" | jq -r '.progress // 0')
        local status=$(echo "$task" | jq -r '.status // ""')
        local total_tests=$(echo "$task" | jq -r '.total_tests // 0')
        local completed_tests=$(echo "$task" | jq -r '.completed_tests // 0')
        
        echo "📊 Workflow: $workflow_name"
        # Handle null/empty progress values and ensure it's numeric
        if [ "$progress" = "null" ] || [ -z "$progress" ]; then
            progress=0
        fi
        # Calculate progress percentage using awk with proper error handling
        local progress_percent=$(echo "$progress" | awk '{if ($1 == "" || $1 == "null") $1 = 0; printf "%.1f", $1 * 100}')
        echo "📈 Progress: ${progress_percent}%"
        echo "🔄 Status: $status"
        
        if [ "$total_tests" -gt 0 ] 2>/dev/null; then
            echo "🧪 Tests: ${completed_tests}/${total_tests}"
        fi
    else
        echo "📡 Connected to unified stream - waiting for workflow (task: $TASK_ID) to start..."
    fi
}

# Event handler: workflow_started
handle_workflow_started() {
    local data="$1"
    local workflow=$(echo "$data" | jq -r '.workflow // {}')
    local task=$(echo "$workflow" | jq -r '.task // {}')
    local task_id=$(echo "$task" | jq -r '.task_id // ""')
    
    if [ "$task_id" = "$TASK_ID" ]; then
        local workflow_name=$(echo "$workflow" | jq -r '.workflow_name // ""')
        local status=$(echo "$task" | jq -r '.status // ""')
        local status_upper=$(echo "$status" | tr '[:lower:]' '[:upper:]')
        echo "🚀 Workflow started: $workflow_name"
        LAST_STATUS="$status"
    fi
}

# Event handler: workflow_updated
handle_workflow_updated() {
    local data="$1"
    local workflow=$(echo "$data" | jq -r '.workflow // {}')
    local task=$(echo "$workflow" | jq -r '.task // {}')
    local task_id=$(echo "$task" | jq -r '.task_id // ""')
    
    if [ "$task_id" = "$TASK_ID" ]; then
        local status=$(echo "$task" | jq -r '.status // ""')
        local progress=$(echo "$workflow" | jq -r '.progress // 0')
        local total_tests=$(echo "$task" | jq -r '.total_tests // 0')
        local completed_tests=$(echo "$task" | jq -r '.completed_tests // 0')
        
        # Handle null/empty progress values
        if [ "$progress" = "null" ] || [ -z "$progress" ]; then
            progress=0
        fi
        
        # Calculate progress percentage using awk with proper error handling
        local progress_percent=$(echo "$progress" | awk '{if ($1 == "" || $1 == "null") $1 = 0; printf "%.1f", $1 * 100}')
        local progress_msg=" | Progress: ${progress_percent}%"
        
        # Convert status to uppercase (compatible with older bash)
        local status_upper=$(echo "$status" | tr '[:lower:]' '[:upper:]')
        
        # Only display if status or progress changed
        if [ "$status" != "$LAST_STATUS" ] || [ "$(printf "%.1f" "$progress")" != "$(printf "%.1f" "${LAST_PROGRESS_VALUE:-0}")" ]; then
            echo "📊 Status: ${status_upper}${progress_msg}"
            
            if [ "$total_tests" -gt 0 ] 2>/dev/null; then
                echo "🧪 Tests: ${completed_tests}/${total_tests}"
            fi
            
            LAST_STATUS="$status"
            LAST_PROGRESS_VALUE="$progress"
        fi
    fi
}

# Event handler: workflow_completed
handle_workflow_completed() {
    local data="$1"
    local task_id=$(echo "$data" | jq -r '.task_id // ""')
    local workflow_name=$(echo "$data" | jq -r '.workflow_name // ""')
    
    if [ "$task_id" = "$TASK_ID" ]; then
        echo ""
        echo "✅ Workflow Completed Successfully: ${workflow_name:-$TASK_ID}"
        
        # Fetch final results
        fetch_final_results "$TASK_ID"
        
        echo "✅ Workflow completed successfully"
        echo "🆔 Task ID: $TASK_ID"
        
        FINAL_STATUS="completed"
        return 0
    fi
    return 1
}

# Event handler: workflow_failed
handle_workflow_failed() {
    local data="$1"
    local task_id=$(echo "$data" | jq -r '.task_id // ""')
    local workflow_name=$(echo "$data" | jq -r '.workflow_name // ""')
    
    if [ "$task_id" = "$TASK_ID" ]; then
        echo ""
        echo "❌ Workflow Failed: ${workflow_name:-$TASK_ID}"
        
        # Fetch final results
        fetch_final_results "$TASK_ID"
        
        echo "❌ Workflow failed"
        echo "🆔 Task ID: $TASK_ID"
        
        FINAL_STATUS="failed"
        return 0
    fi
    return 1
}

# Event handler: workflow_cancelled
handle_workflow_cancelled() {
    local data="$1"
    local task_id=$(echo "$data" | jq -r '.task_id // ""')
    local workflow_name=$(echo "$data" | jq -r '.workflow_name // ""')
    
    if [ "$task_id" = "$TASK_ID" ]; then
        echo "⚠️ Workflow cancelled: ${workflow_name:-$TASK_ID}"
        FINAL_STATUS="cancelled"
        return 0
    fi
    return 1
}

# Event handler: error
handle_error_event() {
    local data="$1"
    
    if [ -z "$data" ] || [ "$data" = "null" ]; then
        echo "SSE error event received (non-JSON) - likely a connection or authentication issue" >&2
        echo "Troubleshooting: Verify REVYL_API_KEY is valid and backend service is healthy" >&2
        FINAL_STATUS="error"
        return 0
    fi
    
    local error_msg=$(echo "$data" | jq -r '.error // .message // "Unknown SSE error"')
    echo "SSE error event: $error_msg" >&2
    FINAL_STATUS="error"
    return 0
}

# Parse SSE stream and handle events
parse_sse_stream() {
    local current_event=""
    local current_data=""
    local in_data=false
    
    while IFS= read -r line || [ -n "$line" ]; do
        # Handle empty line or EOF
        if [ -z "$line" ]; then
            if [ -n "$current_event" ]; then
                # Process complete event
                case "$current_event" in
                    connection_ready)
                        local parsed_data=$(safe_parse_event_data "$current_data" "connection_ready")
                        [ -n "$parsed_data" ] && handle_connection_ready "$parsed_data"
                        ;;
                    initial_state)
                        local parsed_data=$(safe_parse_event_data "$current_data" "initial_state")
                        [ -n "$parsed_data" ] && handle_initial_state "$parsed_data"
                        ;;
                    workflow_started)
                        local parsed_data=$(safe_parse_event_data "$current_data" "workflow_started")
                        [ -n "$parsed_data" ] && handle_workflow_started "$parsed_data"
                        ;;
                    workflow_updated)
                        local parsed_data=$(safe_parse_event_data "$current_data" "workflow_updated")
                        [ -n "$parsed_data" ] && handle_workflow_updated "$parsed_data"
                        ;;
                    workflow_completed)
                        local parsed_data=$(safe_parse_event_data "$current_data" "workflow_completed")
                        if [ -n "$parsed_data" ]; then
                            handle_workflow_completed "$parsed_data" && break
                        fi
                        ;;
                    workflow_failed)
                        local parsed_data=$(safe_parse_event_data "$current_data" "workflow_failed")
                        if [ -n "$parsed_data" ]; then
                            handle_workflow_failed "$parsed_data" && break
                        fi
                        ;;
                    workflow_cancelled)
                        local parsed_data=$(safe_parse_event_data "$current_data" "workflow_cancelled")
                        if [ -n "$parsed_data" ]; then
                            handle_workflow_cancelled "$parsed_data" && break
                        fi
                        ;;
                    heartbeat)
                        # No action needed
                        ;;
                    error)
                        local parsed_data=$(safe_parse_event_data "$current_data" "error" 2>/dev/null || echo "")
                        handle_error_event "$parsed_data" && break
                        ;;
                esac
                
                # Reset for next event
                current_event=""
                current_data=""
                in_data=false
            fi
            continue
        fi
        
        # Parse event type
        if [[ "$line" =~ ^event:[[:space:]]*(.+)$ ]]; then
            current_event="${BASH_REMATCH[1]}"
            debug_log "Received SSE event: $current_event"
            continue
        fi
        
        # Check for curl errors (usually appear before event: lines)
        if echo "$line" | grep -qE "^(curl:|HTTP/|Could not resolve|Failed to connect)"; then
            handle_sse_connection_error "$line" && break
            continue
        fi
        
        # Parse data (may span multiple lines)
        if [[ "$line" =~ ^data:[[:space:]]*(.+)$ ]]; then
            if [ "$in_data" = true ]; then
                # Append to existing data (multi-line JSON)
                current_data="${current_data}${BASH_REMATCH[1]}"
            else
                current_data="${BASH_REMATCH[1]}"
                in_data=true
            fi
            continue
        fi
        
        # Handle continuation lines (for multi-line JSON in data)
        if [ "$in_data" = true ] && [ -n "$current_data" ]; then
            current_data="${current_data}${line}"
        fi
        
        # Break if we have a final status
        if [ -n "$FINAL_STATUS" ]; then
            break
        fi
        
    done < "${1:-/dev/stdin}"
}

# Cleanup function
cleanup() {
    if [ -n "$CURL_PID" ]; then
        kill "$CURL_PID" 2>/dev/null
        wait "$CURL_PID" 2>/dev/null
    fi
    if [ -n "$TIMEOUT_PID" ]; then
        kill "$TIMEOUT_PID" 2>/dev/null
    fi
    if [ -n "$PIPE_FILE" ] && [ -e "$PIPE_FILE" ]; then
        rm -f "$PIPE_FILE"
    fi
}

# Set up trap for cleanup
trap cleanup EXIT INT TERM

# Start SSE connection
START_TIME=$(date +%s)

# Connect to SSE stream and parse events
debug_log "SSE URL: $SSE_URL"
echo "🔗 SSE connection established - monitoring workflow execution in real-time"

# Create named pipe for SSE stream
PIPE_FILE=$(mktemp -u)
mkfifo "$PIPE_FILE"

# Start curl in background, writing to pipe
curl --no-buffer -s "$SSE_URL" \
    -H "Authorization: Bearer $REVYL_API_KEY" \
    -H "Accept: text/event-stream" \
    2>&1 > "$PIPE_FILE" &
CURL_PID=$!

# Give curl a moment to establish connection
sleep 1

# Check if curl process is still running (connection successful)
if ! kill -0 "$CURL_PID" 2>/dev/null; then
    rm -f "$PIPE_FILE"
    echo "SSE connection failed - could not establish connection to $SSE_URL" >&2
    echo "Troubleshooting: Verify REVYL_API_KEY is valid and backend service is healthy" >&2
    exit 1
fi

# Set up timeout
(
    sleep "$TIMEOUT_SECONDS"
    if [ -z "$FINAL_STATUS" ]; then
        kill "$CURL_PID" 2>/dev/null
        echo "" > "$PIPE_FILE"  # Signal parser to exit
    fi
) &
TIMEOUT_PID=$!

# Parse SSE stream from pipe
parse_sse_stream "$PIPE_FILE"

# Cleanup pipe
rm -f "$PIPE_FILE"
PIPE_FILE=""

# Wait for curl to finish
wait "$CURL_PID" 2>/dev/null
CURL_EXIT_CODE=$?

# Kill timeout process if curl exited
kill "$TIMEOUT_PID" 2>/dev/null 2>/dev/null

# Handle exit
if [ -z "$FINAL_STATUS" ]; then
    # Check if curl exited with an error
    if [ "$CURL_EXIT_CODE" != "0" ]; then
        echo "SSE connection failed" >&2
        echo "Troubleshooting: Verify REVYL_API_KEY is valid and backend service is healthy" >&2
        exit 1
    else
        echo "⏱️  Timeout of ${TIMEOUT_SECONDS}s reached while waiting for workflow to finish" >&2
        exit 1
    fi
fi

# Exit with appropriate code based on final status
case "$FINAL_STATUS" in
    completed)
        exit 0
        ;;
    failed|cancelled|error)
        exit 1
        ;;
    *)
        exit 1
        ;;
esac
