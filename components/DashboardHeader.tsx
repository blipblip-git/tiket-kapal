import React from 'react'

type DashboardHeaderProps = {
  namaPerusahaan: string
  judul: string
  subJudul?: string
  aksi?: React.ReactNode
}

export default function DashboardHeader({ namaPerusahaan, judul, subJudul, aksi }: DashboardHeaderProps) {
  return (
    <div className="bg-white p-4 rounded-xl shadow-md border border-gray-100 mb-4 flex-shrink-0">
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <p className="text-[11px] md:text-xs font-bold uppercase tracking-wide text-gray-500 truncate">
            {namaPerusahaan}
          </p>
          <h1 className="text-lg md:text-xl font-bold text-gray-900 leading-tight mt-0.5">{judul}</h1>
          {subJudul && <p className="text-sm text-gray-600 mt-0.5 font-medium">{subJudul}</p>}
        </div>
        {aksi && <div className="flex items-center gap-2 flex-shrink-0">{aksi}</div>}
      </div>
    </div>
  )
}
