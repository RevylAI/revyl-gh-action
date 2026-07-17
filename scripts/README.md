# Revyl Local Upload Scripts

These helper scripts upload an existing mobile build artifact to a Revyl app
without using GitHub Actions. They are useful when you already have an `.apk`,
`.zip`, or simulator `.app` artifact on disk and want to register it from a
developer machine or a generic CI runner.

For config-driven builds, prefer the Revyl CLI:

```bash
revyl build --platform ios
revyl build --platform android
```

For artifact-only uploads, these scripts call the same app-based upload API as
the GitHub Action.

## Setup

```bash
export REVYL_API_KEY=your-api-key-here
```

Get your API key from: https://auth.revyl.ai/account/api_keys

## Shell Script

```bash
./scripts/upload-build.sh <app-id> <file-path> [version]
```

Examples:

```bash
./scripts/upload-build.sh abc-123-def ./app.apk 1.0.0
./scripts/upload-build.sh abc-123-def ./MyApp.zip
```

## Node Script

```bash
node scripts/upload-local-build.js --app-id <id> --file <path> [--version <version>] [--json]
```

Options:

| Option | Description |
|--------|-------------|
| `--app-id <id>` | Revyl app ID to upload to. |
| `--file <path>` | Path to the build file. |
| `--version <version>` | Optional version string. Defaults to a timestamp. |
| `--json` | Print the API response as JSON. |
| `--build-var-id <id>` | Deprecated alias for `--app-id`. |

Examples:

```bash
node scripts/upload-local-build.js --app-id abc-123 --file ./app.apk --version 1.0.0
node scripts/upload-local-build.js --app-id abc-123 --file ./MyApp.zip --json
```

## CI/CD Example

```yaml
- name: Upload build to Revyl
  run: |
    export REVYL_API_KEY=${{ secrets.REVYL_API_KEY }}
    ./scripts/upload-build.sh "${{ vars.REVYL_APP_ID }}" ./app.apk "${{ github.sha }}"
```

## Troubleshooting

**Missing `REVYL_API_KEY`**: Set `REVYL_API_KEY` in your shell or CI
environment.

**File not found**: Confirm the path points to the artifact produced by your
build job.

**App not found**: Confirm the app ID exists in Revyl and your API key has
access to it.
