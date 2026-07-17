# Revyl GitHub Actions

<div align="center">
  <img src="revyl-block-graphic.png" alt="Revyl Logo" width="400">
  <br><br>
  <p><strong>Revyl's CI/CD integration for mobile testing automation</strong></p>
</div>

---

Powerful GitHub Actions for seamless CI/CD integration with the Revyl mobile
testing platform. Build, upload, and test your mobile apps with real-time
monitoring and comprehensive reporting.

## Quick Start

1. **Get your API key** from the
   [Revyl settings page](https://auth.revyl.ai/account/api_keys)
2. **Add it as a secret** named `REVYL_API_KEY` in your GitHub repository
3. **Copy a workflow** from our [examples folder](./examples/) that matches your
   framework
4. **Update the configuration** (app ID, test ID, file paths)
5. **Push and watch it work!** 🚀

**🎯 New to Revyl Actions?** Start with our
[complete examples](./examples/README.md) - they include everything you need.

## Upload via curl

The simplest way to upload a build to Revyl:

```bash
# Android APK
curl -X POST "https://backend.revyl.ai/api/v1/apps/{APP_ID}/builds/stream-upload?version={VERSION}" \
  -H "Authorization: Bearer $REVYL_API_KEY" \
  -F "file=@./app.apk"

# iOS App (zip)
curl -X POST "https://backend.revyl.ai/api/v1/apps/{APP_ID}/builds/stream-upload?version={VERSION}" \
  -H "Authorization: Bearer $REVYL_API_KEY" \
  -F "file=@./MyApp.zip"
```

**Parameters:**

- `APP_ID` - Your Revyl app ID (from the app's Builds page)
- `VERSION` - Version string (e.g., `1.0.0`, `build-123`)
- `REVYL_API_KEY` - Your API key

**Response:**

```json
{
  "id": "abc-123",
  "version": "1.0.0",
  "package_name": "com.example.app",
  "artifact_url": "...",
  "metadata": {
    "package_id": "com.example.app",
    "artifact_bytes": 12345678,
    "artifact_sha256": "..."
  }
}
```

### Helper Scripts

We also provide helper scripts in `./scripts/`:

```bash
# Bash script
./scripts/upload-build.sh <app-id> <file-path> [version]

# Node.js script
node scripts/upload-local-build.js --app-id <id> --file <path> --version <ver>
```

## Available Actions

### Run Test Action (`run-test`)

Execute Revyl tests or workflows with real-time SSE monitoring, automatic
retries, and shareable report generation.

**Key Features:**

- Real-time test execution monitoring via Server-Sent Events
- Automatic build version integration for build-to-test pipelines
- Rich GitHub Actions logging with progress tracking
- Shareable report links with authentication
- Support for both individual tests and multi-test workflows

**Input Parameters:**

| Parameter          | Required | Description                                                      | Default |
| ------------------ | -------- | ---------------------------------------------------------------- | ------- |
| `test-id`          | No\*     | The ID of the test to run                                        | -       |
| `workflow-id`      | No\*     | The ID of the workflow to run (preferred)                        | -       |
| `workflow_id`      | No       | Deprecated alias for `workflow-id`                               | -       |
| `build-id`         | No       | ID of a specific build to use                                     | -       |
| `build-version-id` | No       | Deprecated alias for `build-id`                                   | -       |
| `retries`          | No       | Number of retries if test fails                                  | -       |
| `timeout`          | No       | Timeout in seconds for the test execution                        | `3600`  |
| `cli-version`      | No       | Revyl CLI version used by the action runtime                     | `latest` |

\* Either `test-id` or `workflow-id` (preferred) must be provided. `workflow_id` is accepted as a deprecated alias.

### Run Workflow Action (`run-workflow`)

Clean, dedicated entrypoint for executing a Revyl workflow by `workflow-id`.
This is a thin wrapper around the core runner with workflow-focused
inputs/outputs.
For backward compatibility, `workflow_id` is accepted as a deprecated alias.

```yaml
# Same-repo usage
- name: Run Revyl Workflow
  uses: ./run-workflow
  with:
    workflow-id: 'your-workflow-id'
    timeout: '3600'
    backend-url: 'https://backend-staging.revyl.ai'
    cli-version: 'v0.1.5'
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}

# Cross-repo usage
- name: Run Revyl Workflow
  uses: RevylAI/revyl-gh-action/run-workflow@main
  with:
    workflow-id: 'your-workflow-id'
    timeout: '3600'
    cli-version: 'v0.1.5'
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
```

### Upload Build Action (`upload-build`)

Upload mobile app builds (APK, ZIP, .app) with automatic CI/CD metadata
injection and multi-source support.

**Key Features:**

- Direct file uploads (APK, ZIP, .app)
- Expo URL ingestion with custom headers
- **Automatic CI/CD metadata injection** - no manual configuration needed
- **Automatic TAR to ZIP conversion** for iOS builds
- Package ID auto-extraction
- Secure artifact storage

**Input Parameters:**

| Parameter      | Required | Description                                              | Example                               |
| -------------- | -------- | -------------------------------------------------------- | ------------------------------------- |
| `app-id`       | Yes      | The Revyl app ID to upload to                            | `abc-123-def`                         |
| `build-var-id` | No       | Deprecated alias for `app-id`                            | `abc-123-def`                         |
| `version`      | Yes      | Version string for this build (must be unique)           | `1.0.0` or `${{ github.sha }}`        |
| `file-path`    | No\*     | Path to the build file (APK/ZIP/.app)                    | `./dist/app.apk`                      |
| `expo-url`     | No\*     | Expo build URL to download from                          | `https://expo.dev/artifacts/...`      |
| `expo-headers` | No       | JSON headers for Expo URL download                       | `'{"Authorization": "Bearer token"}'` |
| `package-name` | No       | Package name/identifier (auto-extracted if not provided) | `com.example.app`                     |
| `timeout`      | No       | Upload timeout in seconds                                | `1800` (30 min)                       |

\* Either `file-path` or `expo-url` must be provided (but not both)

### Environment Variables

| Variable        | Required        | Description                                                                      |
| --------------- | --------------- | -------------------------------------------------------------------------------- |
| `REVYL_API_KEY` | Yes             | Your Revyl API key (get from [settings](https://auth.revyl.ai/account/api_keys)) |
| `EXPO_TOKEN`    | For Expo builds | Your Expo access token (required when using `expo-url`)                          |

## Setting Up for Expo Builds

When using Expo/EAS builds, you'll need:

1. **Add EXPO_TOKEN to GitHub Secrets:**

   - Get your token from
     [Expo Access Tokens](https://expo.dev/accounts/[your-username]/settings/access-tokens)
   - Add as `EXPO_TOKEN` in your repository secrets

2. **Use in your workflow:**

```yaml
- name: Build with EAS
  run: eas build --platform ios --profile production --non-interactive --wait
  env:
    EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}

- name: Upload to Revyl
  uses: RevylAI/revyl-gh-action/upload-build@main
  with:
    app-id: ${{ vars.REVYL_APP_ID }}
    version: ${{ github.sha }}
    expo-url: ${{ env.BUILD_URL }} # From EAS build output
    expo-headers: '{"Authorization": "Bearer ${{ secrets.EXPO_TOKEN }}"}'
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
```

Note: iOS `.tar.gz` files from EAS are automatically extracted and converted to
`.zip` format.

## 🚀 Complete Example

**Ready-to-use workflow for your Expo project:**

- **[📱 Expo Build Upload](./examples/upload-only-expo.yml)** - Simple EAS build
  → upload to Revyl

**[📚 View example with detailed setup instructions →](./examples/README.md)**

## Build-to-Test Pipeline

The most powerful way to use Revyl Actions - automatically test your freshly
built apps:

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
      # See complete examples: ./examples/

      - name: Upload Build to Revyl
        id: upload-build
        uses: RevylAI/revyl-gh-action/upload-build@main
        with:
          app-id: ${{ vars.REVYL_APP_ID }}
          version: ${{ github.sha }}
          file-path: path/to/your/app.apk
        env:
          REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}

      - name: Run Tests on New Build
        uses: RevylAI/revyl-gh-action/run-test@main
        with:
          test-id: ${{ env.TEST_ID }}
          build-id: ${{ steps.upload-build.outputs.build-id }}
        env:
          REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
```

## Standalone Usage

### Upload Build Only

```yaml
- name: Upload Build
  uses: RevylAI/revyl-gh-action/upload-build@main
  with:
    app-id: 'your-revyl-app-id'
    version: '1.0.0'
    file-path: './dist/app.apk'
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}

# For Expo builds (iOS .tar.gz automatically converted to .zip)
- name: Upload Expo Build
  uses: RevylAI/revyl-gh-action/upload-build@main
    with:
    app-id: 'your-revyl-app-id'
    version: '1.0.0'
    expo-url: 'https://expo.dev/artifacts/eas/...' # .tar.gz files are handled automatically
    expo-headers: '{"Authorization": "Bearer ${{ secrets.EXPO_TOKEN }}"}'
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
```

### Run Test Only

```yaml
# Basic test execution
- name: Run Revyl Test
  uses: RevylAI/revyl-gh-action/run-test@main
  with:
    test-id: 'your-test-id'
    timeout: 3600 # 60 minutes
    retries: 3
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}

# Run a workflow instead of a single test
- name: Run Revyl Workflow
  uses: RevylAI/revyl-gh-action/run-test@main
  with:
    workflow-id: 'your-workflow-id'
    timeout: 7200 # 2 hours for longer workflows
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}

# With specific build (from upload-build output)
- name: Run Test with Specific Build
  uses: RevylAI/revyl-gh-action/run-test@main
  with:
    test-id: 'your-test-id'
    build-id: ${{ steps.upload.outputs.build-id }}
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
```

## Automatic CI/CD Metadata

The upload-build action automatically injects CI/CD metadata into every build -
no configuration required.

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

Both actions provide comprehensive outputs for integration with other workflow
steps:

### Upload Build Outputs

| Output          | Description                          | Example Usage                               |
| --------------- | ------------------------------------ | ------------------------------------------- |
| `success`       | Whether upload was successful        | `${{ steps.upload.outputs.success }}`       |
| `build-id`      | **ID of the created build**          | `${{ steps.upload.outputs.build-id }}`      |
| `version-id`    | Deprecated alias for `build-id`      | `${{ steps.upload.outputs.version-id }}`    |
| `version`       | Version string of the uploaded build | `${{ steps.upload.outputs.version }}`       |
| `package-id`    | Extracted package ID from the build  | `${{ steps.upload.outputs.package-id }}`    |
| `upload-time`   | Time taken for upload in seconds     | `${{ steps.upload.outputs.upload-time }}`   |
| `error-message` | Error message if upload failed       | `${{ steps.upload.outputs.error-message }}` |

### Run Test Outputs

**Test Outputs:**

| Output            | Description                         | Example Usage                               |
| ----------------- | ----------------------------------- | ------------------------------------------- |
| `success`         | Whether test completed successfully | `${{ steps.test.outputs.success }}`         |
| `task_id`         | Unique task ID for the execution    | `${{ steps.test.outputs.task_id }}`         |
| `execution_time`  | Total execution time in seconds     | `${{ steps.test.outputs.execution_time }}`  |
| `platform`        | Platform the test ran on            | `${{ steps.test.outputs.platform }}`        |
| `report_link`     | **Shareable link to test report**   | `${{ steps.test.outputs.report_link }}`     |
| `total_steps`     | Total number of test steps          | `${{ steps.test.outputs.total_steps }}`     |
| `completed_steps` | Number of completed steps           | `${{ steps.test.outputs.completed_steps }}` |
| `error_message`   | Error message if execution failed   | `${{ steps.test.outputs.error_message }}`   |

**Workflow-specific Outputs (when using `workflow-id`):**

| Output            | Description                       | Example Usage                               |
| ----------------- | --------------------------------- | ------------------------------------------- |
| `total_tests`     | Total number of tests in workflow | `${{ steps.test.outputs.total_tests }}`     |
| `completed_tests` | Number of tests completed         | `${{ steps.test.outputs.completed_tests }}` |
| `passed_tests`    | Number of tests that passed       | `${{ steps.test.outputs.passed_tests }}`    |
| `failed_tests`    | Number of tests that failed       | `${{ steps.test.outputs.failed_tests }}`    |

### Using Outputs in Subsequent Steps

```yaml
- name: Upload Build
  id: upload
  uses: RevylAI/revyl-gh-action/upload-build@main
  # ... configuration ...

- name: Use Upload Results
  if: steps.upload.outputs.success == 'true'
  run: |
    echo "Build uploaded successfully!"
    echo "Build ID: ${{ steps.upload.outputs.build-id }}"
    echo "Package: ${{ steps.upload.outputs.package-id }}"

- name: Run Test
  id: test
  uses: RevylAI/revyl-gh-action/run-test@main
  with:
    test-id: ${{ env.TEST_ID }}
    build-id: ${{ steps.upload.outputs.build-id }}
  # ... configuration ...

- name: Share Test Results
  if: always()
  run: |
    echo "Test Report: ${{ steps.test.outputs.report_link }}"
    echo "Success: ${{ steps.test.outputs.success }}"
```

## Documentation

For comprehensive documentation including framework-specific build guides:

- **[Complete Documentation](https://docs.revyl.ai/ci-recipes/github-actions)**
- **[Mobile Build Guides](https://docs.revyl.ai/platform/mobileguides)** - React
  Native, Expo, Flutter, etc.
- [Run Test Action README](./run-test/README.md)
- [Upload Build Action README](./upload-build/README.md)

## Development

Each action is self-contained with its own dependencies and build process:

```bash
cd [action-name]  # e.g., run-test, upload-build
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

See our [mobile build guides](https://docs.revyl.ai/platform/mobileguides) for
framework-specific setup instructions.

## Why Choose Revyl Actions?

**Real-time monitoring** - Watch your tests execute live with SSE  
**Zero-config metadata** - Automatic CI/CD traceability  
**Build-to-test pipelines** - Test the exact build you just created  
**Rich reporting** - Shareable authenticated report links  
**Multi-framework support** - Works with any mobile build system  
**Enterprise ready** - Robust error handling and retry logic

Ready to supercharge your mobile CI/CD? Get started with the examples above.
