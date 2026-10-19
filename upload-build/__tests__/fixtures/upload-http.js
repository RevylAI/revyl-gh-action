const fs = require('fs')
const httpClient = require('@actions/http-client')

function record(request) {
  fs.appendFileSync(
    process.env.ACTION_TEST_REQUESTS,
    `${JSON.stringify(request)}\n`
  )
}

class UploadHttpClient {
  async postJson(url, body) {
    record({ method: 'POST', url, body })
    if (process.env.ACTION_TEST_REJECT_DESTINATION === 'true') {
      return { statusCode: 400, result: { detail: 'Destination rejected' } }
    }
    if (url.includes('/builds/upload-url?')) {
      return {
        statusCode: 200,
        result: {
          version_id: 'build-123',
          upload_url: 'https://artifact.example.invalid/app.apk',
          content_type: 'application/vnd.android.package-archive'
        }
      }
    }
    if (url.endsWith('/builds/from-url')) {
      return { statusCode: 200, result: { id: 'build-123', metadata: {} } }
    }
    if (url.endsWith('/extract-package-id')) {
      return { statusCode: 200, result: { package_id: 'com.example.app' } }
    }
    if (url.endsWith('/complete-upload')) {
      return { statusCode: 200, result: {} }
    }
    throw new Error('Unexpected fixture endpoint')
  }

  async sendStream(method, url, stream) {
    const chunks = []
    for await (const chunk of stream) {
      chunks.push(chunk)
    }
    record({ method, url, bytes: Buffer.concat(chunks).length })
    return { message: { statusCode: 200 } }
  }
}

httpClient.HttpClient = UploadHttpClient
for (const network of [require('http'), require('https')]) {
  network.request = network.get = () => {
    throw new Error('Network is disabled in upload entrypoint tests')
  }
}
