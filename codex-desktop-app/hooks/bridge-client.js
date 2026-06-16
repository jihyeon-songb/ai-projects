'use strict'
// 오랑이 브릿지 디스커버리 + HTTP 호출 헬퍼 (의존성 없음)
const http = require('node:http')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const DISCOVERY_PATH = path.join(os.homedir(), '.codex', 'orangi-bridge.json')

/** 앱이 띄워둔 브릿지 정보 {port, token} 를 읽는다. 없으면 null. */
function discover() {
  try {
    const raw = fs.readFileSync(DISCOVERY_PATH, 'utf8')
    const { port, token } = JSON.parse(raw)
    if (port && token) return { port, token }
  } catch {
    /* 앱이 안 떠 있음 */
  }
  return null
}

/**
 * 브릿지로 JSON POST. 응답 JSON 을 resolve.
 * @param {string} pathname  '/notify' | '/permission'
 * @param {object} payload
 * @param {number} timeoutMs 0 이면 무제한(권한 보류 대기용)
 */
function post(pathname, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const info = discover()
    if (!info) return reject(new Error('orangi bridge not running'))

    const data = Buffer.from(JSON.stringify(payload))
    const req = http.request(
      {
        host: '127.0.0.1',
        port: info.port,
        path: pathname,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': data.length,
          'x-orangi-token': info.token
        }
      },
      (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => {
          try {
            resolve(body ? JSON.parse(body) : {})
          } catch (e) {
            reject(e)
          }
        })
      }
    )
    req.on('error', reject)
    if (timeoutMs && timeoutMs > 0) {
      req.setTimeout(timeoutMs, () => req.destroy(new Error('orangi bridge timeout')))
    }
    req.write(data)
    req.end()
  })
}

module.exports = { discover, post, DISCOVERY_PATH }
