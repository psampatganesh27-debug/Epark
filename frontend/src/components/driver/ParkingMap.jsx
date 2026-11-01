import React, { useEffect, useState, useCallback, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { getSpots, getMyBookings } from '../../api'
import SpotCard from './SpotCard'
import { useTheme } from '../../context/ThemeContext'
import { useAuth } from '../../context/AuthContext'
import { formatTime12, getAvailableSlots, timeToMinutes, getSpotVisibilityStatus, formatDuration } from '../../utils/time'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const AMENITY_MAP = {
  covered: 'Covered',
  ev: 'EV Charging',
  cctv: 'CCTV',
  gated: 'Gated',
}

function makeIcon(color, isHighlighted = false) {
  const size = isHighlighted ? 32 : 24
  const border = isHighlighted ? '3px solid #4f46e5' : '2px solid #ffffff'
  const shadow = isHighlighted ? '0 0 16px rgba(79, 70, 229, 0.8)' : '0 4px 10px rgba(0,0,0,0.3)'

  return L.divIcon({
    className: '',
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 50% 50% 50% 0;
        background: ${color};
        border: ${border};
        box-shadow: ${shadow};
        transform: rotate(-45deg);
        cursor: pointer;
        transition: all 0.2s ease-in-out;
      "></div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  })
}

const ICONS = {
  AVAILABLE: makeIcon('#10b981'),  // Emerald
  RESERVED: makeIcon('#f59e0b'),   // Amber
  OCCUPIED: makeIcon('#ef4444'),   // Rose
}

const HIGHLIGHTED_ICONS = {
  AVAILABLE: makeIcon('#10b981', true),
  RESERVED: makeIcon('#f59e0b', true),
  OCCUPIED: makeIcon('#ef4444', true),
}

function MapController({ center, zoom, spots }) {
  const map = useMap()
  const hasFittedBoundsRef = useRef(false)

  useEffect(() => {
    if (center) {
      map.flyTo(center, zoom || 14, { duration: 1.2 })
    }
  }, [center, zoom, map])

  // Automatically fit map bounds to all available spots when data loads
  useEffect(() => {
    if (!hasFittedBoundsRef.current && spots && spots.length > 0) {
      hasFittedBoundsRef.current = true
      if (spots.length === 1) {
        map.flyTo([spots[0].latitude, spots[0].longitude], 15)
      } else {
        const bounds = L.latLngBounds(spots.map((s) => [s.latitude, s.longitude]))
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 })
      }
    }
  }, [spots, map])

  useEffect(() => {
    const handleResize = () => {
      map.invalidateSize()
    }
    window.addEventListener('resize', handleResize)
    map.invalidateSize()
    const timer1 = setTimeout(() => map.invalidateSize(), 100)
    const timer2 = setTimeout(() => map.invalidateSize(), 300)
    const timer3 = setTimeout(() => map.invalidateSize(), 600)
    return () => {
      window.removeEventListener('resize', handleResize)
      clearTimeout(timer1)
      clearTimeout(timer2)
      clearTimeout(timer3)
    }
  }, [map])

  return null
}

const DEFAULT_CENTER = [12.9716, 77.5946]
const POLL_INTERVAL = 5000

export default function ParkingMap() {
  const { theme } = useTheme()
  const { user } = useAuth()
  const [spots, setSpots] = useState([])
  const [selected, setSelected] = useState(null)
  const [hoveredSpotId, setHoveredSpotId] = useState(null)
  const [loading, setLoading] = useState(true)

  // Driver Tabs: 'browse' | 'my-passes'
  const [driverTab, setDriverTab] = useState('browse')
  const [myBookings, setMyBookings] = useState([])

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [vehicleFilter, setVehicleFilter] = useState('ALL')
  const [amenityFilter, setAmenityFilter] = useState('ALL')
  const [maxPrice, setMaxPrice] = useState(1000)

  // Map camera state
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER)
  const [mapZoom, setMapZoom] = useState(13)

  const cardRefs = useRef({})

  const loadSpots = useCallback(async () => {
    try {
      const data = await getSpots()
      setSpots(data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMyBookings = useCallback(async () => {
    if (!user) {
      setMyBookings([])
      return
    }
    try {
      const data = await getMyBookings()
      setMyBookings(data)
    } catch {}
  }, [user])

  useEffect(() => {
    setLoading(true)
    loadSpots()
    loadMyBookings()
    const timer = setInterval(() => {
      loadSpots()
      loadMyBookings()
    }, POLL_INTERVAL)
    return () => clearInterval(timer)
  }, [loadSpots, loadMyBookings])

  const handleLocateMe = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = [pos.coords.latitude, pos.coords.longitude]
          setMapCenter(coords)
          setMapZoom(15)
        },
        () => {
          alert('Unable to retrieve your current location.')
        }
      )
    }
  }

  const filteredSpots = spots.filter((s) => {
    const matchesSearch = s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.owner_label && s.owner_label.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesVehicle = vehicleFilter === 'ALL' || s.vehicle_type === vehicleFilter || s.vehicle_type === 'Both'
    const matchesAmenity = amenityFilter === 'ALL' || (s.amenities && s.amenities.includes(amenityFilter))
    const matchesPrice = s.price_inr <= maxPrice
    return matchesSearch && matchesVehicle && matchesAmenity && matchesPrice
  })

  const handleSpotSelect = (spot) => {
    setSelected(spot)
    setMapCenter([spot.latitude, spot.longitude])
    setMapZoom(15)
  }

  const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

  return (
    <div className="w-full h-full flex flex-col md:flex-row overflow-hidden">

      {/* ── Left Half (50% width): Search, Filters, and Spot Listings / Details ── */}
      <div className="w-full md:w-1/2 h-1/2 md:h-full flex flex-col bg-slate-50 dark:bg-zinc-950 border-r border-slate-200 dark:border-zinc-800 overflow-hidden flex-shrink-0">
        {selected ? (
          /* When a spot is clicked: Render Spot Details and Booking Form on the left without covering the map */
          <SpotCard
            spot={selected}
            onClose={() => setSelected(null)}
            onBooked={() => {
              loadSpots()
            }}
          />
        ) : (
          /* Default view: Search & Filter Toolbar + Scrollable Spot Feed OR My Passes */
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {user && (
              <div className="flex items-center gap-4 px-4 pt-3 pb-0 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 flex-shrink-0">
                <button
                  onClick={() => setDriverTab('browse')}
                  className={`pb-2.5 text-xs font-bold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
                    driverTab === 'browse'
                      ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white'
                  }`}
                >
                  <span>🔍 Explore Spots</span>
                </button>
                <button
                  onClick={() => setDriverTab('my-passes')}
                  className={`pb-2.5 text-xs font-bold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
                    driverTab === 'my-passes'
                      ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-white'
                  }`}
                >
                  <span>🎫 My Passes</span>
                  <span className="text-[10px] bg-slate-100 dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 border border-slate-200 dark:border-zinc-700 px-1.5 py-0.2 rounded-full font-mono">
                    {myBookings.length}
                  </span>
                </button>
              </div>
            )}

            {driverTab === 'my-passes' ? (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <div className="flex items-center justify-between pb-1">
                  <span className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-zinc-400 font-semibold">
                    My Active & Past Parking Passes ({myBookings.length})
                  </span>
                </div>
                {myBookings.length === 0 ? (
                  <div className="p-8 text-center bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl text-slate-500 dark:text-zinc-400 text-xs">
                    <p className="font-semibold text-sm">No parking passes yet</p>
                    <p className="mt-1">When you reserve a parking spot, your active OTP and pass details will be saved here.</p>
                  </div>
                ) : (
                  myBookings.map((b) => (
                    <div
                      key={b.id}
                      className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xs space-y-3"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                            Booking Ref #{b.id}
                          </span>
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white mt-0.5">
                            Vehicle: <span className="font-mono">{b.vehicle_no}</span>
                          </h4>
                          <p className="text-xs text-slate-600 dark:text-zinc-400 font-mono mt-0.5">
                            Slot: {formatTime12(b.start_time)} – {formatTime12(b.end_time)} ({b.duration_hrs} hr)
                          </p>
                        </div>
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border ${
                          b.status === 'VERIFIED'
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-300'
                            : b.status === 'PENDING'
                            ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border-amber-300'
                            : b.status === 'COMPLETED'
                            ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border-blue-300'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {b.status}
                        </span>
                      </div>

                      <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 rounded-xl p-3 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 font-bold block uppercase">
                            Check-in OTP (Share with Host)
                          </span>
                          <span className="text-xl font-mono font-black tracking-widest text-emerald-900 dark:text-emerald-200">
                            {b.otp}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-500 dark:text-zinc-400 block font-mono">Driver</span>
                          <span className="text-xs font-semibold text-slate-800 dark:text-zinc-200">{b.driver_name}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <>
                {/* ── Search & Filter Controls (Top of Left Half) ── */}
                <div className="p-4 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 space-y-3 flex-shrink-0 z-10 shadow-xs">
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400 dark:text-zinc-500 text-xs">🔍</span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search spots by location, landmark..."
                  className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              {/* Quick Filters Row */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                {/* Vehicle Filter */}
                <div className="inline-flex bg-slate-100 dark:bg-zinc-800 p-0.5 rounded-lg border border-slate-300 dark:border-zinc-700 text-xs">
                  {['ALL', '4W', '2W'].map((v) => (
                    <button
                      key={v}
                      onClick={() => setVehicleFilter(v)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                        vehicleFilter === v
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {v === 'ALL' ? 'Any' : v}
                    </button>
                  ))}
                </div>

                {/* Amenities Filter */}
                <select
                  value={amenityFilter}
                  onChange={(e) => setAmenityFilter(e.target.value)}
                  className="bg-slate-50 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-slate-700 dark:text-zinc-300 focus:outline-none focus:border-indigo-500"
                >
                  <option value="ALL">All Amenities</option>
                  <option value="ev">⚡ EV Charging</option>
                  <option value="covered">🏠 Covered Roof</option>
                  <option value="cctv">📹 CCTV</option>
                  <option value="gated">🛡️ Gated</option>
                </select>

                {/* Max Price Slider */}
                <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-zinc-400">
                  <span className="text-[11px]">Max: <strong className="text-slate-900 dark:text-white font-mono">₹{maxPrice}/hr</strong></span>
                  <input
                    type="range"
                    min="10"
                    max="1000"
                    step="10"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(parseInt(e.target.value))}
                    className="w-20 accent-indigo-600 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* ── Scrollable Listings Feed ── */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-zinc-400 font-semibold">
                  {filteredSpots.length} Available Location{filteredSpots.length !== 1 ? 's' : ''}
                </span>
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono font-semibold">● Atomic CAS Lock</span>
              </div>

              {filteredSpots.length === 0 ? (
                <div className="p-8 text-center bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl text-slate-500 dark:text-zinc-400 text-xs">
                  No parking spaces match your filter criteria.
                </div>
              ) : (
                filteredSpots.map((spot) => {
                  const isHovered = hoveredSpotId === spot.id
                  const isAvailable = spot.status === 'AVAILABLE'
                  const openSlots = getAvailableSlots(spot.avail_start, spot.avail_end, spot.booked_slots || [])
                  const hasOpenSlots = openSlots.length > 0
                  const visibility = getSpotVisibilityStatus(spot.avail_start, spot.avail_end)
                  const amenities = (spot.amenities || '').split(',').filter(Boolean)

                  return (
                    <div
                      key={spot.id}
                      ref={(el) => (cardRefs.current[spot.id] = el)}
                      onMouseEnter={() => setHoveredSpotId(spot.id)}
                      onMouseLeave={() => setHoveredSpotId(null)}
                      onClick={() => handleSpotSelect(spot)}
                      className={`p-4 rounded-2xl border transition-all duration-200 cursor-pointer bg-white dark:bg-zinc-900 shadow-xs ${
                        isHovered
                          ? 'border-indigo-600 shadow-md transform -translate-y-0.5'
                          : 'border-slate-200 dark:border-zinc-800 hover:border-slate-400 dark:hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${
                              spot.status === 'RESERVED'
                                ? 'bg-amber-500'
                                : spot.status === 'OCCUPIED'
                                ? 'bg-rose-500'
                                : visibility.isClosedForToday
                                ? 'bg-slate-400'
                                : 'bg-emerald-500'
                            }`} />
                            <h4 className="font-bold text-sm text-slate-900 dark:text-white">{spot.title}</h4>
                          </div>

                          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                              spot.status === 'OCCUPIED'
                                ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800'
                                : spot.status === 'RESERVED'
                                ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                                : visibility.status === 'OPEN_NOW'
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                                : visibility.status === 'OPENS_TODAY'
                                ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800'
                                : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-zinc-700'
                            }`}>
                              {spot.status === 'OCCUPIED'
                                ? 'In Use'
                                : spot.status === 'RESERVED'
                                ? 'Reserved'
                                : visibility.label}
                            </span>
                            <span className="text-[11px] text-slate-600 dark:text-zinc-400 font-medium">
                              {spot.vehicle_type} • Daily {formatTime12(spot.avail_start)} – {formatTime12(spot.avail_end)}
                            </span>
                          </div>

                          {spot.booked_slots && spot.booked_slots.length > 0 && (
                            <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium mt-1">
                              {spot.booked_slots.length} reserved slot{spot.booked_slots.length !== 1 ? 's' : ''} • {openSlots.length} open today
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-base font-extrabold font-mono text-slate-900 dark:text-white">
                            ₹{spot.price_inr}
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-zinc-400 block -mt-0.5 font-medium">/hr</span>
                        </div>
                      </div>

                      {amenities.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2.5">
                          {amenities.map((a) => (
                            <span
                              key={a}
                              className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300"
                            >
                              {AMENITY_MAP[a] || a}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between">
                        <span className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                          GPS: {spot.latitude.toFixed(3)}, {spot.longitude.toFixed(3)}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleSpotSelect(spot)
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                            hasOpenSlots
                              ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                              : visibility.isClosedForToday
                              ? 'bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 border border-slate-300 dark:border-zinc-700'
                              : 'bg-slate-200 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400'
                          }`}
                        >
                          {hasOpenSlots
                            ? 'Book Slot'
                            : visibility.isClosedForToday
                            ? 'Opens Tomorrow'
                            : 'Fully Booked'}
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            </>
            )}
          </div>
        )}
      </div>

      {/* ── Right Half (Entire Right 50% of screen): Edge-to-Edge Interactive Map ── */}
      <div className="w-full md:w-1/2 h-1/2 md:h-full relative overflow-hidden bg-slate-100 dark:bg-zinc-900 min-h-[300px]">
        <div className="absolute inset-0 w-full h-full">
          {/* Locate Me Floating Action Button */}
          <button
            onClick={handleLocateMe}
            title="Locate my position"
            className="absolute top-4 right-4 z-[1000] bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 text-slate-800 dark:text-white p-2.5 rounded-xl shadow-md hover:border-indigo-600 transition"
          >
            🎯
          </button>

          <MapContainer
            center={mapCenter}
            zoom={mapZoom}
            style={{ height: '100%', width: '100%' }}
            className="h-full w-full"
          >
            <MapController center={mapCenter} zoom={mapZoom} spots={spots} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url={tileUrl}
              className="dark-tile-layer"
            />

            {filteredSpots.map((spot) => {
              const isHovered = hoveredSpotId === spot.id || selected?.id === spot.id
              const iconsSet = isHovered ? HIGHLIGHTED_ICONS : ICONS
              const icon = iconsSet[spot.status] || iconsSet.AVAILABLE

              return (
                <Marker
                  key={spot.id}
                  position={[spot.latitude, spot.longitude]}
                  icon={icon}
                  eventHandlers={{
                    click: () => handleSpotSelect(spot),
                    mouseover: () => setHoveredSpotId(spot.id),
                    mouseout: () => setHoveredSpotId(null),
                  }}
                >
                  <Popup>
                    <div className="p-1 min-w-[170px] text-xs">
                      <p className="font-bold text-sm text-slate-900">{spot.title}</p>
                      <p className="text-slate-600 font-mono mt-0.5">₹{spot.price_inr}/hr • {spot.vehicle_type} • {formatTime12(spot.avail_start)} to {formatTime12(spot.avail_end)}</p>
                      <button
                        onClick={() => handleSpotSelect(spot)}
                        className="mt-2 w-full bg-indigo-600 text-white py-1 rounded text-xs font-semibold hover:bg-indigo-700"
                      >
                        View Details
                      </button>
                    </div>
                  </Popup>
                </Marker>
              )
            })}
          </MapContainer>
        </div>
      </div>
    </div>
  )
}
