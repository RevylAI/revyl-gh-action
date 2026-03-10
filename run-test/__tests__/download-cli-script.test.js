const fs = require('fs')
const http = require('http')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

const SCRIPT_PATH = path.resolve(__dirname, '../../scripts/download-cli.sh')

/**
 * Starts a lightweight HTTP server backed by explicit route handlers.
 *
 * @param {Record<string, (req: http.IncomingMessage, res: http.ServerResponse) => void>} routes Route handlers keyed by request path.
 * @returns {Promise<{server: http.Server, baseUrl: string}>} Running server handle and base URL.
 */
function startServer(routes) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const handler = routes[req.url]
      if (!handler) {
        res.statusCode = 404
        res.end('Not Found')
        return
      }

      handler(req, res)
    })

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${port}`
      })
    })
  })
}

/**
 * Executes the shared download script with the provided arguments and environment.
 *
 * @param {string[]} args CLI arguments passed to the script.
 * @param {NodeJS.ProcessEnv} env Additional environment variables for the child process.
 * @returns {Promise<{status: number | null, signal: NodeJS.Signals | null, stdout: string, stderr: string}>} Child process result with captured output.
 */
function runDownloadCli(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [SCRIPT_PATH, ...args], {
      env: {
        ...process.env,
        ...env
      }
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', reject)
    child.on('close', (status, signal) => {
      resolve({ status, signal, stdout, stderr })
    })
  })
}

/**
 * Builds a tiny executable shell script that behaves like `revyl version`.
 *
 * @param {string} version Version string emitted by the fake CLI.
 * @returns {string} Executable shell script source.
 */
function buildFakeCli(version) {
  return `#!/usr/bin/env bash
set -euo pipefail

if [ "\${1:-}" = "version" ]; then
  echo "${version}"
  exit 0
fi

echo "unexpected arg: \${1:-}" >&2
exit 1
`
}

describe('download-cli.sh', () => {
  it('fails fast when the requested asset is missing', async () => {
    const routePath = '/missing/releases/latest/download/revyl-linux-amd64'
    const { server, baseUrl } = await startServer({
      [routePath]: (_req, res) => {
        res.statusCode = 404
        res.end('Not Found')
      }
    })
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'revyl-cli-missing-'))

    try {
      const result = await runDownloadCli(
        ['--os', 'linux', '--arch', 'amd64', '--version', 'latest', '--output-dir', tempDir],
        { REVYL_CLI_RELEASES_BASE_URL: `${baseUrl}/missing/releases` }
      )

      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('Failed to download Revyl CLI')
      expect(result.stderr).toContain(routePath)
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
      await new Promise((resolve) => server.close(resolve))
    }
  })

  it('rejects invalid download payloads before the action tries to use them', async () => {
    const routePath = '/invalid/releases/latest/download/revyl-linux-amd64'
    const { server, baseUrl } = await startServer({
      [routePath]: (_req, res) => {
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/plain')
        res.end('Not Found')
      }
    })
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'revyl-cli-invalid-'))

    try {
      const result = await runDownloadCli(
        ['--os', 'linux', '--arch', 'amd64', '--version', 'latest', '--output-dir', tempDir],
        { REVYL_CLI_RELEASES_BASE_URL: `${baseUrl}/invalid/releases` }
      )

      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('Downloaded Revyl CLI failed validation')
      expect(result.stderr).toContain(routePath)
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
      await new Promise((resolve) => server.close(resolve))
    }
  })

  it('downloads and validates a runnable CLI payload', async () => {
    const routePath = '/valid/releases/download/v0.1.9/revyl-linux-amd64'
    const fakeVersion = 'revyl v0.1.9'
    const { server, baseUrl } = await startServer({
      [routePath]: (_req, res) => {
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/octet-stream')
        res.end(buildFakeCli(fakeVersion))
      }
    })
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'revyl-cli-valid-'))

    try {
      const result = await runDownloadCli(
        ['--os', 'linux', '--arch', 'amd64', '--version', 'v0.1.9', '--output-dir', tempDir],
        { REVYL_CLI_RELEASES_BASE_URL: `${baseUrl}/valid/releases` }
      )

      expect(result.status).toBe(0)

      const cliPath = result.stdout.trim()
      expect(cliPath).toBe(path.join(tempDir, 'revyl-linux-amd64'))
      expect(fs.existsSync(cliPath)).toBe(true)
      expect(result.stderr).toContain(`Revyl CLI ready: ${fakeVersion}`)
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
      await new Promise((resolve) => server.close(resolve))
    }
  })
})
