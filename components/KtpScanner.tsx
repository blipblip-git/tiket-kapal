'use client';

import { useState, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import Tesseract from 'tesseract.js';

interface KtpScannerProps {
  onScanSuccess: (nama: string, nik: string) => void;
}

export default function KtpScanner({ onScanSuccess }: KtpScannerProps) {
  const [mode, setMode] = useState<'pilih' | 'kamera' | 'review' | 'hasil'>('pilih');
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  
  // State untuk hasil OCR yang bisa diedit
  const [hasilNama, setHasilNama] = useState('');
  const [hasilNik, setHasilNik] = useState('');

  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const capture = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      setImage(imageSrc);
      setMode('review');
    }
  }, [webcamRef]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImage(event.target?.result as string);
        setMode('review');
        setError('');
      };
      reader.readAsDataURL(file);
    }
  };

  const processImage = async () => {
    if (!image) return;
    setLoading(true);
    setError('');
    setProgress(0);

    try {
      const result = await Tesseract.recognize(image, 'ind', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProgress(Math.round(m.progress * 100));
          }
        },
      });

      const text = result.data.text;
      console.log('Teks Mentah OCR:', text);

      const textCleaned = text.replace(/[^\d\s]/g, '');
      let nik = '';
      const words = textCleaned.split(/\s+/);
      let longestNum = '';
      
      for (const word of words) {
        if (word.length > longestNum.length && word.length >= 10) {
          longestNum = word;
        }
      }

      if (longestNum.length >= 15) {
        nik = longestNum.substring(0, 16);
      } else {
        const noSpace = text.replace(/[^\d]/g, '');
        const match = noSpace.match(/\d{16}/);
        if (match) nik = match[0];
      }

      let nama = '';
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i].toUpperCase();
        if (line.includes('NAMA')) {
          let extracted = line.replace(/NAMA\s*:?\s*/i, '').trim();
          extracted = extracted.replace(/^[-—|_]+|[-—|_]+$/g, '').trim();
          
          if (extracted.length > 2) {
            nama = extracted;
            break;
          } else if (i + 1 < lines.length) {
            let nextLine = lines[i + 1].toUpperCase().replace(/^[-—|_]+|[-—|_]+$/g, '').trim();
            if (nextLine.length > 2) {
              nama = nextLine;
              break;
            }
          }
        }
      }

      setHasilNama(nama);
      setHasilNik(nik);
      setMode('hasil'); // Pindah ke layar preview hasil OCR

    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan saat membaca KTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleGunakanData = () => {
    onScanSuccess(hasilNama, hasilNik);
    resetAll();
  };

  const resetAll = () => {
    setImage(null);
    setError('');
    setProgress(0);
    setHasilNama('');
    setHasilNik('');
    setMode('pilih');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="border border-gray-300 rounded-lg p-4 bg-gray-50">
      <h3 className="text-sm font-medium text-gray-700 mb-2">Scan KTP</h3>
      
      <input
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        ref={fileInputRef}
        className="hidden"
      />

      {mode === 'pilih' && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setMode('kamera')}
            className="w-full py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 flex items-center justify-center gap-2"
          >
            📷 Buka Kamera
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-3 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 flex items-center justify-center gap-2"
          >
            🖼️ Pilih dari Galeri
          </button>
        </div>
      )}

      {mode === 'kamera' && (
        <div className="space-y-3">
          <div className="relative rounded-md overflow-hidden bg-black flex justify-center">
            <Webcam
              audio={false}
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              videoConstraints={{ facingMode: 'environment' }}
              className="w-full h-auto max-h-64 object-cover"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={capture}
              className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700"
            >
              Ambil Gambar
            </button>
            <button
              type="button"
              onClick={() => setMode('pilih')}
              className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {mode === 'review' && image && (
        <div className="space-y-4">
          <img src={image} alt="Preview KTP" className="w-full h-auto max-h-48 object-contain rounded-md border bg-white" />
          
          <p className="text-xs text-gray-500 text-center">
            Pastikan KTP terlihat jelas, tidak silau, dan angka NIK terbaca.
          </p>

          {error && <p className="text-xs text-red-500 text-center">{error}</p>}

          {loading ? (
            <div className="text-center">
              <p className="text-sm text-blue-600 font-medium mb-1">Membaca KTP... {progress}%</p>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${progress}%` }}></div>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={processImage}
                type="button"
                className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
              >
                Proses KTP
              </button>
              <button
                onClick={resetAll}
                type="button"
                className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Ulangi
              </button>
            </div>
          )}
        </div>
      )}

      {/* LAYAR HASIL OCR (BISA DIEDIT) */}
      {mode === 'hasil' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 p-3 rounded-md">
            <p className="text-xs text-blue-800 mb-2">
              <b>Hasil Scan Mesin (Cek Kembali):</b><br/>
              Silakan koreksi jika ada angka/huruf yang salah baca.
            </p>
            
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nama</label>
                <input
                  type="text"
                  value={hasilNama}
                  onChange={(e) => setHasilNama(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Nama tidak terbaca"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">NIK (16 Digit)</label>
                <input
                  type="text"
                  maxLength={16}
                  value={hasilNik}
                  onChange={(e) => setHasilNik(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="NIK tidak terbaca"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleGunakanData}
              type="button"
              className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700"
            >
              ✓ Gunakan Data Ini
            </button>
            <button
              onClick={resetAll}
              type="button"
              className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Ulangi Foto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}