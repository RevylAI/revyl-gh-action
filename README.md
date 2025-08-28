# Revyl GitHub Actions

<div align="center">
  <img src="https://docs.revyl.ai/logo/revyl-logo-dark.svg" alt="Revyl Logo" width="300">
  <br><br>
  <p><strong>Professional CI/CD integration for mobile testing automation</strong></p>
</div>

---

Powerful GitHub Actions for seamless CI/CD integration with the Revyl mobile testing platform. Build, upload, and test your mobile apps with real-time monitoring and comprehensive reporting.

## Quick Start

1. **Get your API key** from the [Revyl settings page](https://auth.revyl.ai/account/api_keys)
2. **Add it as a secret** named `REVYL_API_KEY` in your GitHub repository
3. **Use in your workflows** - see examples below

## Available Actions

### Run Test Action (`actions/run-test`)

Execute Revyl tests or workflows with real-time SSE monitoring, automatic retries, and shareable report generation.

**Key Features:**
- Real-time test execution monitoring via Server-Sent Events
- Automatic build version integration for build-to-test pipelines
- Rich GitHub Actions logging with progress tracking
- Shareable report links with authentication
- Support for both individual tests and multi-test workflows

### Upload Build Action (`actions/upload-build`)

Upload mobile app builds (APK, ZIP, .app) with automatic CI/CD metadata injection and multi-source support.

**Key Features:**
- Direct file uploads (APK, ZIP, .app)
- Expo URL ingestion with custom headers
- **Automatic CI/CD metadata injection** - no manual configuration needed
- Package ID auto-extraction
- Secure artifact storage

## Build-to-Test Pipeline

The most powerful way to use Revyl Actions - automatically test your freshly built apps:

```yaml
name: Build and Test Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Your build steps here (React Native, Expo, Flutter, etc.)
      # See: https://docs.revyl.ai/platform/mobileguides

      - name: Upload Build to Revyl
        id: upload-build
        uses: RevylAI/revyl-gh-action/actions/upload-build@main
        with:
          build-var-id: ${{ env.BUILD_VAR_ID }}
          version: ${{ github.sha }}
          file-path: path/to/your/app.apk
        env:
          REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}

      - name: Run Tests on New Build
        uses: RevylAI/revyl-gh-action/actions/run-test@main
        with:
          test-id: ${{ env.TEST_ID }}
          build-version-id: ${{ steps.upload-build.outputs.version-id }}
        env:
          REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
```

## Standalone Usage

### Upload Build Only

```yaml
- name: Upload Build
  uses: RevylAI/revyl-gh-action/actions/upload-build@main
  with:
    build-var-id: 'your-build-variable-id'
    version: '1.0.0'
    file-path: './dist/app.apk'
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}

# For Expo builds
- name: Upload Expo Build
  uses: RevylAI/revyl-gh-action/actions/upload-build@main
  with:
    build-var-id: 'your-build-variable-id'
    version: '1.0.0'
    expo-url: 'https://expo.dev/artifacts/eas/...'
    expo-headers: '{"Authorization": "Bearer ${{ secrets.EXPO_TOKEN }}"}'
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
```

### Run Test Only

```yaml
- name: Run Revyl Test
  uses: RevylAI/revyl-gh-action/actions/run-test@main
  with:
    test-id: 'your-test-id'
    timeout: 1800 # 30 minutes
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
```

## Automatic CI/CD Metadata

The upload-build action automatically injects CI/CD metadata into every build - no configuration required.

**Auto-injected metadata includes:**
- `ci_run_url`: Direct link to the GitHub Actions run
- `commit_sha`: Git commit SHA that triggered the build
- `branch`: Branch name where the build was triggered
- `pr_number`: Pull request number (for PR builds)
- `ci_system`: 'github-actions'
- `ci_build_number`: GitHub run number
- `ci_build_attempt`: GitHub run attempt number

This provides excellent traceability without any manual setup.

## Action Outputs

Both actions provide comprehensive outputs for integration with other workflow steps:

### Upload Build Outputs

- `success`: Whether upload was successful
- `version-id`: **ID of the created build version** (use this for build-to-test)
- `version`: Version string of the uploaded build
- `package-id`: Extracted package ID from the build
- `upload-time`: Time taken for upload in seconds

### Run Test Outputs

- `success`: Whether test completed successfully
- `task_id`: Unique task ID for the execution
- `execution_time`: Total execution time
- `platform`: Platform the test ran on
- `report_link`: **Shareable link to detailed test report**
- `total_steps`: Total number of test steps
- `completed_steps`: Number of completed steps
- `error_message`: Error message if execution failed

## Documentation

For comprehensive documentation including framework-specific build guides:

- **[Complete Documentation](https://docs.revyl.ai/ci-recipes/github-actions)**
- **[Mobile Build Guides](https://docs.revyl.ai/platform/mobileguides)** - React Native, Expo, Flutter, etc.
- [Run Test Action README](./actions/run-test/README.md)
- [Upload Build Action README](./actions/upload-build/README.md)

## Development

Each action is self-contained with its own dependencies and build process:

```bash
cd actions/[action-name]
npm install
npm test
npm run package
```

## Framework Support

Works with any mobile framework that can produce APK/ZIP/.app files:

- React Native
- Expo
- Flutter
- Native iOS/Android
- Cordova/PhoneGap
- Ionic

See our [mobile build guides](https://docs.revyl.ai/platform/mobileguides) for framework-specific setup instructions.

## Why Choose Revyl Actions?

**Real-time monitoring** - Watch your tests execute live with SSE  
**Zero-config metadata** - Automatic CI/CD traceability  
**Build-to-test pipelines** - Test the exact build you just created  
**Rich reporting** - Shareable authenticated report links  
**Multi-framework support** - Works with any mobile build system  
**Enterprise ready** - Robust error handling and retry logic

Ready to supercharge your mobile CI/CD? Get started with the examples above.