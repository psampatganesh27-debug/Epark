import React, { useState } from 'react'
import { useAuth } from '../../context/AuthContext'

export default function AuthModal({ isOpen, onClose }) {
  const { login, register } = useAuth()
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [showPin, setShowPin] = useState(false)

  // Form states
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [name, setName] = useState('')
  const [vehicleNo, setVehicleNo] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const cleanPhone = phone.replace(/\D/g, '')
    if (cleanPhone.length < 10) {
      setError('Please enter a valid 10-digit mobile number.')
      return
    }

    const cleanPin = pin.trim()
    if (!cleanPin.match(/^\d{4}$/) && !cleanPin.match(/^\d{6}$/)) {
      setError('PIN must be exactly 4 or 6 numeric digits (e.g. 1234 or 123456).')
      return
    }

    setLoading(true)
    try {
      if (mode === 'login') {
        await login(cleanPhone, cleanPin)
      } else {
        if (!name.trim()) {
          setError('Please enter your full name.')
          setLoading(false)
          return
        }
        await register({
          phone: cleanPhone,
          name: name.trim(),
          pin: cleanPin,
          default_vehicle_no: vehicleNo.trim().toUpperCase() || null,
        })
      }
      onClose()
    } catch (err) {
      setError(err.response?.data?.detail || 'Authentication failed. Please check your details.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div
        className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-full transition"
        >
          ✕
        </button>

        {/* Brand Header */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-600 text-white font-mono font-bold text-xl mb-2 shadow-md">
            P
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {mode === 'login' ? 'Sign In with PIN' : 'Create EPark Account'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            {mode === 'login'
              ? 'Enter your mobile number & security PIN'
              : 'Register to manage your parking passes & spots'}
          </p>
        </div>

        {/* Tab switcher */}
        <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-zinc-800 rounded-xl mb-4 border border-slate-200 dark:border-zinc-700/60 text-xs font-semibold">
          <button
            onClick={() => {
              setMode('login')
              setError('')
            }}
            className={`py-1.5 rounded-lg transition ${
              mode === 'login'
                ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-zinc-400'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => {
              setMode('register')
              setError('')
            }}
            className={`py-1.5 rounded-lg transition ${
              mode === 'register'
                ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-zinc-400'
            }`}
          >
            Register
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 text-xs font-medium bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 p-2.5 rounded-xl">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} autoComplete="off" className="space-y-3.5">
          {mode === 'register' && (
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                Full Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                required
                autoComplete="off"
                className="w-full bg-slate-50 dark:bg-zinc-800/80 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-600 transition"
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
              Mobile Number *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-xs text-slate-400 font-mono">+91</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="9876543210"
                required
                autoComplete="off"
                className="w-full bg-slate-50 dark:bg-zinc-800/80 border border-slate-300 dark:border-zinc-700 rounded-xl pl-10 pr-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-indigo-600 transition"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider">
                {mode === 'register' ? 'Set Security PIN (4 or 6 Digits) *' : 'Security PIN *'}
              </label>
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium cursor-pointer"
              >
                {showPin ? 'Hide' : 'Show'}
              </button>
            </div>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              name="security_pin"
              id="security_pin"
              autoComplete="one-time-code"
              data-lpignore="true"
              data-form-type="other"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••"
              required
              style={{
                WebkitTextSecurity: showPin ? 'none' : 'disc',
                MozTextSecurity: showPin ? 'none' : 'circle',
                textSecurity: showPin ? 'none' : 'disc',
              }}
              className="w-full bg-slate-50 dark:bg-zinc-800/80 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-center text-sm font-mono tracking-widest text-slate-900 dark:text-white focus:outline-none focus:border-indigo-600 transition"
            />
            <span className="block text-[10px] text-slate-400 mt-1">
              {mode === 'register' ? 'Choose any 4 or 6 numeric digits' : 'Enter your 4 or 6-digit login PIN'}
            </span>
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                Default Vehicle Plate <span className="text-slate-400 font-normal lowercase">(optional)</span>
              </label>
              <input
                type="text"
                value={vehicleNo}
                onChange={(e) => setVehicleNo(e.target.value)}
                placeholder="e.g. JH05A1211"
                className="w-full bg-slate-50 dark:bg-zinc-800/80 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs font-mono uppercase text-slate-900 dark:text-white focus:outline-none focus:border-indigo-600 transition"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-xs transition shadow-md disabled:opacity-50"
          >
            {loading ? 'Processing…' : mode === 'login' ? 'Sign In with PIN' : 'Create Account & Sign In'}
          </button>
        </form>

        {/* Footer info */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-zinc-800 text-center">
          <p className="text-[11px] text-slate-500 dark:text-zinc-400">
            {mode === 'login' ? (
              <>
                Don&apos;t have an account yet?{' '}
                <button
                  onClick={() => {
                    setMode('register')
                    setError('')
                  }}
                  className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Register here
                </button>
              </>
            ) : (
              <>
                Already registered?{' '}
                <button
                  onClick={() => {
                    setMode('login')
                    setError('')
                  }}
                  className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Sign in with PIN
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
