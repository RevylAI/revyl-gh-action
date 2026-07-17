#!/usr/bin/env node

/**
 * Revyl Build Upload Script
 *
 * Simple script to upload builds to Revyl using the stream-upload endpoint.
 *
 * Usage:
 *   node upload-local-build.js --platform ios --app-id <id> --version 1.0.0 --file ./app.zip
 *   node upload-local-build.js --platform android --app-id <id> --version 1.0.0 --file ./app.apk
 *
 * Environment variables:
 *   REVYL_API_KEY - Your Revyl API key (required)
 */

const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')

const BACKEND_URL = process.env.REVYL_BACKEND_URL || 'https://backend.revyl.ai'

// Load .env file if exists
function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env')
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...vals] = trimmed.split('=')
        if (key && vals.length > 0 && !process.env[key]) {
          process.env[key] = vals.join('=').replace(/^["']|["']$/g, '')
        }
      }
    }
  }
}

loadEnvFile()

function parseArgs() {
  const args = process.argv.slice(2)
  const parsed = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && args[i + 1]) {
      parsed[args[i].substring(2)] = args[++i]
    }
  }
  return parsed
}

function streamUpload(filePath, appId, version, apiKey) {
  return new Promise((resolve, reject) => {
    const fileName = path.basename(filePath)
    const fileSize = fs.statSync(filePath).size
    const boundary = `----RevylUpload${Date.now()}`
    const buildVarId = appId

    const url = new URL(
      `${BACKEND_URL}/api/v1/apps/${buildVarId}/builds/stream-upload?version=${encodeURIComponent(
        version
      )}`
    )
    const client = url.protocol === 'https:' ? https : http

    // Build multipart form data
    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`
    )
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`)
    const contentLength = header.length + fileSize + footer.length

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': contentLength
      }
    }

    const req = client.request(options, res => {
      let body = ''
      res.on('data', chunk => (body += chunk))
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(body))
          } catch {
            reject(new Error(`Invalid response: ${body}`))
          }
        } else {
          reject(new Error(`Upload failed (${res.statusCode}): ${body}`))
        }
      })
    })

    req.on('error', reject)

    // Stream the file
    req.write(header)
    const fileStream = fs.createReadStream(filePath)
    fileStream.on('data', chunk => req.write(chunk))
    fileStream.on('end', () => {
      req.write(footer)
      req.end()
    })
    fileStream.on('error', reject)
  })
}

async function main() {
  const args = parseArgs()

  // Show help
  const appId = args['app-id'] || args['build-var-id']
  if (!appId || !args.file) {
    console.log(`
Revyl Build Upload Script

USAGE:
  node upload-local-build.js --app-id <id> --file <path> [--version <ver>]

REQUIRED:
  --app-id <id>          Your Revyl app ID
  --file <path>          Path to build file (.apk, .zip, .ipa)

OPTIONAL:
  --version <version>    Version string (default: timestamp)
  --build-var-id <id>    Deprecated alias for --app-id

ENVIRONMENT:
  REVYL_API_KEY          Your Revyl API key (required)
  REVYL_BACKEND_URL      Backend URL (default: https://backend.revyl.ai)

EXAMPLES:
  node upload-local-build.js --app-id abc-123 --file ./app.apk --version 1.0.0
  node upload-local-build.js --app-id abc-123 --file ./MyApp.zip

Get API key: https://auth.revyl.ai/account/api_keys
`)
    process.exit(appId ? 1 : 0)
  }

  if (!process.env.REVYL_API_KEY) {
    console.error('❌ REVYL_API_KEY environment variable is required')
    process.exit(1)
  }

  if (!fs.existsSync(args.file)) {
    console.error(`❌ File not found: ${args.file}`)
    process.exit(1)
  }

  const version = args.version || `build-${Date.now()}`
  const fileSize = fs.statSync(args.file).size
  const fileName = path.basename(args.file)

  console.log(
    `\n📦 Uploading ${fileName} (${Math.round(fileSize / 1024 / 1024)}MB)`
  )
  console.log(`   Version: ${version}`)
  console.log(`   App ID: ${appId}\n`)

  const startTime = Date.now()

  try {
    const result = await streamUpload(
      args.file,
      appId,
      version,
      process.env.REVYL_API_KEY
    )

    const elapsed = Math.round((Date.now() - startTime) / 1000)

    console.log('✅ Upload successful!\n')
    console.log(`   Build ID: ${result.id}`)
    console.log(`   Version: ${result.version}`)
    if (result.package_name) {
      console.log(`   Package: ${result.package_name}`)
    }
    console.log(`   Time: ${elapsed}s\n`)

    // Output JSON for scripting
    if (args.json) {
      console.log(JSON.stringify(result, null, 2))
    }
  } catch (error) {
    console.error(`\n❌ ${error.message}\n`)
    process.exit(1)
  }
}

main()
