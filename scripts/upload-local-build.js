#!/usr/bin/env node

/**
 * Local Build Upload Script for Revyl
 *
 * This script builds your Expo app locally and uploads it to Revyl.
 * Perfect for developers who want to test builds locally before CI/CD.
 *
 * Usage:
 *   node upload-local-build.js --platform ios --build-var-id your-id --version 1.0.0
 *   node upload-local-build.js --platform android --build-var-id your-id --version 1.0.0
 *
 * Environment variables required:
 *   REVYL_API_KEY - Your Revyl API key
 */

const { execSync, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')
const os = require('os')

// Load environment variables from .env file if it exists
function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env')
  if (fs.existsSync(envPath)) {
    try {
      const envContent = fs.readFileSync(envPath, 'utf8')
      const envLines = envContent.split('\n')

      for (const line of envLines) {
        const trimmedLine = line.trim()
        if (trimmedLine && !trimmedLine.startsWith('#')) {
          const [key, ...valueParts] = trimmedLine.split('=')
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=').replace(/^["']|["']$/g, '') // Remove quotes
            if (!process.env[key]) {
              // Don't override existing env vars
              process.env[key] = value
            }
          }
        }
      }
      log('Loaded .env file')
    } catch (e) {
      console.log(`⚠️  Could not load .env file: ${e.message}`)
    }
  }
}

// Load .env file at startup
loadEnvFile()

// Simple HTTP client for API calls
class SimpleHttpClient {
  constructor(apiKey) {
    this.apiKey = apiKey
    this.baseHeaders = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'revyl-local-upload-script/1.0.0'
    }
  }

  async request(method, url, data = null) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url)
      const client = urlObj.protocol === 'https:' ? https : http

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: method,
        headers: { ...this.baseHeaders }
      }

      if (data) {
        const jsonData = JSON.stringify(data)
        options.headers['Content-Length'] = Buffer.byteLength(jsonData)
      }

      const req = client.request(options, res => {
        let body = ''
        res.on('data', chunk => (body += chunk))
        res.on('end', () => {
          try {
            const result = body ? JSON.parse(body) : {}
            resolve({
              statusCode: res.statusCode,
              result: result
            })
          } catch (e) {
            resolve({
              statusCode: res.statusCode,
              result: { error: 'Invalid JSON response', body }
            })
          }
        })
      })

      req.on('error', reject)

      if (data) {
        req.write(JSON.stringify(data))
      }
      req.end()
    })
  }

  async uploadFile(uploadUrl, filePath, contentType) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(uploadUrl)
      const client = urlObj.protocol === 'https:' ? https : http

      const fileSize = fs.statSync(filePath).size
      const fileStream = fs.createReadStream(filePath)

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
          'Content-Length': fileSize
        }
      }

      const req = client.request(options, res => {
        resolve({ statusCode: res.statusCode })
      })

      req.on('error', reject)
      fileStream.pipe(req)
    })
  }
}

// Utility functions
function log(message, level = 'info') {
  const prefix =
    {
      info: '',
      success: '✅ ',
      error: '❌ ',
      warning: '⚠️ '
    }[level] || ''

  console.log(`${prefix} ${message}`.trim())
}

function parseArgs() {
  const args = process.argv.slice(2)
  const parsed = {}

  for (let i = 0; i < args.length; i += 2) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2)
      const value = args[i + 1]
      parsed[key] = value
    }
  }

  return parsed
}

function validateArgs(args) {
  const required = ['platform', 'build-var-id']
  const missing = required.filter(arg => !args[arg])

  if (missing.length > 0) {
    throw new Error(`Missing required arguments: ${missing.join(', ')}`)
  }

  if (!['ios', 'android'].includes(args.platform)) {
    throw new Error('Platform must be either "ios" or "android"')
  }
}

