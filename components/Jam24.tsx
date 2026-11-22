'use client'

// Input jam 24 jam (00:00 – 23:59) tanpa AM/PM.
// Dipakai di Manajemen Jadwal & Pengaturan petugas. Nilai yang dikirim ke parent
// selalu berformat "HH:MM" (contoh "15:00"), sama seperti input type="time".
// Alasan dibuat: input type="time" mengikuti bahasa browser (AM/PM) sehingga
// pengisian jam jadi membingungkan.

type Props = {
  value: string
  onChange: (nilai: string) => void
  required?: boolean
  disabled?: boolean
  ariaLabel?: string
}

const DAFTAR_JAM = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const DAFTAR_MENIT = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

export default function Jam24({ value, onChange, required, disabled, ariaLabel }: Props) {
  // Terima "07:00", "07:00:00", atau "07.00" dari database/data lama.
  const bersih = String(value || '').trim().slice(0, 5).replace('.', ':')
  const cocok = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(bersih)
  const jam = cocok ? cocok[1] : ''
  const menit = cocok ? cocok[2] : '00'

  const ubahJam = (j: string) => onChange(j ? `${j}:${menit}` : '')
  const ubahMenit = (m: string) => onChange(jam ? `${jam}:${m}` : '')

  const kelasSelect =
    'border rounded-md px-2 py-2 text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500'

  return (
    <div className="flex items-center gap-1">
      <select
        value={jam}
        onChange={(e) => ubahJam(e.target.value)}
        required={required}
        disabled={disabled}
        aria-label={ariaLabel ? `${ariaLabel} (jam)` : 'Jam'}
        className={kelasSelect}
      >
        <option value="">--</option>
        {DAFTAR_JAM.map((j) => (
          <option key={j} value={j}>
            {j}
          </option>
        ))}
      </select>

      <span className="font-bold text-gray-700">:</span>

      <select
        value={menit}
        onChange={(e) => ubahMenit(e.target.value)}
        disabled={disabled || !jam}
        aria-label={ariaLabel ? `${ariaLabel} (menit)` : 'Menit'}
        className={`${kelasSelect} disabled:bg-gray-100 disabled:text-gray-400`}
      >
        {DAFTAR_MENIT.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      <span className="text-xs text-gray-500 ml-1">WITA (24 jam)</span>
    </div>
  )
}
