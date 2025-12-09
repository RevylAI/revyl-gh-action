#!/bin/bash

# queue-workflow.sh
# Purpose: Queue a workflow on Revyl and return the task ID
# Usage: ./test.sh [--debug] [--device-url URL] <workflow_id>
# Example: ./test.sh 616ef7ae-eeae-4628-8db8-0fccea3df7c9
# Example with debug: ./test.sh --debug 616ef7ae-eeae-4628-8db8-0fccea3df7c9
# 
# After queuing, use poll.sh to poll for completion:
#   TASK_ID=$(./test.sh <workflow_id>)
#   ./poll.sh $TASK_ID

# Check if required tools are available
command -v curl >/dev/null 2>&1 || { echo "Error: curl is required but not installed. Aborting."; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "Error: jq is required but not installed. Aborting."; exit 1; }

# Function to display help message
show_help() {
    echo "Usage: $0 [OPTIONS] <workflow_id>"
    echo ""
    echo "Options:"
    echo "  --debug              Enable debug mode with verbose logging"
    echo "  --device-url URL     Override device base URL (default: https://device.revyl.ai)"
    echo "  -h, --help           Show this help message"
    echo ""
    echo "Arguments:"
    echo "  workflow_id          The ID of the workflow to queue"
    echo ""
    echo "Output:"
    echo "  Prints the task ID to stdout. Use this with poll.sh to check status."
    echo ""
    echo "Environment variables:"
    echo "  REVYL_API_KEY        API key for Revyl (required)"
    exit 1
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --debug)
            DEBUG_MODE=true
            shift
            ;;
        --device-url)
            DEVICE_BASE_URL="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            ;;
        *)
            WORKFLOW_ID="$1"
            shift
            ;;
    esac
done

# Debug function to log API calls and responses
# Output to stderr so it doesn't interfere with stdout (task ID output)
debug_log() {
    if [ "$DEBUG_MODE" = true ]; then
        echo "[DEBUG] $1" >&2
    fi
}

# Check if required environment variables are set
if [ -z "$REVYL_API_KEY" ]; then
    echo "Error: REVYL_API_KEY environment variable is not set." >&2
    show_help
fi

# Check if required parameters are provided
if [ -z "$WORKFLOW_ID" ]; then
    echo "Error: workflow_id parameter is required." >&2
    show_help
fi

# Log debug status
debug_log "Debug mode enabled"
debug_log "Workflow ID: $WORKFLOW_ID"

# Constants
REVYL_EXECUTE_API_HOST="${DEVICE_BASE_URL:-https://device.revyl.ai}"

# Execute the workflow asynchronously
debug_log "Executing workflow ID: $WORKFLOW_ID"

# Prepare the API request for execution
EXECUTE_API_URL="${REVYL_EXECUTE_API_HOST}/api/execute_workflow_id_async"
EXECUTE_API_DATA="{\"workflow_id\": \"$WORKFLOW_ID\"}"

debug_log "Making API call to: $EXECUTE_API_URL"
debug_log "Request data: $EXECUTE_API_DATA"

# Execute the workflow with curl
if [ "$DEBUG_MODE" = true ]; then
    # Use verbose mode for curl in debug mode
    EXECUTE_RESPONSE=$(curl -v -X POST "$EXECUTE_API_URL" \
        -H "Authorization: Bearer $REVYL_API_KEY" \
        -H "Content-Type: application/json" \
        -d "$EXECUTE_API_DATA" 2>&1)
else
    # Normal execution
    EXECUTE_RESPONSE=$(curl -s -X POST "$EXECUTE_API_URL" \
        -H "Authorization: Bearer $REVYL_API_KEY" \
        -H "Content-Type: application/json" \
        -d "$EXECUTE_API_DATA")
fi

debug_log "Execute response: $EXECUTE_RESPONSE"

# Extract the response data (handle both debug and non-debug modes)
if [ "$DEBUG_MODE" = true ]; then
    # Extract JSON from verbose curl output (takes the last line that looks like JSON)
    RESPONSE_DATA=$(echo "$EXECUTE_RESPONSE" | grep -o '{.*}' | tail -1)
else
    RESPONSE_DATA="$EXECUTE_RESPONSE"
fi

# Check if the execute request was successful
if echo "$RESPONSE_DATA" | grep -q "error"; then
    echo "Error executing workflow: $(echo $RESPONSE_DATA | jq -r '.error // .detail // .')" >&2
    exit 1
fi

# Extract the task ID
TASK_ID=$(echo "$RESPONSE_DATA" | jq -r '.task_id')

if [ "$TASK_ID" == "null" ] || [ -z "$TASK_ID" ]; then
    echo "Error: Failed to get a valid task ID." >&2
    echo "Full response: $RESPONSE_DATA" >&2
    exit 1
fi

# Output only the task ID to stdout (for use with poll.sh)
echo "$TASK_ID"
exit 0 