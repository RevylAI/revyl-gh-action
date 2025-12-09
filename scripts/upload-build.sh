#!/bin/bash

# Revyl Build Upload Script
#
# Simple script to upload builds to Revyl using curl.
#
# Usage:
#   ./upload-build.sh <build-var-id> <file-path> [version]
#
# Environment:
#   REVYL_API_KEY - Your Revyl API key (required)

set -e

BACKEND_URL="${REVYL_BACKEND_URL:-https://backend.revyl.ai}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# Show help
if [ $# -lt 2 ]; then
    echo ""
    echo -e "${BLUE}Revyl Build Upload Script${NC}"
    echo ""
    echo "Usage:"
    echo "  $0 <build-var-id> <file-path> [version]"
    echo ""
    echo "Arguments:"
    echo "  build-var-id   Your Revyl build variable ID"
    echo "  file-path      Path to build file (.apk, .zip, .ipa)"
    echo "  version        Version string (optional, defaults to timestamp)"
    echo ""
    echo "Environment:"
    echo "  REVYL_API_KEY       Your Revyl API key (required)"
    echo "  REVYL_BACKEND_URL   Backend URL (default: https://backend.revyl.ai)"
    echo ""
    echo "Examples:"
    echo "  $0 abc-123-def ./app.apk 1.0.0"
    echo "  $0 abc-123-def ./MyApp.zip"
    echo ""
    echo "Get API key: https://auth.revyl.ai/account/api_keys"
    echo ""
    exit 0
fi

BUILD_VAR_ID="$1"
FILE_PATH="$2"
VERSION="${3:-build-$(date +%s)}"

# Validate
if [ -z "$REVYL_API_KEY" ]; then
    echo -e "${RED}❌ REVYL_API_KEY environment variable is required${NC}"
    exit 1
fi

if [ ! -f "$FILE_PATH" ]; then
    echo -e "${RED}❌ File not found: $FILE_PATH${NC}"
    exit 1
fi

FILE_NAME=$(basename "$FILE_PATH")
FILE_SIZE=$(ls -lh "$FILE_PATH" | awk '{print $5}')

echo ""
echo -e "📦 Uploading ${BLUE}$FILE_NAME${NC} ($FILE_SIZE)"
echo "   Version: $VERSION"
echo "   Build Var: $BUILD_VAR_ID"
echo ""

# Upload using stream-upload endpoint
RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "${BACKEND_URL}/api/v1/builds/vars/${BUILD_VAR_ID}/versions/stream-upload?version=${VERSION}" \
    -H "Authorization: Bearer ${REVYL_API_KEY}" \
    -F "file=@${FILE_PATH}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    VERSION_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    PACKAGE_NAME=$(echo "$BODY" | grep -o '"package_name":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    echo -e "${GREEN}✅ Upload successful!${NC}"
    echo ""
    echo "   Version ID: $VERSION_ID"
    echo "   Version: $VERSION"
    if [ -n "$PACKAGE_NAME" ] && [ "$PACKAGE_NAME" != "null" ]; then
        echo "   Package: $PACKAGE_NAME"
    fi
    echo ""
else
    echo -e "${RED}❌ Upload failed (HTTP $HTTP_CODE)${NC}"
    echo "$BODY"
    exit 1
fi
