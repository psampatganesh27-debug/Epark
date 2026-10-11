import React, { useState, useEffect } from 'react'
import { createBooking } from '../../api'
import {
  formatTime12,
  formatDuration,
  timeToMinutes,
  minutesToTime,
  getAvailableSlots,
  parseUtcDate,
} from '../../utils/time'

const AMENITY_MAP = {
  covered: 'Covered Roof',
  ev: 'EV Fast Charging',
  cctv: 'CCTV Monitored',
  gated: 'Gated Security',
}

function whatsappLink(phone, message) {
  const cleaned = phone.replace(/\D/g, '')
  const india = cleaned.startsWith('91') ? cleaned : `91${cleaned}`
  const encoded = encodeURIComponent(message)
  return `https://wa.me/${india}?text=${encoded}`
}

function navLink(lat, lng, label) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=${encodeURIComponent(label)}`
}

export default function SpotCard({ spot, onClose, onBooked }) {
  const [driverName, setDriverName] = useState('')
  const [driverPhone, setDriverPhone] = useState('')
  const [vehicleNo, setVehicleNo] = useState('')
  
  const bookedSlots = spot.booked_slots || []
  const availableSlots = getAvailableSlots(spot.avail_start, spot.avail_end, bookedSlots)

  // Smart initial time defaults from first open slot if available
  const initialSlot = availableSlots.length > 0 ? availableSlots[0] : null
  const defaultStart = initialSlot ? initialSlot.start_time : (spot.avail_start || '08:00')
  const defaultEnd = initialSlot
    ? minutesToTime(Math.min(timeToMinutes(initialSlot.start_time) + 60, timeToMinutes(initialSlot.end_time)))
    : minutesToTime(Math.min(timeToMinutes(spot.avail_start || '08:00') + 60, timeToMinutes(spot.avail_end || '18:00')))

  // Exact From Time and To Time entered directly by driver (No slider)
  const [startTime, setStartTime] = useState(defaultStart)
  const [endTime, setEndTime] = useState(defaultEnd)
  
  const [booking, setBooking] = useState(null)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [timeLeft, setTimeLeft] = useState(null)
  const [showReceipt, setShowReceipt] = useState(false)

  const startMins = timeToMinutes(startTime)
  const endMins = timeToMinutes(endTime)
  const diffMins = Math.max(0, endMins - startMins)
  const calculatedHours = diffMins / 60.0
  const calculatedTotal = (spot.price_inr * calculatedHours).toFixed(0)

  const hostStartMins = timeToMinutes(spot.avail_start)
  const hostEndMins = timeToMinutes(spot.avail_end)

  // Current clock time for today
  const now = new Date()
  const currentClockMins = now.getHours() * 60 + now.getMinutes()
  const isPastStartTime = startMins < currentClockMins - 5 // 5 min grace leeway

  // Check if requested slot collides with any already booked slots
  const conflictingSlot = bookedSlots.find((slot) => {
    const sM = timeToMinutes(slot.start_time)
    const eM = timeToMinutes(slot.end_time)
    return Math.max(startMins, sM) < Math.min(endMins, eM)
  })

  const isExceedingHostWindow = endMins > hostEndMins || startMins < hostStartMins
  const isInvalidInterval = endMins <= startMins

  useEffect(() => {
    if (!booking || !booking.expires_at) return

    const updateTimer = () => {
      const now = new Date().getTime()
      const expiryDate = parseUtcDate(booking.expires_at)
      const expiry = expiryDate ? expiryDate.getTime() : 0
      const diff = expiry - now

      if (diff <= 0) {
        setTimeLeft('Hold Expired')
        return
      }

      // Check if slot starts in the future today
      if (booking.start_time) {
        const [sh, sm] = booking.start_time.split(':').map(Number)
        const slotStart = new Date()
        slotStart.setHours(sh, sm, 0, 0)
        
        if (now < slotStart.getTime()) {
          const untilStartMs = slotStart.getTime() - now
          const m = Math.floor(untilStartMs / 60000)
          const s = Math.floor((untilStartMs % 60000) / 1000)
          setTimeLeft(`Slot starts in ${m > 60 ? `${Math.floor(m/60)}h ` : ''}${m % 60}m (15-min check-in grace period)`)
          return
        }
      }

      // Inside the check-in window: countdown until grace period expires
      const m = Math.floor(diff / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setTimeLeft(`Check-in closes in ${m}m ${s < 10 ? '0' : ''}${s}s`)
    }

    updateTimer()
    const timer = setInterval(updateTimer, 1000)
    return () => clearInterval(timer)
  }, [booking])

  const handleBook = async () => {
    if (!driverName.trim() || !vehicleNo.trim()) {
      setError('Please enter your name and vehicle registration plate.')
      return
    }
    if (isInvalidInterval) {
      setError('End time must be later than start time.')
      return
    }
    if (isPastStartTime) {
      setError(`Cannot book in the past: Start time must be from ${formatTime12(minutesToTime(currentClockMins))} onwards today.`)
      return
    }
    if (isExceedingHostWindow) {
      setError(`Your requested time (${formatTime12(startTime)} – ${formatTime12(endTime)}) is outside the host's operating window (${formatTime12(spot.avail_start)} – ${formatTime12(spot.avail_end)}).`)
      return
    }
    if (conflictingSlot) {
      setError(`Cannot book: this slot overlaps with an existing reservation (${formatTime12(conflictingSlot.start_time)} to ${formatTime12(conflictingSlot.end_time)}).`)
      return
    }

    setError('')
    setLoading(true)
    try {
      const result = await createBooking({
        spot_id: spot.id,
        driver_name: driverName.trim(),
        driver_phone: driverPhone.trim() || null,
        vehicle_no: vehicleNo.trim().toUpperCase(),
        start_time: startTime,
        end_time: endTime,
        duration_hrs: parseFloat(calculatedHours.toFixed(2)),
      })
      setBooking(result)
      setShowSuccessModal(true)
      onBooked()
    } catch (err) {
      if (err.response?.status === 409) {
        setError('Slot was just booked by another driver for this time window!')
      } else {
        setError(err.response?.data?.detail || 'Booking request failed.')
      }
    } finally {
      setLoading(false)
    }
  }

  const amenitiesList = (spot.amenities || '').split(',').filter(Boolean)

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-900 overflow-y-auto animate-in fade-in duration-200 relative">

      {/* ── Prominent Booking Confirmation Dialogue Modal ── */}
      {showSuccessModal && booking && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200 text-center space-y-4">
            <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-950/80 rounded-2xl flex items-center justify-center mx-auto text-2xl shadow-inner border border-emerald-300 dark:border-emerald-700">
              🎉
            </div>
            
            <div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white">
                Booking Confirmed!
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                Your spot has been reserved for:
              </p>
              <div className="mt-1 font-mono font-bold text-sm text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 py-1 px-3 rounded-lg inline-block">
                {formatTime12(booking.start_time)} – {formatTime12(booking.end_time)} ({formatDuration(booking.start_time, booking.end_time)})
              </div>
            </div>

            {/* Check-In OTP Box */}
            <div className="bg-slate-50 dark:bg-zinc-950 border-2 border-indigo-500/40 rounded-2xl p-4 shadow-sm">
              <span className="text-[11px] font-mono tracking-widest text-indigo-600 dark:text-indigo-400 uppercase font-bold block">
                Your Check-In OTP
              </span>
              <div className="my-2 text-4xl font-black font-mono tracking-[0.35em] text-slate-900 dark:text-white">
                {booking.otp}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                Share this 4-digit code with the owner upon arrival to complete check-in.
              </p>
            </div>

            <div className="text-xs text-slate-600 dark:text-zinc-400 font-medium">
              Booking Ref #{booking.id} • Vehicle: {booking.vehicle_no}
            </div>

            {/* Navigation and Dismiss buttons */}
            <div className="space-y-2 pt-2">
              <a
                href={navLink(spot.latitude, spot.longitude, spot.title)}
                target="_blank"
                rel="noreferrer"
                className="w-full inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition text-xs shadow-md"
              >
                🗺️ Navigate to Spot in Google Maps
              </a>
              <button
                onClick={() => setShowSuccessModal(false)}
                className="w-full bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 font-bold py-2.5 rounded-xl transition text-xs"
              >
                Got It &bull; View Active Pass
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="p-4 border-b border-slate-200 dark:border-zinc-800 flex items-start justify-between bg-slate-50 dark:bg-zinc-900/60 sticky top-0 z-10">
        <div>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${
              spot.status === 'AVAILABLE' ? 'bg-emerald-500' : spot.status === 'RESERVED' ? 'bg-amber-500' : 'bg-rose-500'
            }`} />
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-zinc-400 font-bold">
              {spot.status}
            </span>
          </div>
          <h3 className="font-bold text-base text-slate-900 dark:text-white mt-1 leading-snug">{spot.title}</h3>
          <p className="text-xs font-mono text-slate-500 dark:text-zinc-400 mt-0.5">
            GPS: {spot.latitude.toFixed(4)}, {spot.longitude.toFixed(4)}
          </p>
        </div>
        <button
          onClick={onClose}
          title="Back to all listings"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-200 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 transition font-bold text-lg"
        >
          &times;
        </button>
      </div>

      {/* ── Content Body ── */}
      <div className="p-4 flex-1 space-y-4">
        {/* Amenities */}
        {amenitiesList.length > 0 && (
          <div>
            <p className="text-[10px] uppercase font-mono tracking-wider text-slate-500 dark:text-zinc-400 font-bold mb-1.5">Amenities</p>
            <div className="flex flex-wrap gap-1.5">
              {amenitiesList.map((a) => (
                <span
                  key={a}
                  className="text-xs bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-zinc-700 font-medium"
                >
                  {AMENITY_MAP[a] || a}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Pricing Specs */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl p-2.5 text-center">
            <span className="text-[10px] uppercase font-mono text-slate-500 dark:text-zinc-400 font-semibold">Rate</span>
            <p className="font-bold text-sm text-slate-900 dark:text-white mt-0.5">₹{spot.price_inr}</p>
            <span className="text-[10px] text-slate-400">/hr</span>
          </div>
          <div className="bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl p-2.5 text-center">
            <span className="text-[10px] uppercase font-mono text-slate-500 dark:text-zinc-400 font-semibold">Vehicle</span>
            <p className="font-bold text-sm text-slate-900 dark:text-white mt-0.5">{spot.vehicle_type}</p>
            <span className="text-[10px] text-slate-400">allowed</span>
          </div>
          <div className="bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl p-2.5 text-center">
            <span className="text-[10px] uppercase font-mono text-slate-500 dark:text-zinc-400 font-semibold">Host Window</span>
            <p className="font-bold text-xs text-slate-900 dark:text-white mt-0.5">{formatTime12(spot.avail_start)}</p>
            <span className="text-[10px] text-slate-400">to {formatTime12(spot.avail_end)}</span>
          </div>
        </div>

        {/* Clear Booked vs Available Slots Schedule */}
        <div className="bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl p-3.5 text-xs space-y-3">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-zinc-700">
            <span className="font-bold text-slate-900 dark:text-white text-[11px] uppercase tracking-wider font-mono">
              📅 Today's Slot Schedule
            </span>
            <span className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono">
              Host window: {formatTime12(spot.avail_start)} to {formatTime12(spot.avail_end)}
            </span>
          </div>

          {/* Reserved / Booked slots */}
          {bookedSlots.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 font-mono block">
                ❌ Reserved Slots:
              </span>
              {bookedSlots.map((bs, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 font-mono text-[11px]"
                >
                  <span className="font-bold text-amber-950 dark:text-amber-200">
                    {bs.driver_name || 'Driver'}, {formatTime12(bs.start_time)} to {formatTime12(bs.end_time)}
                  </span>
                  <span className="text-amber-800 dark:text-amber-400 text-[10px] font-sans font-semibold">
                    ({formatDuration(bs.start_time, bs.end_time)})
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Open / Available slots */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-mono block">
              ✅ Available Slots to Book:
            </span>
            {availableSlots.length === 0 ? (
              <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-850 dark:text-amber-300 font-medium text-[11px]">
                {currentClockMins >= hostEndMins
                  ? `🌙 Operating window ended for today (${formatTime12(spot.avail_start)} to ${formatTime12(spot.avail_end)}). Next availability tomorrow.`
                  : '❌ No open slots remaining in the operating window today.'}
              </div>
            ) : (
              availableSlots.map((as, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    setStartTime(as.start_time)
                    setEndTime(as.end_time)
                  }}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800/60 font-mono text-[11px] cursor-pointer transition shadow-2xs"
                  title="Click to automatically fill this window into the booking form"
                >
                  <span className="font-bold text-emerald-950 dark:text-emerald-200 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Available: {formatTime12(as.start_time)} to {formatTime12(as.end_time)}
                  </span>
                  <span className="text-emerald-700 dark:text-emerald-400 text-[10px] font-sans font-semibold flex items-center gap-1">
                    ({formatDuration(as.start_time, as.end_time)})
                    <span className="underline font-bold text-emerald-800 dark:text-emerald-300 ml-1">Select &rarr;</span>
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {spot.owner_label && (
          <div className="bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl p-3 text-xs text-slate-700 dark:text-zinc-300">
            <span className="font-bold text-slate-500 dark:text-zinc-400 block text-[10px] uppercase font-mono mb-0.5">Host Notes</span>
            &ldquo;{spot.owner_label}&rdquo;
          </div>
        )}

        {/* ── Booking Form or Result ── */}
        {!booking ? (
          <div className="space-y-3 pt-1">
            <div>
              <label className="block text-xs font-bold text-slate-800 dark:text-zinc-200 mb-1 uppercase tracking-wider text-[11px]">
                Your Name *
              </label>
              <input
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-600 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 dark:text-zinc-200 mb-1 uppercase tracking-wider text-[11px]">
                Vehicle Registration Plate *
              </label>
              <input
                value={vehicleNo}
                onChange={(e) => setVehicleNo(e.target.value)}
                placeholder="e.g. KA01AB1234"
                className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs font-mono uppercase text-slate-900 dark:text-white focus:outline-none focus:border-indigo-600 transition"
              />
            </div>

            {/* Direct Time Input Controls (No Slider!) */}
            <div className="bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl p-3.5 space-y-3">
              <span className="text-[11px] font-mono tracking-wider font-bold text-slate-900 dark:text-white uppercase block">
                Select Your Parking Time Window
              </span>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                    From (Start Time) *
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-lg px-2.5 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-600"
                  />
                  <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
                    {formatTime12(startTime)}
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                    To (End Time) *
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-lg px-2.5 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:border-indigo-600"
                  />
                  <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
                    {formatTime12(endTime)}
                  </span>
                </div>
              </div>

              {/* Dynamic Calculation Summary */}
              <div className="pt-2 border-t border-slate-200 dark:border-zinc-700 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-500 block text-[11px]">Selected Duration:</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                    {diffMins > 0 ? formatDuration(startTime, endTime) : 'Invalid Window'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 block text-[11px]">Estimated Cost:</span>
                  <span className="font-bold text-base font-mono text-slate-900 dark:text-white">
                    ₹{calculatedTotal}
                  </span>
                </div>
              </div>
            </div>

            {/* Contact Phone */}
            <div>
              <label className="block text-xs font-bold text-slate-800 dark:text-zinc-200 mb-1 uppercase tracking-wider text-[11px]">
                Your Phone (Shared with Host Post-Booking)
              </label>
              <input
                value={driverPhone}
                onChange={(e) => setDriverPhone(e.target.value)}
                placeholder="e.g. 9845012345"
                type="tel"
                className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-indigo-600 transition"
              />
            </div>

            {/* Conflict Warnings */}
            {isPastStartTime && (
              <div className="text-xs text-rose-600 font-bold bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 p-2.5 rounded-lg">
                ⚠ Cannot book in the past. Start time must be from {formatTime12(minutesToTime(currentClockMins))} onwards today.
              </div>
            )}

            {conflictingSlot && (
              <div className="text-xs text-rose-600 font-bold bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 p-2.5 rounded-lg">
                ⚠ Overlap detected: This spot is already reserved from {formatTime12(conflictingSlot.start_time)} to {formatTime12(conflictingSlot.end_time)}.
              </div>
            )}

            {isExceedingHostWindow && (
              <div className="text-xs text-rose-600 font-bold bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 p-2.5 rounded-lg">
                ⚠ Selected hours must be within host window ({formatTime12(spot.avail_start)} to {formatTime12(spot.avail_end)}).
              </div>
            )}

            {isInvalidInterval && (
              <div className="text-xs text-rose-600 font-bold bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 p-2.5 rounded-lg">
                ⚠ End time must be later than start time.
              </div>
            )}

            {error && (
              <div className="text-xs text-rose-600 font-bold bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 p-2.5 rounded-lg">
                {error}
              </div>
            )}

            <button
              onClick={handleBook}
              disabled={loading || !!conflictingSlot || isExceedingHostWindow || isInvalidInterval || isPastStartTime}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition text-xs shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Reserving slot…' : `Reserve ${formatTime12(startTime)} – ${formatTime12(endTime)} (₹${calculatedTotal})`}
            </button>
          </div>
        ) : (

          /* ── Persistent Pass Card ── */
          <div className="space-y-3 pt-1">
            <div className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 rounded-2xl p-4 text-center">
              <span className="text-xs font-mono font-bold tracking-widest text-emerald-700 dark:text-emerald-400 uppercase">
                ✓ Booking Confirmed!
              </span>

              {timeLeft && (
                <p className="text-xs font-mono text-amber-700 dark:text-amber-400 font-semibold mt-1">
                  Hold window: <span className="bg-amber-100 dark:bg-amber-950/70 px-1.5 py-0.5 rounded border border-amber-300 dark:border-amber-800">{timeLeft}</span>
                </p>
              )}

              <p className="text-xs text-slate-600 dark:text-zinc-400 mt-2">
                Reserved Slot: <strong className="text-slate-900 dark:text-white font-mono">{formatTime12(booking.start_time)} – {formatTime12(booking.end_time)}</strong>
              </p>

              <p className="text-xs text-slate-500 mt-1">Provide this Check-In OTP to the host:</p>
              <div className="my-2 bg-white dark:bg-zinc-950 border-2 border-indigo-500/50 rounded-xl py-3 shadow-xs">
                <span className="text-3xl font-mono font-black tracking-[0.4em] text-slate-900 dark:text-white">
                  {booking.otp}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono">
                Booking Ref #{booking.id} • Vehicle: {booking.vehicle_no}
              </p>
            </div>

            {/* Digital Pass Button */}
            <button
              onClick={() => setShowReceipt(!showReceipt)}
              className="w-full text-xs font-bold py-2 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 border border-slate-300 dark:border-zinc-700 rounded-xl transition"
            >
              {showReceipt ? 'Hide Pass' : '📄 View Digital Parking Pass'}
            </button>

            {showReceipt && (
              <div className="bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xl p-3 text-xs space-y-1.5 font-mono text-slate-800 dark:text-zinc-300">
                <div className="flex justify-between border-b border-slate-200 dark:border-zinc-800 pb-1 font-bold">
                  <span>EPARK TICKET</span>
                  <span className="text-emerald-600 dark:text-emerald-400">CONFIRMED</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Location:</span>
                  <span className="truncate max-w-[170px] font-semibold">{spot.title}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Vehicle:</span>
                  <span>{booking.vehicle_no}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Slot Window:</span>
                  <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                    {formatTime12(booking.start_time)} – {formatTime12(booking.end_time)} ({formatDuration(booking.start_time, booking.end_time)})
                  </span>
                </div>
                <div className="flex justify-between text-xs pt-1 border-t border-slate-200 dark:border-zinc-800 font-bold">
                  <span>Total Amount:</span>
                  <span>₹{(booking.duration_hrs * spot.price_inr).toFixed(0)}</span>
                </div>
              </div>
            )}

            {/* Host Contact Details */}
            {(spot.owner_name || spot.owner_phone) && (
              <div className="bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl p-3 space-y-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-bold block">
                  Host Contact Card
                </span>
                {spot.owner_name && (
                  <p className="text-xs text-slate-800 dark:text-zinc-200 font-bold">{spot.owner_name}</p>
                )}
                {spot.owner_phone && (
                  <div className="flex gap-2 pt-0.5">
                    <a
                      href={`tel:${spot.owner_phone}`}
                      className="flex-1 text-center text-xs bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 text-slate-800 dark:text-zinc-200 py-1.5 rounded-lg hover:bg-slate-100 font-semibold transition"
                    >
                      Call Host
                    </a>
                    <a
                      href={whatsappLink(
                        spot.owner_phone,
                        `Hello! I have booked your spot "${spot.title}" on EPark from ${formatTime12(booking.start_time)} to ${formatTime12(booking.end_time)} (Ref #${booking.id}). Vehicle: ${booking.vehicle_no}.`
                      )}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 text-center text-xs bg-emerald-600 text-white py-1.5 rounded-lg hover:bg-emerald-500 font-semibold transition"
                    >
                      WhatsApp
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Navigation button */}
            <a
              href={navLink(spot.latitude, spot.longitude, spot.title)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 w-full bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl transition text-xs shadow-xs"
            >
              🗺️ Open Route in Google Maps &rarr;
            </a>

            <button
              onClick={onClose}
              className="w-full text-xs text-slate-500 dark:text-zinc-400 hover:underline pt-1 font-semibold"
            >
              &larr; Back to Listings
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
