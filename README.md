# Revyl GitHub Actions

This repository contains GitHub Actions for integrating with the Revyl platform.

## Available Actions

### 1. Run Test Action (`actions/run-test`)

Run Revyl tests or workflows from your GitHub workflows.

**Setup:**

1. Create a Revyl API key on the settings page
2. Add the following to your workflow file:

```yaml
- uses: actions/checkout@v3
  with:
    fetch-depth: 0

- name: Run tests using Revyl
  uses: RevylAI/revyl-gh-action/actions/run-test@v1
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
  with:
    test-id: <test-id>
```

### 2. Upload Build Action (`actions/upload-build`)

Upload build artifacts to the Revyl build system. Supports both direct file
uploads and Expo URL ingestion.

**Features:**

- Upload APK, IPA, ZIP files directly from CI/CD
- Download and upload builds from Expo URLs
- Automatic package ID extraction
- Custom metadata support

**Example Usage:**

```yaml
# Upload from file
- name: Upload Build
  uses: RevylAI/revyl-gh-action/actions/upload-build@v1
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
  with:
    build-var-id: 'your-build-variable-id'
    version: '1.0.0'
    file-path: './dist/app.apk'
    metadata: '{"build_number": "123"}'

# Upload from Expo URL
- name: Upload Expo Build
  uses: RevylAI/revyl-gh-action/actions/upload-build@v1
  env:
    REVYL_API_KEY: ${{ secrets.REVYL_API_KEY }}
  with:
    build-var-id: 'your-build-variable-id'
    version: '1.0.0'
    expo-url: 'https://expo.dev/artifacts/eas/...'
    expo-headers: '{"Authorization": "Bearer ${{ secrets.EXPO_TOKEN }}"}'
```

For detailed documentation, see the individual action README files:

- [Run Test Action README](./actions/run-test/README.md)
- [Upload Build Action README](./actions/upload-build/README.md)

## Getting Started

1. Get your Revyl API key from the Revyl settings page
2. Add it as a secret named `REVYL_API_KEY` in your GitHub repository
3. Use the actions in your workflows as shown in the examples above

## Development

Each action is self-contained with its own dependencies and build process. To
develop or modify an action:

```bash
cd actions/[action-name]
npm install
npm test
npm run package
```
