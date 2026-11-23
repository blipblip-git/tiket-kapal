import React from 'react'

type DashboardHeaderProps = {
  namaPerusahaan: string
  judul: string
  subJudul?: string
  aksi?: React.ReactNode
  onRefresh?: () => void
  refreshing?: boolean
}

export default function DashboardHeader({ namaPerusahaan, judul, subJudul, aksi, onRefresh, refreshing }: DashboardHeaderProps) {
  return (
    <div className="bg-white p-4 rounded-xl shadow-md border border-gray-100 mb-4 flex-shrink-0">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] md:text-xs font-bold uppercase tracking-wide text-gray-500 truncate">
            {namaPerusahaan}
          </p>
          <h1 className="text-lg md:text-xl font-bold text-gray-900 leading-tight mt-0.5 break-words">{judul}</h1>
          {subJudul && <p className="text-sm text-gray-600 mt-0.5 font-medium break-words">{subJudul}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 flex-wrap w-full sm:w-auto sm:flex-nowrap sm:flex-shrink-0 [&>button]:whitespace-nowrap">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              title="Muat ulang data"
              aria-label="Muat ulang data"
              className="text-sm bg-gray-100 text-gray-700 border border-gray-300 px-2.5 py-1.5 rounded hover:bg-gray-200 font-bold shadow-sm disabled:opacity-50"
            >
              <span className={refreshing ? 'inline-block animate-spin' : 'inline-block'}>🔄</span>
            </button>
          )}
          {aksi}
        </div>
      </div>
    </div>
  )
}
