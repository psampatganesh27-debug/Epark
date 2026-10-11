import React from 'react'

export default function ModeToggle({ mode, setMode }) {
  return (
    <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700">
      <button
        onClick={() => setMode('driver')}
        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold tracking-wide transition-all ${
          mode === 'driver'
            ? 'bg-indigo-600 text-white shadow-sm'
            : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
        }`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
        Driver
      </button>
      <button
        onClick={() => setMode('owner')}
        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold tracking-wide transition-all ${
          mode === 'owner'
            ? 'bg-indigo-600 text-white shadow-sm'
            : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
        }`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
        Host
      </button>
    </div>
  )
}
