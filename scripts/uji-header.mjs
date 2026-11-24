// Uji asap header keamanan: memastikan CSP tidak memblokir apa pun dan halaman
// tetap berfungsi. Dipakai setelah mengubah `headers()` di next.config.ts.
//
//   node scripts/uji-header.mjs http://localhost:3100/
//   node scripts/uji-header.mjs https://www.lintasair.com/cek-tiket
//
// Butuh Google Chrome terpasang (`google-chrome`). Keluar dengan kode 1 bila ada
// request gagal atau pelanggaran CSP, supaya bisa dipakai di CI.
import { spawn } from 'node:child_process'

const URL_UJI = process.argv[2] || 'http://localhost:3100/'
const PORT = Number(process.env.CDP_PORT || 9333)
const PROFIL = `/tmp/uji-header-${Date.now()}`

const chrome = spawn(
  'google-chrome',
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFIL}`,
    'about:blank',
  ],
  { stdio: 'ignore' }
)

const tunggu = (ms) => new Promise((r) => setTimeout(r, ms))

async function alamatDevtools() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (r.ok) return r.json()
    } catch {
      // Chrome belum siap.
    }
    await tunggu(250)
  }
  throw new Error('Chrome tidak siap (port ' + PORT + ')')
}

const info = await alamatDevtools()
const ws = new WebSocket(info.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r, { once: true }))

let id = 0
const nunggu = new Map()
const urls = new Map()
const gagal = []
const dibatalkan = []
const supabase = []
const keamanan = []

ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && nunggu.has(m.id)) {
    nunggu.get(m.id)(m)
    nunggu.delete(m.id)
    return
  }
  if (m.method === 'Network.requestWillBeSent') {
    urls.set(m.params.requestId, m.params.request.url)
  }
  if (m.method === 'Network.loadingFailed') {
    const url = urls.get(m.params.requestId) || '(tidak diketahui)'
    const teks = `${m.params.errorText} ${m.params.blockedReason || ''} ${m.params.type} ${url}`
    // ERR_ABORTED = request dibatalkan (mis. redirect/pindah halaman di tengah
    // jalan), bukan diblokir kebijakan. Tetap dilaporkan, tapi tidak menggagalkan.
    if (m.params.errorText === 'net::ERR_ABORTED' && !m.params.blockedReason) {
      dibatalkan.push(teks.replace(/\s+/g, ' ').trim())
    } else {
      gagal.push(teks.replace(/\s+/g, ' ').trim())
    }
  }
  if (m.method === 'Network.responseReceived') {
    const u = m.params.response.url
    if (u.includes('supabase')) supabase.push(`${m.params.response.status} ${u.split('?')[0]}`)
  }
  if (m.method === 'Log.entryAdded' && m.params.entry.source === 'security') {
    keamanan.push(m.params.entry.text.slice(0, 200))
  }
})

function rpc(method, params = {}, sessionId) {
  const pesan = { id: ++id, method, params }
  if (sessionId) pesan.sessionId = sessionId
  return new Promise((resolve) => {
    nunggu.set(pesan.id, resolve)
    ws.send(JSON.stringify(pesan))
  })
}

const { result: target } = await rpc('Target.createTarget', { url: 'about:blank' })
const { result: att } = await rpc('Target.attachToTarget', {
  targetId: target.targetId,
  flatten: true,
})
const ses = att.sessionId

await rpc('Network.enable', {}, ses)
await rpc('Log.enable', {}, ses)
await rpc('Page.enable', {}, ses)
await rpc('Page.navigate', { url: URL_UJI }, ses)
await tunggu(7000)

const teks = await rpc(
  'Runtime.evaluate',
  {
    expression: 'document.body.innerText.slice(0, 100).replace(/\\s+/g, " ")',
    returnByValue: true,
  },
  ses
)

const ringkas = {
  url: URL_UJI,
  teks: teks.result?.result?.value,
  supabase: [...new Set(supabase)].slice(0, 5),
  requestGagal: [...new Set(gagal)],
  requestDibatalkan: [...new Set(dibatalkan)].slice(0, 5),
  pelanggaranKeamanan: [...new Set(keamanan)],
}
console.log(JSON.stringify(ringkas, null, 2))

ws.close()
chrome.kill('SIGKILL')

if (ringkas.requestGagal.length || ringkas.pelanggaranKeamanan.length) {
  console.error('GAGAL: ada request gagal atau pelanggaran CSP.')
  process.exit(1)
}
console.log('OK: tidak ada request gagal maupun pelanggaran CSP.')