function getVersionFromAppJson() {
  try {
    // Look for app.json in current directory
    const appJsonPath = path.join(process.cwd(), 'app.json')
    if (!fs.existsSync(appJsonPath)) {
      return null
    }

    const appJsonContent = fs.readFileSync(appJsonPath, 'utf8')
    const appJson = JSON.parse(appJsonContent)

    // Extract version from expo.version
    const version = appJson?.expo?.version
    if (version) {
      log(`Found version in app.json: ${version}`)
      return version
    }

    return null
  } catch (e) {
    log(`Could not read version from app.json: ${e.message}`, 'warning')
    return null
  }
}

function getPackageIdFromAppJson(platform) {
  try {
    const appJsonPath = path.join(process.cwd(), 'app.json')
    if (!fs.existsSync(appJsonPath)) {
      return null
    }

    const appJsonContent = fs.readFileSync(appJsonPath, 'utf8')
    const appJson = JSON.parse(appJsonContent)

    if (platform === 'ios') {
      return appJson?.expo?.ios?.bundleIdentifier || null
    } else if (platform === 'android') {
      return appJson?.expo?.android?.package || null
    }

    return null
  } catch (e) {
    return null
  }
}

function findBuildOutput(platform, buildOutput = '') {
  log(`Looking for ${platform} build output...`)

  // First, try to parse the build output for the artifacts path
  if (buildOutput) {
    const artifactMatch = buildOutput.match(
      /You can find the build artifacts in (.+\.(?:tar\.gz|tgz|zip|app|ipa|apk))/
    )
    if (artifactMatch) {
      const artifactPath = artifactMatch[1].trim()
      if (fs.existsSync(artifactPath)) {
        log(`Found build artifact from EAS output: ${artifactPath}`)
        return artifactPath
      }
    }
  }

  if (platform === 'ios') {
    // Look for iOS build outputs - including tar.gz files from EAS local builds
    const patterns = [
      'build-*.tar.gz', // EAS local build output
      '*.tar.gz',
      '*.app',
      '*.zip',
      'build/*.app',
      'ios/build/*.app'
    ]

    for (const pattern of patterns) {
      try {
        const files = execSync(
          `find . -name "${pattern}" -type f 2>/dev/null || true`,
          { encoding: 'utf8' }
        )
          .split('\n')
          .filter(f => f.trim())
          .sort((a, b) => {
            // Sort by modification time, newest first
            const statA = fs.statSync(a)
            const statB = fs.statSync(b)
            return statB.mtime - statA.mtime
          })

        if (files.length > 0) {
          log(`Found iOS build: ${files[0]}`)
          return files[0]
        }
      } catch (e) {
        // Continue to next pattern
      }
    }
  } else if (platform === 'android') {
    // Look for Android APK files
    const patterns = [
      '*.apk',
      'build/*.apk',
      'android/app/build/outputs/apk/**/*.apk'
    ]

    for (const pattern of patterns) {
      try {
        const files = execSync(
          `find . -name "${pattern}" -type f 2>/dev/null || true`,
          { encoding: 'utf8' }
        )
          .split('\n')
          .filter(f => f.trim())
          .sort((a, b) => {
            const statA = fs.statSync(a)
            const statB = fs.statSync(b)
            return statB.mtime - statA.mtime
          })

        if (files.length > 0) {
          log(`Found Android build: ${files[0]}`)
          return files[0]
        }
      } catch (e) {
        // Continue to next pattern
      }
    }
  }

  return null
}

