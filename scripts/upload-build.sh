#!/bin/bash

# Revyl Local Build Upload Script
# 
# Simple wrapper around the Node.js upload script for easier use
# 
# Usage:
#   ./upload-build.sh ios your-build-var-id 1.0.0
#   ./upload-build.sh android your-build-var-id 1.0.0

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_SCRIPT="$SCRIPT_DIR/upload-local-build.js"

# Function to print colored output
log() {
    local level=$1
    local message=$2
    case $level in
        "error")
            echo -e "${RED}❌ $message${NC}" >&2
            ;;
        "success")
            echo -e "${GREEN}✅ $message${NC}"
            ;;
        "warning")
            echo -e "${YELLOW}⚠️  $message${NC}"
            ;;
        "info")
            echo -e "${BLUE}📝 $message${NC}"
            ;;
    esac
}

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    log "error" "Node.js is not installed. Please install Node.js to use this script."
    exit 1
fi

# Check if the Node.js script exists
if [ ! -f "$NODE_SCRIPT" ]; then
    log "error" "Upload script not found at: $NODE_SCRIPT"
    exit 1
fi

# Show help if no arguments provided
if [ $# -eq 0 ]; then
    echo ""
    log "info" "Revyl Local Build Upload Script"
    echo ""
    echo "Usage:"
    echo "  $0 <platform> <build-var-id> <version> [profile] [additional-args...]"
    echo ""
    echo "Arguments:"
    echo "  platform       ios or android"
    echo "  build-var-id   Your Revyl build variable ID"
    echo "  version        Version string for this build"
    echo "  profile        EAS build profile (optional, default: e2e-test)"
    echo ""
    echo "Environment Variables:"
    echo "  REVYL_API_KEY  Your Revyl API key (required)"
    echo ""
    echo "Examples:"
    echo "  $0 ios abc-123-def 1.0.0"
    echo "  $0 android abc-123-def 1.0.0 production"
    echo "  $0 ios abc-123-def 1.0.0 e2e-test --metadata '{\"env\":\"staging\"}'"
    echo ""
    echo "Get your API key from: https://auth.revyl.ai/account/api_keys"
    echo ""
    exit 0
fi

# Parse arguments
PLATFORM=$1
BUILD_VAR_ID=$2
VERSION=$3
PROFILE=${4:-e2e-test}
shift 3  # Remove first 3 arguments
if [ $# -gt 0 ]; then
    shift 1  # Remove profile if provided
fi

# Validate required arguments
if [ -z "$PLATFORM" ] || [ -z "$BUILD_VAR_ID" ] || [ -z "$VERSION" ]; then
    log "error" "Missing required arguments. Run '$0' with no arguments for help."
    exit 1
fi

if [ "$PLATFORM" != "ios" ] && [ "$PLATFORM" != "android" ]; then
    log "error" "Platform must be 'ios' or 'android'"
    exit 1
fi

# Check for API key
if [ -z "$REVYL_API_KEY" ]; then
    log "error" "REVYL_API_KEY environment variable is not set."
    log "info" "Get your API key from: https://auth.revyl.ai/account/api_keys"
    log "info" "Then run: export REVYL_API_KEY=your-api-key-here"
    exit 1
fi

# Build the command
CMD_ARGS=(
    "--platform" "$PLATFORM"
    "--build-var-id" "$BUILD_VAR_ID"
    "--version" "$VERSION"
    "--profile" "$PROFILE"
)

# Add any additional arguments passed to the script
CMD_ARGS+=("$@")

log "info" "Starting Revyl build upload..."
log "info" "Platform: $PLATFORM"
log "info" "Build Variable ID: $BUILD_VAR_ID"
log "info" "Version: $VERSION"
log "info" "Profile: $PROFILE"

# Run the Node.js script
if node "$NODE_SCRIPT" "${CMD_ARGS[@]}"; then
    log "success" "Build uploaded successfully!"
else
    log "error" "Build upload failed!"
    exit 1
fi

