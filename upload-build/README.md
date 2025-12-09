# Upload Build Action

This GitHub Action uploads build artifacts to the CogniSim build system. It
supports both direct file uploads and Expo URL ingestion.

## Features

- Upload build artifacts (APK, ZIP, .app files) directly from CI/CD
- Download and upload builds from Expo URLs
- Automatic package ID extraction for mobile apps
- Support for custom metadata and headers
- Integration with CogniSim build variable system

## Usage

### Upload from File

```yaml
- name: Upload Build
  uses: ./actions/upload-build
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
  with:
    build-var-id: 'your-build-variable-id'
    version: '1.0.0'
    file-path: './dist/app.apk'
    metadata: '{"build_number": "123", "commit_sha": "${{ github.sha }}"}'
```

### Upload from Expo URL

```yaml
- name: Upload Expo Build
  uses: ./actions/upload-build
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
  with:
    build-var-id: 'your-build-variable-id'
    version: '1.0.0'
    expo-url: 'https://expo.dev/artifacts/eas/...'
    expo-headers: '{"Authorization": "Bearer ${{ secrets.EXPO_TOKEN }}"}'
    metadata: '{"expo_build_id": "abc123"}'
```

## Inputs

| Input          | Description                                              | Required | Default                    |
| -------------- | -------------------------------------------------------- | -------- | -------------------------- |
| `build-var-id` | The build variable ID to upload the version to           | ✅       |                            |
| `version`      | Version string for this build (must be unique)           | ✅       |                            |
| `file-path`    | Path to the build artifact file                          | ❌\*     |                            |
| `expo-url`     | Expo build URL to download and upload                    | ❌\*     |                            |
| `expo-headers` | JSON string of headers for Expo URL download             | ❌       |                            |
| `metadata`     | JSON string of additional metadata                       | ❌       |                            |
| `package-name` | Package name/identifier (auto-extracted if not provided) | ❌       |                            |
| `backend-url`  | CogniSim backend URL                                     | ❌       | `https://backend.revyl.ai` |
| `timeout`      | Timeout in seconds for upload operation                  | ❌       | `1800`                     |

\*Either `file-path` or `expo-url` must be provided (mutually exclusive).

## Outputs

| Output          | Description                                      |
| --------------- | ------------------------------------------------ |
| `success`       | Whether the upload was successful                |
| `version-id`    | The ID of the created build version              |
| `version`       | The version string of the uploaded build         |
| `package-id`    | The extracted package ID from the build artifact |
| `upload-time`   | Time taken for the upload operation in seconds   |
| `error-message` | Error message if upload failed                   |

## Environment Variables

- `REVYL_API_KEY`: Required. Your CogniSim API key (get from revyl settings)

## Examples

### React Native Android Build

```yaml
name: Build and Upload Android
on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Build Android
        run: |
          cd android
          ./gradlew assembleRelease

      - name: Upload to CogniSim
        uses: ./actions/upload-build
        env:
          REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
        with:
          build-var-id: ${{ vars.ANDROID_BUILD_VAR_ID }}
          version: 'v${{ github.run_number }}'
          file-path: './android/app/build/outputs/apk/release/app-release.apk'
          metadata: |
            {
              "build_number": "${{ github.run_number }}",
              "commit_sha": "${{ github.sha }}",
              "branch": "${{ github.ref_name }}",
              "workflow_run_id": "${{ github.run_id }}"
            }
```

### Expo EAS Build

```yaml
name: Expo Build and Upload
on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Expo
        uses: expo/expo-github-action@v8
        with:
          expo-version: latest
          token: ${{ secrets.EXPO_TOKEN }}

      - name: Build with EAS
        run: |
          eas build --platform android --non-interactive --wait

      - name: Get Build URL
        id: build-url
        run: |
          BUILD_URL=$(eas build:list --platform=android --limit=1 --json | jq -r '.[0].artifacts.buildUrl')
          echo "url=$BUILD_URL" >> $GITHUB_OUTPUT

      - name: Upload to CogniSim
        uses: ./actions/upload-build
        env:
          REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
        with:
          build-var-id: ${{ vars.ANDROID_BUILD_VAR_ID }}
          version: 'expo-${{ github.run_number }}'
          expo-url: ${{ steps.build-url.outputs.url }}
          expo-headers: '{"Authorization": "Bearer ${{ secrets.EXPO_TOKEN }}"}'
          metadata: |
            {
              "expo_build": true,
              "build_number": "${{ github.run_number }}",
              "commit_sha": "${{ github.sha }}"
            }
```

## Error Handling

The action will fail if:

- No `REVYL_API_KEY` environment variable is set
- Neither `file-path` nor `expo-url` is provided
- Both `file-path` and `expo-url` are provided
- The specified file doesn't exist (for file uploads)
- The API returns an error (invalid build variable ID, duplicate version, etc.)
- Network issues during upload

Check the action logs and the `error-message` output for detailed error
information.

## Development

To build and test this action:

```bash
cd actions/upload-build
npm install
npm test
npm run package
```

The built action will be in the `dist/` directory.
