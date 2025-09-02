# Revyl Local Build Scripts

These scripts allow you to build and upload your Expo apps to Revyl locally,
without needing GitHub Actions.

Perfect for developers who want to:

- Test builds locally before CI/CD
- Upload builds from their development machine
- Debug build issues outside of CI/CD

## Quick Start

### 1. Set up your API key

```bash
export REVYL_API_KEY=your-api-key-here
```

Get your API key from: https://auth.revyl.ai/account/api_keys

### 2. Build and upload

```bash
# iOS build
./scripts/upload-build.sh ios your-build-var-id 1.0.0

# Android build
./scripts/upload-build.sh android your-build-var-id 1.0.0
```

That's it! The script will:

1. Build your app locally with EAS
2. Find the build output automatically
3. Upload it to Revyl with metadata

## Available Scripts

### `upload-build.sh` (Recommended)

Simple shell wrapper for easy use.

**Usage:**

```bash
./scripts/upload-build.sh <platform> <build-var-id> <version> [profile] [additional-args...]
```

**Examples:**

```bash
# Basic usage
./scripts/upload-build.sh ios abc-123-def 1.0.0

# With custom EAS profile
./scripts/upload-build.sh android abc-123-def 1.0.0 production

# With additional metadata
./scripts/upload-build.sh ios abc-123-def 1.0.0 e2e-test --metadata '{"env":"staging"}'

# Upload existing build file (skip building)
./scripts/upload-build.sh ios abc-123-def 1.0.0 e2e-test --file-path ./MyApp.app
```

### `upload-local-build.js` (Advanced)

Full-featured Node.js script with all options.

**Usage:**

```bash
node scripts/upload-local-build.js --platform <ios|android> --build-var-id <id> --version <version> [options]
```

**All Options:**

- `--platform <ios|android>` - Platform to build for (required)
- `--build-var-id <id>` - Your Revyl build variable ID (required)
- `--version <version>` - Version string for this build (required)
- `--file-path <path>` - Path to existing build file (skips building)
- `--profile <profile>` - EAS build profile to use (default: e2e-test)
- `--package-name <name>` - Package name/identifier
- `--metadata <json>` - Additional metadata as JSON string
- `--json` - Output results in JSON format

## How It Works

### 1. Building Phase

- Runs your existing EAS build command:
  `eas build --platform <platform> --profile <profile> --local`
- Uses the same profiles you've already configured in `eas.json`
- Works with any EAS build configuration

### 2. Detection Phase

- Automatically finds your build output:
  - **iOS**: Looks for `.app` or `.ipa` files
  - **Android**: Looks for `.apk` files
- Searches common build output locations
- Uses the most recently created file

### 3. Upload Phase

- Uploads directly to Revyl using the same API as GitHub Actions
- Extracts package ID automatically (bundle identifier for iOS, package name for
  Android)
- Adds local build metadata including git info if available

## Metadata Automatically Added

The script automatically adds useful metadata to every build:

```json
{
  "ci_system": "local-script",
  "build_time": "2024-01-15T10:30:00.000Z",
  "platform": "ios",
  "local_build": true,
  "commit_sha": "abc123def456",
  "branch": "feature/new-ui",
  "git_repo": "https://github.com/user/repo.git"
}
```

## Requirements

- **Node.js** (any recent version)
- **EAS CLI** installed and configured
- **Revyl API key** set as environment variable
- **Expo project** with `eas.json` configured

## Troubleshooting

### "Missing REVYL_API_KEY"

Set your API key:

```bash
export REVYL_API_KEY=your-api-key-here
```

### "Build failed"

- Check your EAS configuration in `eas.json`
- Make sure you have EAS CLI installed: `npm install -g @expo/eas-cli`
- Verify your build profile exists and is configured correctly

### "Could not find build output"

- Check that your EAS build completed successfully
- Use `--file-path` to specify the build location manually
- Make sure you're in the root of your Expo project

### "Build variable not found"

- Verify your build variable ID in the Revyl dashboard
- Make sure the build variable exists and you have access to it

## Integration with Existing Workflow

This script is designed to work alongside your existing development workflow:

### With package.json scripts

```json
{
  "scripts": {
    "upload:ios": "./scripts/upload-build.sh ios your-build-var-id",
    "upload:android": "./scripts/upload-build.sh android your-build-var-id"
  }
}
```

### With your existing EAS profiles

The script uses your existing `eas.json` profiles, so it works with whatever
configuration you already have:

```json
{
  "build": {
    "e2e-test": {
      "ios": { "simulator": true },
      "android": { "buildType": "apk" }
    },
    "staging": {
      "ios": { "simulator": false },
      "android": { "buildType": "apk" }
    }
  }
}
```

## Advanced Usage

### Custom Metadata

Add custom metadata to track additional information:

```bash
./scripts/upload-build.sh ios abc-123 1.0.0 e2e-test --metadata '{
  "developer": "john",
  "environment": "staging",
  "feature_flags": ["new_ui", "beta_feature"]
}'
```

### Programmatic Use

Use the `--json` flag for integration with other tools:

```bash
RESULT=$(node scripts/upload-local-build.js --platform ios --build-var-id abc-123 --version 1.0.0 --json)
VERSION_ID=$(echo $RESULT | jq -r '.versionId')
echo "Uploaded with version ID: $VERSION_ID"
```

### CI/CD Integration

You can also use these scripts in CI/CD environments as an alternative to the
GitHub Action:

```yaml
- name: Build and Upload
  run: |
    export REVYL_API_KEY=${{ secrets.REVYL_API_KEY }}
    ./scripts/upload-build.sh ios ${{ env.BUILD_VAR_ID }} ${{ github.sha }}
```

This gives you maximum flexibility - use GitHub Actions for automated builds,
and local scripts for development and testing.
