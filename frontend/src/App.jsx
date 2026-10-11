import React, { useState, useCallback } from 'react'
import ModeToggle from './components/ModeToggle'
import ThemeToggle from './components/ThemeToggle'
import ListSpotForm from './components/owner/ListSpotForm'
import OwnerDashboard from './components/owner/OwnerDashboard'
import ParkingMap from './components/driver/ParkingMap'
import './index.css'

export default function App() {
  const [mode, setMode] = useState('driver')
  const [ownerRefresh, setOwnerRefresh] = useState(0)

  const handleSpotCreated = useCallback(() => {
    setOwnerRefresh((n) => n + 1)
  }, [])

  return (
    <div className="h-screen bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 flex flex-col font-sans transition-colors duration-200 overflow-hidden">

      {/* ── Top Navigation Bar ── */}
      <header className="bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 flex-shrink-0 z-50 shadow-xs">
        <div className="max-w-7xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white text-sm shadow-sm">
              P
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">EPARK</h1>
                <span className="text-[10px] font-mono tracking-widest uppercase px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 font-semibold">
                  TRL 3 POC
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">P2P Urban Parking Marketplace</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ModeToggle mode={mode} setMode={setMode} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ── Main Viewport ── */}
      <main className="flex-1 flex flex-col h-[calc(100vh-65px)] overflow-hidden">
        {mode === 'owner' ? (
          <div className="max-w-7xl mx-auto w-full px-5 py-6 flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
              <div className="lg:col-span-5">
                <ListSpotForm onCreated={handleSpotCreated} />
              </div>
              <div className="lg:col-span-7">
                <OwnerDashboard refresh={ownerRefresh} />
              </div>
            </div>
          </div>
        ) : (
          <ParkingMap />
        )}
      </main>
    </div>
  )
}
