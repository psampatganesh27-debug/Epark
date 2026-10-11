import React, { useEffect, useState, useCallback, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { getSpots } from '../../api'
import SpotCard from './SpotCard'
import { useTheme } from '../../context/ThemeContext'
import { formatTime12, getAvailableSlots, timeToMinutes } from '../../utils/time'

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

function MapController({ center, zoom }) {
  const map = useMap()
  useEffect(() => {
    if (center) {
      map.flyTo(center, zoom || 14, { duration: 1.2 })
    }
  }, [center, zoom, map])

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
  const [spots, setSpots] = useState([])
  const [selected, setSelected] = useState(null)
  const [hoveredSpotId, setHoveredSpotId] = useState(null)
  const [loading, setLoading] = useState(true)

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [vehicleFilter, setVehicleFilter] = useState('ALL')
  const [amenityFilter, setAmenityFilter] = useState('ALL')
  const [maxPrice, setMaxPrice] = useState(250)

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

  useEffect(() => {
    setLoading(true)
    loadSpots()
    const timer = setInterval(loadSpots, POLL_INTERVAL)
    return () => clearInterval(timer)
  }, [loadSpots])

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
          /* Default view: Search & Filter Toolbar + Scrollable Spot Feed */
          <div className="flex-1 flex flex-col h-full overflow-hidden">

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
                    min="30"
                    max="300"
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
                              isAvailable ? 'bg-emerald-500' : spot.status === 'RESERVED' ? 'bg-amber-500' : 'bg-rose-500'
                            }`} />
                            <h4 className="font-bold text-sm text-slate-900 dark:text-white">{spot.title}</h4>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-zinc-400 mt-1 font-medium">
                            {spot.vehicle_type} • {formatTime12(spot.avail_start)} to {formatTime12(spot.avail_end)}
                          </p>
                          {spot.booked_slots && spot.booked_slots.length > 0 && (
                            <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium mt-0.5">
                              {spot.booked_slots.length} reserved slot{spot.booked_slots.length !== 1 ? 's' : ''} • {openSlots.length} open
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
                        {(() => {
                          const nowMins = new Date().getHours() * 60 + new Date().getMinutes()
                          const endMins = timeToMinutes(spot.avail_end)
                          const isClosed = nowMins >= endMins

                          return (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleSpotSelect(spot)
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                                hasOpenSlots
                                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                                  : 'bg-slate-200 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400'
                              }`}
                            >
                              {hasOpenSlots ? 'Book Slot' : isClosed ? 'Closed for Today' : 'Fully Booked'}
                            </button>
                          )
                        })()}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
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
            <MapController center={mapCenter} zoom={mapZoom} />
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
