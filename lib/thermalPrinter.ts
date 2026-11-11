import QRCode from 'qrcode'

export async function cetakTiketThermal(tiket: any) {
  // PRIORITAS UTAMA: JIKA BROWSER MENDUKUNG WEB SERIAL, PAKAI LAPTOP
  if ('serial' in navigator) {
    try {
      const qrUrlForPrint = await QRCode.toDataURL(tiket.kode_tiket, { width: 200, margin: 1 })
      
      const img = new Image()
      img.src = qrUrlForPrint
      await new Promise((resolve) => { img.onload = resolve })
      
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Gagal membuat canvas')
      ctx.drawImage(img, 0, 0)
      
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const widthBytes = Math.ceil(canvas.width / 8)
      const height = canvas.height
      
      let rasterData = `\x1D\x76\x30\x00${String.fromCharCode(widthBytes % 256, Math.floor(widthBytes / 256), height % 256, Math.floor(height / 256))}`
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < widthBytes; x++) {
          let byte = 0
          for (let bit = 0; bit < 8; bit++) {
            const pixelX = x * 8 + bit
            if (pixelX < canvas.width) {
              const idx = (y * canvas.width + pixelX) * 4
              const r = imgData.data[idx]
              const g = imgData.data[idx + 1]
              const b = imgData.data[idx + 2]
              const isBlack = (r + g + b) / 3 < 128
              if (isBlack) {
                byte |= (1 << (7 - bit))
              }
            }
          }
          rasterData += String.fromCharCode(byte)
        }
      }

      const port = await (navigator as any).serial.requestPort()
      await port.open({ baudRate: 9600 })
      
      const encoder = new TextEncoder()
      const writer = port.writable.getWriter()

      const namaPenjual = tiket.petugas_nama || 'Admin'
      const teksFooter = `Perlihatkan e-tiket ke petugas\nLoket : ${namaPenjual}\n`

      let textData = ''
      textData += '\x1B\x40' 
      textData += '\x1B\x33\x05' 
      textData += '\x1B\x4A\x0A' 
      textData += '\x1B\x61\x01' 
      textData += `${tiket.kode_tiket}\n` 
      textData += `${tiket.jadwal}\n`
      textData += '\x1B\x61\x00' 
      textData += '--------------------------------\n'
      textData += `Nama / Kursi : ${tiket.nama_penumpang} / ${tiket.kursi}\n`
      textData += `Kapal        : ${tiket.kapal}\n`
      const jamPotong = tiket.jam.substring(0, 5) 
      textData += `Tgl/Jam      : ${tiket.tanggal}/${jamPotong}\n` 
      textData += '--------------------------------\n'
      textData += '\x1B\x61\x01' 
      textData += `TOTAL: Rp ${tiket.harga.toLocaleString('id-ID')}\n`
      textData += '\x1B\x61\x00' 
      textData += '--------------------------------\n'
      textData += teksFooter

      await writer.write(encoder.encode(textData))
      await writer.write(encoder.encode('\x1B\x61\x01'))

      const imageBytes = new Uint8Array(rasterData.length)
      for (let i = 0; i < rasterData.length; i++) {
        imageBytes[i] = rasterData.charCodeAt(i)
      }
      await writer.write(imageBytes)
      
      // JEDA & CUT
      const endData = '\x1B\x64\x14\x1D\x56\x00' 
      await writer.write(encoder.encode(endData))

      writer.releaseLock()
      await port.close()
      
      return { success: true, message: '✅ Berhasil dikirim ke printer!' }
      
    } catch (err: any) {
      console.error(err)
      return { success: false, message: '❌ Gagal mencetak: ' + (err.message || 'Pastikan printer menyala dan port dipilih.') }
    }
  } 
  
  // JIKA BROWSER TIDAK MENDUKUNG WEB SERIAL (HP), PAKAI BLUETOOTH
  else {
    if (!('bluetooth' in navigator)) {
      alert('Browser Anda tidak mendukung Web Serial maupun Bluetooth. Gunakan Chrome terbaru.')
      return { success: false, message: 'Browser tidak mendukung Web Serial maupun Web Bluetooth.' }
    }

    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2']
      })

      if (!device.gatt) throw new Error('Gagal terhubung ke GATT server.')
      
      const server = await device.gatt.connect()
      
      let service
      try {
        service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb')
      } catch (e) {
        service = await server.getPrimaryService('e7810a71-73ae-499d-8c15-faa9aef0c3f2')
      }

      const characteristics = await service.getCharacteristics()
      const writeCharacteristic = characteristics.find((c: any) => c.properties.write || c.properties.writeWithoutResponse)
      
      if (!writeCharacteristic) throw new Error('Karakteristik printer tidak ditemukan.')

      const qrUrlForPrint = await QRCode.toDataURL(tiket.kode_tiket, { width: 200, margin: 1 })
      const img = new Image()
      img.src = qrUrlForPrint
      await new Promise((resolve) => { img.onload = resolve })
      
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Gagal membuat canvas')
      ctx.drawImage(img, 0, 0)
      
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const widthBytes = Math.ceil(canvas.width / 8)
      const height = canvas.height
      
      let rasterData = `\x1D\x76\x30\x00${String.fromCharCode(widthBytes % 256, Math.floor(widthBytes / 256), height % 256, Math.floor(height / 256))}`
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < widthBytes; x++) {
          let byte = 0
          for (let bit = 0; bit < 8; bit++) {
            const pixelX = x * 8 + bit
            if (pixelX < canvas.width) {
              const idx = (y * canvas.width + pixelX) * 4
              const r = imgData.data[idx]
              const g = imgData.data[idx + 1]
              const b = imgData.data[idx + 2]
              const isBlack = (r + g + b) / 3 < 128
              if (isBlack) {
                byte |= (1 << (7 - bit))
              }
            }
          }
          rasterData += String.fromCharCode(byte)
        }
      }

      const namaPenjual = tiket.petugas_nama || 'Admin'
      const teksFooter = `Perlihatkan e-tiket ke petugas\nLoket : ${namaPenjual}\n`

      let textData = ''
      textData += '\x1B\x40' 
      textData += '\x1B\x33\x05' 
      textData += '\x1B\x4A\x0A' 
      textData += '\x1B\x61\x01' 
      textData += `${tiket.kode_tiket}\n` 
      textData += `${tiket.jadwal}\n`
      textData += '\x1B\x61\x00' 
      textData += '--------------------------------\n'
      textData += `Nama / Kursi : ${tiket.nama_penumpang} / ${tiket.kursi}\n`
      textData += `Kapal        : ${tiket.kapal}\n`
      const jamPotong = tiket.jam.substring(0, 5) 
      textData += `Tgl/Jam      : ${tiket.tanggal}/${jamPotong}\n` 
      textData += '--------------------------------\n'
      textData += '\x1B\x61\x01' 
      textData += `TOTAL: Rp ${tiket.harga.toLocaleString('id-ID')}\n`
      textData += '\x1B\x61\x00' 
      textData += '--------------------------------\n'
      textData += teksFooter

      const encoder = new TextEncoder()
      
      const sendData = async (data: Uint8Array) => {
        const CHUNK_SIZE = 100
        for (let i = 0; i < data.length; i += CHUNK_SIZE) {
          const chunk = data.slice(i, i + CHUNK_SIZE)
          await writeCharacteristic.writeValue(chunk)
          await new Promise(r => setTimeout(r, 10))
        }
      }

      await sendData(encoder.encode(textData))
      await sendData(encoder.encode('\x1B\x61\x01'))

      const imageBytes = new Uint8Array(rasterData.length)
      for (let i = 0; i < rasterData.length; i++) {
        imageBytes[i] = rasterData.charCodeAt(i)
      }
      await sendData(imageBytes)
      
      // JEDA & CUT
      const endData = '\x1B\x64\x14\x1D\x56\x00' 
      await sendData(encoder.encode(endData))

      device.gatt.disconnect()
      
      return { success: true, message: '✅ Berhasil dikirim ke printer Bluetooth!' }
      
    } catch (err: any) {
      console.error(err)
      return { success: false, message: '❌ Gagal mencetak: ' + (err.message || 'Pastikan printer menyala dan izin Bluetooth diberikan.') }
    }
  }
}