function processTarGzToZip(tarGzPath) {
  console.log(`\n🔄 Converting ${path.basename(tarGzPath)} to zip format...`)

  try {
    // Create temporary directory for extraction
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eas-extract-'))
    execSync(`tar -xzf "${tarGzPath}" -C "${tempDir}"`, { stdio: 'pipe' })

    // Find .app directory in extracted content
    let appDir = null
    function findAppDir(dir) {
      const items = fs.readdirSync(dir)
      for (const item of items) {
        const itemPath = path.join(dir, item)
        const stat = fs.statSync(itemPath)
        if (stat.isDirectory()) {
          if (item.endsWith('.app')) {
            return itemPath
          }
          // Recursively search subdirectories
          const found = findAppDir(itemPath)
          if (found) return found
        }
      }
      return null
    }

    appDir = findAppDir(tempDir)

    if (!appDir) {
      log(
        'No .app directory found in tar.gz, uploading original file',
        'warning'
      )
      return tarGzPath
    }

    // Create zip file
    const appName = path.basename(appDir)
    const zipName = appName.replace('.app', '.zip')
    const zipPath = path.join(process.cwd(), zipName)

    // Use native zip command for better compatibility
    const originalCwd = process.cwd()
    try {
      process.chdir(path.dirname(appDir))
      execSync(`zip -r "${zipPath}" "${path.basename(appDir)}"`, {
        stdio: 'pipe'
      })
    } finally {
      process.chdir(originalCwd)
    }

    // Clean up temp directory
    execSync(`rm -rf "${tempDir}"`)

    console.log(`✅ Created ${zipName}\n`)
    return zipPath
  } catch (e) {
    log(`Failed to process tar.gz: ${e.message}`, 'error')
    log('Uploading original tar.gz file', 'warning')
    return tarGzPath
  }
}

function createLocalMetadata(args) {
  const metadata = {
    ci_system: 'local-script',
    build_time: new Date().toISOString(),
    platform: args.platform,
    local_build: true
  }

  // Try to get git information
  try {
    metadata.commit_sha = execSync('git rev-parse HEAD', {
      encoding: 'utf8'
    }).trim()
    metadata.branch = execSync('git branch --show-current', {
      encoding: 'utf8'
    }).trim()
  } catch (e) {
    log(
      'Could not extract git information (not in a git repository)',
      'warning'
    )
  }

  // Add user metadata if provided
  if (args.metadata) {
    ;``
    try {
      const userMetadata = JSON.parse(args.metadata)
      Object.assign(metadata, userMetadata)
    } catch (e) {
      log(`Invalid JSON in metadata: ${e.message}`, 'warning')
    }
  }

  return metadata
}

async function uploadBuild(
  client,
  buildVarId,
  version,
  filePath,
  metadata,
  packageName
) {
  const backendUrl = 'https://backend.cognisim.io'
  const fileName = path.basename(filePath)

  // Step 1: Get upload URL
  const uploadUrlEndpoint = `/api/v1/builds/vars/${buildVarId}/versions/upload-url`
  const uploadUrlParams = new URLSearchParams({
    version: version,
    file_name: fileName
  })

  const uploadUrlRes = await client.request(
    'POST',
    `${backendUrl}${uploadUrlEndpoint}?${uploadUrlParams}`,
    {}
  )

  if (uploadUrlRes.statusCode !== 200) {
    const errorMsg =
      uploadUrlRes.result?.detail ||
      `API returned status code ${uploadUrlRes.statusCode}`
    throw new Error(`Failed to get upload URL: ${errorMsg}`)
  }

  if (
    !uploadUrlRes.result ||
    !uploadUrlRes.result.upload_url ||
    !uploadUrlRes.result.version_id
  ) {
    throw new Error(
      'Failed to get upload URL: missing upload_url or version_id in API response'
    )
  }

  const versionId = uploadUrlRes.result.version_id
  const uploadUrl = uploadUrlRes.result.upload_url
  const contentType = uploadUrlRes.result.content_type

  console.log(`Uploading to Revyl...`)

  // Step 2: Upload file to S3
  const uploadRes = await client.uploadFile(uploadUrl, filePath, contentType)

  if (uploadRes.statusCode !== 200) {
    throw new Error(
      `Failed to upload file to S3: status code ${uploadRes.statusCode}`
    )
  }

  // Step 3: Get package ID from app.json
  let packageId = null

  // First try to get from app.json
  packageId = getPackageIdFromAppJson(metadata.platform)

  // If not found in app.json, try the API endpoint as fallback
  if (!packageId) {
    try {
      const extractEndpoint = `/api/v1/builds/versions/${versionId}/extract-package-id`
      const extractRes = await client.request(
        'POST',
        `${backendUrl}${extractEndpoint}`,
        {}
      )

      if (extractRes.statusCode === 200 && extractRes.result?.package_id) {
        packageId = extractRes.result.package_id
      }
    } catch (e) {
      // Silently continue if package extraction fails
    }
  }

  // Step 4: Complete the upload
  const completeEndpoint = `/api/v1/builds/versions/${versionId}/complete-upload`

  const completeMetadata = {
    ...metadata,
    file_name: fileName
  }

  const completeBody = {
    version_id: versionId,
    metadata: completeMetadata,
    package_name: packageName || packageId || undefined
  }

  const completeRes = await client.request(
    'POST',
    `${backendUrl}${completeEndpoint}`,
    completeBody
  )

  if (completeRes.statusCode !== 200) {
    const errorMsg =
      completeRes.result?.detail ||
      `API returned status code ${completeRes.statusCode}`
    throw new Error(`Failed to complete upload: ${errorMsg}`)
  }

  return {
    versionId,
    packageId,
    version
  }
}

