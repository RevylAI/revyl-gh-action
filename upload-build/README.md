# Upload Build Action

This GitHub Action uploads build artifacts to Revyl. It supports both direct
file uploads and Expo URL ingestion.

## Features

- Upload build artifacts (APK, ZIP, .app files) directly from CI/CD
- Download and upload builds from Expo URLs
- Automatic package ID extraction for mobile apps
- Support for custom metadata and headers

## Usage

### Upload from File

```yaml
- name: Upload Build
  uses: RevylAI/revyl-gh-action/upload-build@main
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
  with:
    app-id: 'your-revyl-app-id'
    version: '1.0.0'
    file-path: './dist/app.apk'
    metadata: '{"build_number": "123", "commit_sha": "${{ github.sha }}"}'
```

### Upload from Expo URL

```yaml
- name: Upload Expo Build
  uses: RevylAI/revyl-gh-action/upload-build@main
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
  with:
    app-id: 'your-revyl-app-id'
    version: '1.0.0'
    expo-url: 'https://expo.dev/artifacts/eas/...'
    expo-headers: '{"Authorization": "Bearer ${{ secrets.EXPO_TOKEN }}"}'
    metadata: '{"expo_build_id": "abc123"}'
```

### Upload to a Branch

```yaml
- name: Upload Build to staging
  uses: RevylAI/revyl-gh-action/upload-build@main
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
  with:
    app-id: 'your-revyl-app-id'
    version: '1.0.0'
    file-path: './dist/app.apk'
    branch: 'staging'
```

`branch` names the Revyl branch the build goes to; Revyl creates it if it
doesn't exist. Without `branch`, the upload goes to the run's Git branch, read
from GitHub's event data, so it needs no checkout:

- On a pull request run, the pull request's source branch, never its target. A
  fork's branch is named `owner:branch`.
- On any other run on a branch (push, `schedule`, `workflow_dispatch`, merge
  queue), that branch.
- On a tag run, the app's default branch.

Branches can't be deleted. A detected name that can't be a Revyl branch fails
the step; set `branch`. Merge queue runs are on branches named
`gh-readonly-queue/...`, one per entry, so each becomes a Revyl branch, and so
does every bot branch (Dependabot, Renovate) that runs an upload; set `branch`
in those workflows. Uploads don't pin the branch. See
[Build branches](https://docs.revyl.com/builds/branches) and
[Choose where CI uploads go](https://docs.revyl.com/builds/ci-builds#choose-where-ci-uploads-go).

Build metadata `branch` records the Git branch name, without the `owner:` prefix
a fork's Revyl branch has: the pull request's source branch on pull request
runs, otherwise the branch or tag the run is on.

## Inputs

| Input          | Description                                              | Required | Default                          |
| -------------- | -------------------------------------------------------- | -------- | -------------------------------- |
| `app-id`       | The Revyl app ID to upload the build to                  | Yes      |                                  |
| `build-var-id` | Deprecated alias for `app-id`                            | No       |                                  |
| `version`      | Version label for this build, unique within the app      | Yes      |                                  |
| `branch`       | Revyl branch to upload to; created if it does not exist  | No       | The run's Git branch (see above) |
| `file-path`    | Path to the build artifact file                          | No\*     |                                  |
| `expo-url`     | Expo build URL to download and upload                    | No\*     |                                  |
| `expo-headers` | JSON string of headers for Expo URL download             | No       |                                  |
| `metadata`     | JSON string of additional metadata                       | No       |                                  |
| `package-name` | Package name/identifier (auto-extracted if not provided) | No       |                                  |
| `backend-url`  | Override backend base URL                                | No       | `https://backend.revyl.ai`       |
| `timeout`      | Timeout in seconds for upload operation                  | No       | `1800`                           |

\*Either `file-path` or `expo-url` must be provided (mutually exclusive).

## Outputs

| Output          | Description                                      |
| --------------- | ------------------------------------------------ |
| `success`       | Whether the upload was successful                |
| `build-id`      | The ID of the created build                      |
| `version-id`    | Deprecated alias for `build-id`                  |
| `version`       | The version label of the uploaded build          |
| `package-id`    | The extracted package ID from the build artifact |
| `upload-time`   | Time taken for the upload operation in seconds   |
| `error-message` | Error message if upload failed                   |

## Environment Variables

- `REVYL_API_KEY`: Required. Your Revyl API key
- `REVYL_BACKEND_URL`: Optional backend override; `backend-url` input takes
  precedence.

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

      - name: Upload to Revyl
        uses: RevylAI/revyl-gh-action/upload-build@main
        env:
          REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
        with:
          app-id: ${{ vars.REVYL_ANDROID_APP_ID }}
          version: 'v${{ github.run_number }}'
          file-path: './android/app/build/outputs/apk/release/app-release.apk'
          metadata: |
            {
              "build_number": "${{ github.run_number }}",
              "commit_sha": "${{ github.sha }}",
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

      - name: Upload to Revyl
        uses: RevylAI/revyl-gh-action/upload-build@main
        env:
          REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
        with:
          app-id: ${{ vars.REVYL_ANDROID_APP_ID }}
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
- `branch` is omitted and the detected Git branch name can't be a Revyl branch
- The API returns an error (invalid app ID, duplicate version, etc.)
- Network issues during upload

Check the action logs and the `error-message` output for detailed error
information.

## Development

To build and test this action:

```bash
cd upload-build
npm install
npm test
npm run package
```

The built action will be in the `dist/` directory.
