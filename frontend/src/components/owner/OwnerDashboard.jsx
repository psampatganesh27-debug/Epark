import React, { useEffect, useState } from 'react'
import {
  getSpots,
  getSpotBookings,
  deleteSpot,
  unarchiveSpot,
  resetSpot,
  verifyBooking,
  cancelBooking,
} from '../../api'

const STATUS_STYLE = {
  AVAILABLE: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800',
  RESERVED: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800',
  OCCUPIED: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-800',
  ARCHIVED: 'bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border-slate-300 dark:border-zinc-700',
}

const BOOKING_STYLE = {
  PENDING: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800',
  VERIFIED: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800',
  EXPIRED: 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border-slate-300 dark:border-zinc-700',
  CANCELLED: 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border-slate-300 dark:border-zinc-700',
}

import {
  formatTime12,
  formatDuration,
  timeToMinutes,
  getAvailableSlots,
  formatLocalTime,
} from '../../utils/time'

export default function OwnerDashboard({ refresh }) {
  const [spots, setSpots] = useState([])
  const [activeTab, setActiveTab] = useState('active') // 'active' | 'archived'
  const [expandedId, setExpandedId] = useState(null)
  const [bookingsMap, setBookingsMap] = useState({})
  const [otpInputs, setOtpInputs] = useState({})
  const [otpErrors, setOtpErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      // Fetch all spots including archived so host sees historical earnings
      const data = await getSpots(null, true)
      setSpots(data)
      const newBookingsMap = {}
      for (const s of data) {
        try {
          const bList = await getSpotBookings(s.id)
          newBookingsMap[s.id] = bList
        } catch {
          // ignore
        }
      }
      setBookingsMap(newBookingsMap)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [refresh])

  const toggleExpand = async (spotId) => {
    if (expandedId === spotId) {
      setExpandedId(null)
      return
    }
    setExpandedId(spotId)
    const bookings = await getSpotBookings(spotId)
    setBookingsMap((m) => ({ ...m, [spotId]: bookings }))
  }

  const handleArchive = async (spotId) => {
    if (!confirm('Archive this spot? It will be hidden from drivers, but all historical earnings and bookings will be saved.')) return
    await deleteSpot(spotId)
    load()
  }

  const handleUnarchive = async (spotId) => {
    await unarchiveSpot(spotId)
    load()
  }

  const handleReset = async (spotId) => {
    await resetSpot(spotId)
    load()
    const bookings = await getSpotBookings(spotId)
    setBookingsMap((m) => ({ ...m, [spotId]: bookings }))
  }

  const handleVerify = async (bookingId, spotId) => {
    const otp = otpInputs[bookingId] || ''
    try {
      await verifyBooking(bookingId, otp)
      setOtpErrors((e) => ({ ...e, [bookingId]: '' }))
      const bookings = await getSpotBookings(spotId)
      setBookingsMap((m) => ({ ...m, [spotId]: bookings }))
      load()
    } catch (err) {
      setOtpErrors((e) => ({
        ...e,
        [bookingId]: err.response?.data?.detail || 'Invalid OTP code',
      }))
    }
  }

  const handleCancelBooking = async (bookingId, spotId) => {
    await cancelBooking(bookingId)
    const bookings = await getSpotBookings(spotId)
    setBookingsMap((m) => ({ ...m, [spotId]: bookings }))
    load()
  }

  // Calculate Real-Time Metrics based on exact current clock time across ALL spots (including archived for earnings)
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  let totalEarnings = 0
  let totalVerifiedSessions = 0
  let currentlyOccupiedSpots = 0
  let upcomingBookingsCount = 0

  spots.forEach((spot) => {
    const bList = bookingsMap[spot.id] || []
    let isSpotActiveRightNow = false

    bList.forEach((b) => {
      // Net earnings accumulates all verified stays across current AND archived spots!
      if (b.status === 'VERIFIED') {
        totalVerifiedSessions += 1
        const duration = b.duration_hrs || 1.0
        totalEarnings += spot.price_inr * duration
      }

      // Check active occupancy only for non-archived spots
      if (!spot.is_archived) {
        if (b.status === 'VERIFIED' && b.start_time && b.end_time) {
          const sM = timeToMinutes(b.start_time)
          const eM = timeToMinutes(b.end_time)
          if (currentMinutes >= sM && currentMinutes < eM) {
            isSpotActiveRightNow = true
          }
        } else if (b.status === 'PENDING') {
          upcomingBookingsCount += 1
        }
      }
    })

    if (!spot.is_archived && isSpotActiveRightNow) {
      currentlyOccupiedSpots += 1
    }
  })

  const activeSpots = spots.filter((s) => !s.is_archived)
  const archivedSpots = spots.filter((s) => s.is_archived)
  const displayedSpots = activeTab === 'active' ? activeSpots : archivedSpots

  // Real-time occupancy: strictly 0% if no spot is actively inside a session right now!
  const occupancyRate = spots.length > 0 ? Math.round((currentlyOccupiedSpots / spots.length) * 100) : 0

  return (
    <div className="space-y-5">
      {/* ── High-Contrast Real-Time Telemetry Banner ── */}
      <div className="bg-slate-900 dark:bg-zinc-900 border border-slate-800 dark:border-zinc-800 rounded-2xl p-5 shadow-xs text-white">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800 dark:border-zinc-800">
          <span className="text-[11px] font-mono tracking-widest text-slate-400 uppercase font-bold">
            Real-Time Host Performance Metrics
          </span>
          <span className="text-[11px] text-emerald-400 font-mono font-bold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Live Telemetry
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center sm:text-left">
          <div className="border-r border-slate-800 dark:border-zinc-800 pr-2">
            <p className="text-[11px] text-slate-400 font-medium">Net Realized</p>
            <p className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-white mt-0.5">₹{totalEarnings}</p>
          </div>
          <div className="border-r border-slate-800 dark:border-zinc-800 pr-2">
            <p className="text-[11px] text-slate-400 font-medium">Checked-in</p>
            <p className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-white mt-0.5">{totalVerifiedSessions}</p>
          </div>
          <div className="border-r border-slate-800 dark:border-zinc-800 pr-2">
            <p className="text-[11px] text-slate-400 font-medium">Occupancy Now</p>
            <p className={`text-xl sm:text-2xl font-bold font-mono tracking-tight mt-0.5 ${occupancyRate > 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
              {occupancyRate}%
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-400 font-medium">Upcoming Holds</p>
            <p className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-amber-400 mt-0.5">{upcomingBookingsCount}</p>
          </div>
        </div>
      </div>

      {/* Tabs: Active vs Archived Listings */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-2 pt-1">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'active'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
            }`}
          >
            <span>Active Listings</span>
            <span className="text-[10px] bg-white/20 px-1.5 py-0.2 rounded-full font-mono">
              {activeSpots.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('archived')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'archived'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
            }`}
          >
            <span>Archived</span>
            <span className="text-[10px] bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-300 px-1.5 py-0.2 rounded-full font-mono">
              {archivedSpots.length}
            </span>
          </button>
        </div>
        <span className="text-xs font-mono text-slate-500 dark:text-zinc-400 font-semibold">
          {displayedSpots.length} {activeTab === 'active' ? 'active' : 'archived'} location{displayedSpots.length !== 1 ? 's' : ''}
        </span>
      </div>

      {displayedSpots.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-8 text-center text-slate-500 dark:text-zinc-400 text-xs">
          <p className="font-semibold text-sm">
            {activeTab === 'active' ? 'No active spots registered yet' : 'No archived spots'}
          </p>
          <p className="mt-1">
            {activeTab === 'active'
              ? 'Fill out the listing form to add your first driveway or slot.'
              : 'Spots you archive will appear here, preserving all their booking history and earnings.'}
          </p>
        </div>
      ) : (
        displayedSpots.map((spot) => {
          const bookings = bookingsMap[spot.id] || []
          const isExpanded = expandedId === spot.id

          return (
            <div
              key={spot.id}
              className={`bg-white dark:bg-zinc-900 rounded-2xl border shadow-xs overflow-hidden transition ${
                spot.is_archived
                  ? 'border-dashed border-slate-300 dark:border-zinc-700 opacity-90'
                  : 'border-slate-200 dark:border-zinc-800'
              }`}
            >
              <div className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2.5">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">{spot.title}</h3>
                    <span
                      className={`text-[10px] font-mono tracking-wide px-2 py-0.5 rounded-md border font-bold ${
                        spot.is_archived
                          ? STATUS_STYLE['ARCHIVED']
                          : STATUS_STYLE[spot.status] || 'bg-slate-100'
                      }`}
                    >
                      {spot.is_archived ? 'ARCHIVED' : spot.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-zinc-300 mt-1 font-medium">
                    <span className="font-bold text-slate-900 dark:text-white">₹{spot.price_inr}</span>/hr • {spot.vehicle_type} • Window: <strong className="font-mono text-indigo-600 dark:text-indigo-400">{formatTime12(spot.avail_start)} to {formatTime12(spot.avail_end)}</strong>
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 mt-0.5">
                    GPS: {spot.latitude.toFixed(4)}, {spot.longitude.toFixed(4)}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {!spot.is_archived && (
                    <button
                      onClick={() => handleReset(spot.id)}
                      className="text-xs bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 border border-slate-300 dark:border-zinc-700 px-2.5 py-1.5 rounded-lg font-semibold transition"
                      title="Release and clear all active holds"
                    >
                      Reset
                    </button>
                  )}
                  <button
                    onClick={() => toggleExpand(spot.id)}
                    className="text-xs bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 font-semibold transition"
                  >
                    {isExpanded ? 'Collapse' : `Bookings (${bookings.length})`}
                  </button>
                  {spot.is_archived ? (
                    <button
                      onClick={() => handleUnarchive(spot.id)}
                      className="text-xs bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 border border-emerald-300 dark:border-emerald-800 px-2.5 py-1.5 rounded-lg transition font-bold"
                      title="Restore spot back to active listings"
                    >
                      Restore Listing
                    </button>
                  ) : (
                    <button
                      onClick={() => handleArchive(spot.id)}
                      className="text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 px-2.5 py-1.5 rounded-lg transition font-semibold border border-transparent hover:border-rose-200"
                      title="Archive listing"
                    >
                      Archive
                    </button>
                  )}
                </div>
              </div>

              {/* Bookings expansion drawer */}
              {isExpanded && (
                <div className="bg-slate-50 dark:bg-zinc-800/40 border-t border-slate-200 dark:border-zinc-800 p-4 space-y-3">
                  {/* Operating Window Schedule Overview */}
                  {(() => {
                    const activeSpotBookings = bookings.filter((b) => b.status === 'PENDING' || b.status === 'VERIFIED')
                    const openSlots = getAvailableSlots(spot.avail_start, spot.avail_end, activeSpotBookings)
                    return (
                      <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold font-mono text-[11px] uppercase tracking-wider text-slate-900 dark:text-white">
                            📅 Daily Operating Schedule ({formatTime12(spot.avail_start)} to {formatTime12(spot.avail_end)})
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {openSlots.length > 0 ? `${openSlots.length} open slot(s)` : 'Fully booked'}
                          </span>
                        </div>
                        {openSlots.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            <span className="text-[10px] text-slate-500 font-medium self-center">Open for drivers:</span>
                            {openSlots.map((as, idx) => (
                              <span
                                key={idx}
                                className="text-[11px] font-mono bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-md font-semibold"
                              >
                                🟢 {formatTime12(as.start_time)} to {formatTime12(as.end_time)} ({formatDuration(as.start_time, as.end_time)})
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                            Entire operating window is currently booked by reservations below.
                          </p>
                        )}
                      </div>
                    )
                  })()}

                  {bookings.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No reservation activity for this location.</p>
                  ) : (
                    bookings.map((b) => (
                      <div
                        key={b.id}
                        className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl p-3.5 space-y-2 text-xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-slate-900 dark:text-white">
                                {b.driver_name}, {formatTime12(b.start_time || spot.avail_start)} to {formatTime12(b.end_time || spot.avail_end)} ({formatDuration(b.start_time || spot.avail_start, b.end_time || spot.avail_end)})
                              </span>
                              <span className="font-mono text-xs text-slate-600 dark:text-zinc-400 font-semibold">
                                [{b.vehicle_no}]
                              </span>
                            </div>

                            <div className="mt-1 flex items-center gap-2 flex-wrap">
                              <span className="bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-mono font-bold px-2 py-0.5 rounded text-[11px]">
                                Booking Ref #{b.id} • Rate: ₹{spot.price_inr}/hr • Total: ₹{((b.duration_hrs || 1) * spot.price_inr).toFixed(0)}
                              </span>
                            </div>
                          </div>

                          <span
                            className={`text-[10px] font-mono tracking-wide px-2 py-0.5 rounded border font-bold flex-shrink-0 ${
                              BOOKING_STYLE[b.status] || ''
                            }`}
                          >
                            {b.status}
                          </span>
                        </div>

                        {/* Driver phone contact */}
                        {b.driver_phone && (b.status === 'PENDING' || b.status === 'VERIFIED') && (
                          <div className="bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-lg p-2.5 flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] text-indigo-900 dark:text-indigo-200 font-semibold">
                              Driver Contact: {b.driver_phone}
                            </span>
                            <div className="flex gap-2">
                              <a
                                href={`tel:${b.driver_phone}`}
                                className="px-2.5 py-1 bg-white dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded text-[11px] text-slate-700 dark:text-zinc-300 font-semibold hover:bg-slate-50"
                              >
                                Call
                              </a>
                              <a
                                href={`https://wa.me/91${b.driver_phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                                  `Hello ${b.driver_name}, regarding your EPark booking #${b.id} for slot ${formatTime12(b.start_time || spot.avail_start)} to ${formatTime12(b.end_time || spot.avail_end)} at "${spot.title}"...`
                                )}`}
                                target="_blank"
                                rel="noreferrer"
                                className="px-2.5 py-1 bg-emerald-600 text-white rounded text-[11px] font-semibold hover:bg-emerald-500"
                              >
                                WhatsApp
                              </a>
                            </div>
                          </div>
                        )}

                        {/* OTP Verification box */}
                        {b.status === 'PENDING' && (
                          <div className="pt-2 border-t border-slate-200 dark:border-zinc-800 flex items-center gap-2 flex-wrap">
                            <input
                              value={otpInputs[b.id] || ''}
                              onChange={(e) =>
                                setOtpInputs((x) => ({
                                  ...x,
                                  [b.id]: e.target.value,
                                }))
                              }
                              maxLength={4}
                              placeholder="4-digit OTP"
                              className="w-32 bg-slate-50 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-center font-mono tracking-widest text-slate-900 dark:text-white font-bold focus:outline-none focus:border-indigo-600"
                            />
                            <button
                              onClick={() => handleVerify(b.id, spot.id)}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition shadow-xs"
                            >
                              Verify & Check-In
                            </button>
                            <button
                              onClick={() => handleCancelBooking(b.id, spot.id)}
                              className="text-xs text-rose-600 hover:underline ml-2 font-semibold"
                            >
                              Reject
                            </button>
                            {otpErrors[b.id] && (
                              <p className="text-xs text-rose-600 w-full font-bold mt-1">
                                Notice: {otpErrors[b.id]}
                              </p>
                            )}
                          </div>
                        )}

                        {b.status === 'VERIFIED' && b.verified_at && (
                          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold pt-1">
                            ✓ Verified & checked-in at {formatLocalTime(b.verified_at)}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
