import React, { useState, useCallback } from 'react'
import ModeToggle from './components/ModeToggle'
import ThemeToggle from './components/ThemeToggle'
import ListSpotForm from './components/owner/ListSpotForm'
import OwnerDashboard from './components/owner/OwnerDashboard'
import ParkingMap from './components/driver/ParkingMap'
import AuthModal from './components/auth/AuthModal'
import { useAuth } from './context/AuthContext'
import './index.css'

export default function App() {
  const { user, logout } = useAuth()
  const [mode, setMode] = useState('driver')
  const [ownerRefresh, setOwnerRefresh] = useState(0)
  const [isAuthOpen, setIsAuthOpen] = useState(false)

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
            {/* User Profile / PIN Login Trigger */}
            {user ? (
              <div className="flex items-center gap-2 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700/80 px-2.5 py-1 rounded-xl text-xs">
                <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white font-bold flex items-center justify-center text-[11px]">
                  {user.name.charAt(0).toUpperCase()}
                </span>
                <div className="text-left hidden sm:block">
                  <p className="font-bold text-slate-900 dark:text-white leading-tight text-[11px]">{user.name}</p>
                  <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-mono leading-none">+91 {user.phone}</p>
                </div>
                <button
                  onClick={logout}
                  title="Sign Out"
                  className="ml-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline px-1 cursor-pointer"
                >
                  Logout
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAuthOpen(true)}
                className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <span>🔒 Sign In</span>
                <span className="hidden sm:inline font-normal opacity-90 text-[11px]">(PIN)</span>
              </button>
            )}

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

      {/* ── Auth Modal (PIN Login & Signup) ── */}
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </div>
  )
}