async function main() {
  try {
    console.log('\n┌─────────────────────────────────────┐')
    console.log('│       Revyl Build Upload            │')
    console.log('└─────────────────────────────────────┘')

    // Check for API key
    if (!process.env.REVYL_API_KEY) {
      throw new Error(
        'Missing REVYL_API_KEY environment variable. Get your API key from https://auth.revyl.ai/account/api_keys'
      )
    }

    // Parse and validate arguments
    const args = parseArgs()
    validateArgs(args)

    // Get version from app.json if not provided
    if (!args.version) {
      const appJsonVersion = getVersionFromAppJson()
      if (appJsonVersion) {
        args.version = appJsonVersion
        log(`Using version from app.json: ${args.version}`)
      } else {
        throw new Error(
          'No version provided and could not find version in app.json. Please provide --version or ensure app.json has expo.version set.'
        )
      }
    }

    console.log(`\n📱 Platform: ${args.platform.toUpperCase()}`)
    console.log(`🏷️  Version: ${args.version}\n`)

    // Step 1: Build with EAS (if no file path provided)
    let buildPath = args['file-path']

    if (!buildPath) {
      const easProfile = args.profile || 'e2e'
      const buildCommand = `eas build --platform ${args.platform} --profile ${easProfile} --local`

      console.log('┌─────────────────────────────────────┐')
      console.log('│            Building App             │')
      console.log('└─────────────────────────────────────┘')
      console.log(`Command: ${buildCommand}\n`)

      let buildOutput = ''
      try {
        // Show build logs in real-time while capturing output
        buildOutput = await new Promise((resolve, reject) => {
          const [command, ...commandArgs] = buildCommand.split(' ')
          const child = spawn(command, commandArgs, {
            stdio: ['inherit', 'pipe', 'inherit'],
            shell: true
          })

          let output = ''
          child.stdout.on('data', data => {
            const text = data.toString()
            process.stdout.write(text) // Show in real-time
            output += text // Capture for parsing
          })

          child.on('close', code => {
            if (code === 0) {
              resolve(output)
            } else {
              reject(new Error(`Build process exited with code ${code}`))
            }
          })

          child.on('error', reject)
        })

        console.log('\n✅ Build completed successfully\n')
      } catch (e) {
        console.log('\n❌ Build failed\n')
        throw new Error(`Build failed: ${e.message}`)
      }

      // Find the build output, passing the build output for parsing
      buildPath = findBuildOutput(args.platform, buildOutput)
      if (!buildPath) {
        throw new Error(
          `Could not find ${args.platform} build output. Please specify --file-path manually.`
        )
      }
    }

    // Verify build file exists
    if (!fs.existsSync(buildPath)) {
      throw new Error(`Build file not found: ${buildPath}`)
    }

    // Process tar.gz files for iOS (convert to zip) - also handle manual file paths
    if (args.platform === 'ios' && buildPath.endsWith('.tar.gz')) {
      buildPath = processTarGzToZip(buildPath)
    }

    const fileSize = fs.statSync(buildPath).size
    const fileName = path.basename(buildPath)
    console.log('┌─────────────────────────────────────┐')
    console.log('│           Uploading Build           │')
    console.log('└─────────────────────────────────────┘')
    console.log(`File: ${fileName} (${Math.round(fileSize / 1024 / 1024)}MB)\n`)

    // Step 2: Upload to Revyl
    const client = new SimpleHttpClient(process.env.REVYL_API_KEY)
    const metadata = createLocalMetadata(args)

    // Skip metadata logging unless there are custom fields
    const customFields = Object.keys(metadata).filter(
      key =>
        ![
          'ci_system',
          'build_time',
          'platform',
          'local_build',
          'commit_sha',
          'branch'
        ].includes(key)
    )
    if (customFields.length > 0) {
      log('Custom metadata:')
      customFields.forEach(key => {
        log(`  ${key}: ${metadata[key]}`)
      })
    }

    const startTime = Date.now()
    const result = await uploadBuild(
      client,
      args['build-var-id'],
      args.version,
      buildPath,
      metadata,
      args['package-name']
    )

    const uploadTime = Math.round((Date.now() - startTime) / 1000)

    console.log('┌─────────────────────────────────────┐')
    console.log('│             Success!                │')
    console.log('└─────────────────────────────────────┘')
    console.log(`Version ID: ${result.versionId}`)
    if (result.packageId) {
      console.log(`Package ID: ${result.packageId}`)
    }
    console.log(`Upload time: ${uploadTime}s\n`)

    // Clean up zip file if we created it from tar.gz
    if (
      args.platform === 'ios' &&
      args['file-path'] &&
      args['file-path'].endsWith('.tar.gz')
    ) {
      try {
        if (fs.existsSync(buildPath) && buildPath.endsWith('.zip')) {
          fs.unlinkSync(buildPath)
          console.log(`🗑️  Cleaned up temporary ${path.basename(buildPath)}\n`)
        }
      } catch (e) {
        // Silently continue if cleanup fails
      }
    }

    // Output JSON for programmatic use
    if (args.json) {
      console.log(
        JSON.stringify(
          {
            success: true,
            versionId: result.versionId,
            version: result.version,
            packageId: result.packageId,
            uploadTime,
            buildPath
          },
          null,
          2
        )
      )
    }
  } catch (error) {
    log(`Error: ${error.message}`, 'error')

    // Try to get args, but handle case where it might not be defined yet
    let args = {}
    try {
      args = parseArgs()
    } catch (e) {
      // If we can't parse args, that's fine - just don't output JSON
    }

    if (args.json) {
      console.log(
        JSON.stringify(
          {
            success: false,
            error: error.message
          },
          null,
          2
        )
      )
    }

    process.exit(1)
  }
}

// Show help if no arguments provided
if (process.argv.length <= 2) {
  console.log(`
┌─────────────────────────────────────────────────────────────┐
│                 Revyl Local Build Upload                    │
└─────────────────────────────────────────────────────────────┘

Builds your Expo app locally and uploads it to Revyl.

USAGE:
  node upload-local-build.js --platform <ios|android> --build-var-id <id>

REQUIRED:
  --platform <ios|android>     Platform to build for
  --build-var-id <id>          Your Revyl build variable ID

OPTIONAL:
  --version <version>          Version (defaults to app.json)
  --profile <profile>          EAS profile (default: e2e)
  --file-path <path>           Existing build file (skips building)
  --metadata <json>            Additional metadata
  --json                       JSON output

SETUP:
  1. Put this script in your Expo project root (same level as app.json)
  2. Create .env file: REVYL_API_KEY=your-key
  3. Get build variable ID from Revyl dashboard

EXAMPLES:
  node upload-local-build.js --platform ios --build-var-id abc-123
  node upload-local-build.js --platform android --build-var-id abc-123 --profile production

See SETUP.md for detailed instructions.
Get API key: https://auth.revyl.ai/account/api_keys
`)
  process.exit(0)
}

main()
