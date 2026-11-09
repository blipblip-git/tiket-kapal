import QRCode from 'qrcode'

// Fungsi untuk menghasilkan perintah ESC/POS berupa byte
function generateEscPosCommand(tiket: any, qrUrl: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.src = qrUrl
    img.onload = () => {
      try {
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

        const encoder = new TextEncoder()
        
        let textData = ''
        textData += '\x1B\x40' // Initialize
        textData += '\x1B\x33\x05' // Line spacing
        textData += '\x1B\x4A\x0A' // Feed
        textData += '\x1B\x61\x01' // Center align
        textData += `${tiket.kode_tiket}\n` 
        textData += `${tiket.jadwal}\n`
        textData += '\x1B\x61\x00' // Left align
        textData += '--------------------------------\n'
        textData += `Nama / Kursi : ${tiket.nama_penumpang} / ${tiket.kursi}\n`
        const nikRapi = tiket.nik.replace(/\*/g, '')
        textData += `NIK          : ${nikRapi}\n`
        textData += `Kapal        : ${tiket.kapal}\n`
        const jamPotong = tiket.jam.substring(0, 5) 
        textData += `Tgl/Jam      : ${tiket.tanggal}/${jamPotong}\n` 
        textData += '--------------------------------\n'
        textData += '\x1B\x61\x01' // Center align
        textData += `TOTAL: Rp ${tiket.harga.toLocaleString('id-ID')}\n`
        textData += '\x1B\x61\x00' // Left align
        textData += '--------------------------------\n'
        textData += 'Tunjukan e-tiket ini ke petugas\n'
        textData += '\x1B\x61\x01' // Center align (for QR)

        const textBytes = encoder.encode(textData)
        
        const imageBytes = new Uint8Array(rasterData.length)
        for (let i = 0; i < rasterData.length; i++) {
          imageBytes[i] = rasterData.charCodeAt(i)
        }
        
        const endData = '\x1B\x4A\x46\x1D\x56\x00' // Cut/feed
        const endBytes = encoder.encode(endData)

        // Gabungkan semua byte
        const totalLength = textBytes.length + imageBytes.length + endBytes.length
        const finalBuffer = new Uint8Array(totalLength)
        finalBuffer.set(textBytes, 0)
        finalBuffer.set(imageBytes, textBytes.length)
        finalBuffer.set(endBytes, textBytes.length + imageBytes.length)

        resolve(finalBuffer)
      } catch (err) {
        reject(err)
      }
    }
    img.onerror = () => reject(new Error('Gagal memuat QR Code'))
  })
}

export async function cetakTiketThermal(tiket: any) {
  try {
    const qrUrl = await QRCode.toDataURL(tiket.kode_tiket, { width: 200, margin: 1 })
    
    // Cek apakah browser mendukung Web Bluetooth
    if (!navigator.bluetooth) {
      return { 
        success: false, 
        message: '❌ Browser Anda tidak mendukung Web Bluetooth. Gunakan Google Chrome versi terbaru.' 
      }
    }

    // Minta user memilih perangkat Bluetooth
    const device = await navigator.bluetooth.requestDevice({
      // Filter service UUID yang umum untuk printer thermal
      filters: [
        { services: ['000018f0-0000-1000-8000-00805f9b34fb'] }, // Printer Service
        { services: ['0000ff00-0000-1000-8000-00805f9b34fb'] },
        { services: ['e7810a71-73ae-499d-8c15-faa9aef0c3f2'] }
      ],
      optionalServices: ['generic_access', 'generic_attribute', 'device_information', 'battery_service']
    }).catch((err: any) => {
      if (err.name === 'NotFoundError') {
        throw new Error('Tidak ada printer yang dipilih atau printer tidak ditemukan.');
      }
      throw err;
    });

    if (!device.gatt) {
      throw new Error('Gagal terhubung ke printer (GATT tidak tersedia).');
    }

    const server = await device.gatt.connect();
    
    // Cari service printer
    let service;
    const serviceUUIDs = ['000018f0-0000-1000-8000-00805f9b34fb', '0000ff00-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2'];
    
    for (const uuid of serviceUUIDs) {
      try {
        service = await server.getPrimaryService(uuid);
        if (service) break;
      } catch (e) {
        // Lanjut cari service lain
      }
    }

    if (!service) {
      throw new Error('Tidak dapat menemukan layanan printer pada perangkat ini.');
    }

    // Cari characteristic untuk menulis data
    const characteristics = await service.getCharacteristics();
    let writeChar = null;
    
    for (const char of characteristics) {
      if (char.properties.write || char.properties.writeWithoutResponse) {
        writeChar = char;
        break;
      }
    }

    if (!writeChar) {
      throw new Error('Tidak dapat menemukan karakteristik untuk mengirim data ke printer.');
    }

    // Generate perintah cetak
    const printData = await generateEscPosCommand(tiket, qrUrl);

    // Kirim data (dipecah per 512 byte agar tidak error)
    const chunkSize = 512;
    for (let i = 0; i < printData.length; i += chunkSize) {
      const chunk = printData.slice(i, i + chunkSize);
      if (writeChar.properties.writeWithoutResponse) {
        await writeChar.writeValueWithoutResponse(chunk);
      } else {
        await writeChar.writeValue(chunk);
      }
      // Jeda sedikit antar chunk agar printer tidak overload
      await new Promise(r => setTimeout(r, 50));
    }

    return { success: true, message: '✅ Berhasil dicetak via Bluetooth!' }

  } catch (err: any) {
    console.error(err)
    
    let pesanError = '❌ Gagal mencetak: ' + (err.message || 'Terjadi kesalahan.')
    
    if (err.name === 'NotFoundError') {
      pesanError = '❌ Printer tidak dipilih atau tidak ditemukan.'
    } else if (err.name === 'SecurityError') {
      pesanError = '❌ Akses Bluetooth ditolak. Pastikan izin Bluetooth diaktifkan.'
    } else if (err.name === 'NetworkError') {
      pesanError = '❌ Koneksi ke printer terputus.'
    }

    return { success: false, message: pesanError }
  }
}