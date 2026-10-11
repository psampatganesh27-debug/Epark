import React, { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { createSpot } from '../../api'
import { useTheme } from '../../context/ThemeContext'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const DEFAULT_CENTER = [12.9716, 77.5946]

const AMENITY_OPTIONS = [
  { id: 'covered', label: 'Covered / Roof' },
  { id: 'ev', label: 'EV Charging' },
  { id: 'cctv', label: 'CCTV Monitored' },
  { id: 'gated', label: 'Gated Security' },
]

function MapClickHandler({ onPick }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

function MapCenterController({ center }) {
  const map = useMap()
  useEffect(() => {
    if (center) {
      map.setView(center, Math.max(map.getZoom(), 15), { animate: true })
    }
  }, [center, map])
  return null
}

const INITIAL = {
  title: '',
  latitude: '',
  longitude: '',
  price_inr: '',
  vehicle_type: '4W',
  avail_start: '08:00',
  avail_end: '20:00',
  owner_label: '',
  owner_name: '',
  owner_phone: '',
  amenities: '',
}

export default function ListSpotForm({ onCreated }) {
  const { theme } = useTheme()
  const [form, setForm] = useState(INITIAL)
  const [selectedAmenities, setSelectedAmenities] = useState([])
  const [pin, setPin] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showMap, setShowMap] = useState(true)

  // Location helpers state
  const [geoLoading, setGeoLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [locationStatus, setLocationStatus] = useState('')

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const toggleAmenity = (id) => {
    setSelectedAmenities((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    )
  }

  // Reverse geocode lat,lng to a clean human address
  const reverseGeocode = async (lat, lng) => {
    try {
      setLocationStatus('Fetching address name...')
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`
      )
      const data = await res.json()
      if (data && data.display_name) {
        // Build a concise friendly title if title is empty or generic
        const addr = data.address || {}
        const landmark = addr.neighbourhood || addr.suburb || addr.road || addr.residential || addr.city_district || addr.city || ''
        const city = addr.city || addr.town || addr.state_district || ''
        const suggestedTitle = landmark ? `${landmark}${city ? `, ${city}` : ''}` : data.display_name.split(',').slice(0, 3).join(', ')

        setForm((f) => ({
          ...f,
          title: f.title ? f.title : suggestedTitle,
        }))
        setLocationStatus(`Location detected: ${suggestedTitle}`)
      }
    } catch (err) {
      console.warn('Reverse geocode failed:', err)
      setLocationStatus('Location set from GPS coordinates')
    }
  }

  const handlePick = (lat, lng, skipReverse = false) => {
    setPin([lat, lng])
    setForm((f) => ({
      ...f,
      latitude: lat.toFixed(6),
      longitude: lng.toFixed(6),
    }))
    if (!skipReverse) {
      reverseGeocode(lat, lng)
    }
  }

  // 1-Click Live Location
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.')
      return
    }

    setGeoLoading(true)
    setLocationStatus('Getting your GPS coordinates...')
    setError('')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude
        handlePick(lat, lng)
        setShowMap(true)
        setGeoLoading(false)
      },
      (geoErr) => {
        setGeoLoading(false)
        setLocationStatus('')
        if (geoErr.code === 1) {
          setError('Location permission was denied. Please allow location access or pick manually on map.')
        } else {
          setError('Could not retrieve current location. Please use search or map.')
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  // Address Search via Nominatim
  const handleSearchAddress = async (e) => {
    e?.preventDefault()
    if (!searchQuery.trim()) return

    setSearching(true)
    setError('')
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5&countrycodes=in`
      )
      const data = await res.json()
      setSearchResults(data || [])
      if (!data || data.length === 0) {
        setLocationStatus('No places found matching your query.')
      }
    } catch (err) {
      setError('Address search failed. Please try again.')
    } finally {
      setSearching(false)
    }
  }

  const handleSelectSearchResult = (item) => {
    const lat = parseFloat(item.lat)
    const lng = parseFloat(item.lon)
    setPin([lat, lng])
    setForm((f) => ({
      ...f,
      latitude: lat.toFixed(6),
      longitude: lng.toFixed(6),
      title: f.title || item.display_name.split(',').slice(0, 3).join(', '),
    }))
    setSearchResults([])
    setSearchQuery('')
    setLocationStatus(`Selected: ${item.display_name.split(',').slice(0, 2).join(', ')}`)
    setShowMap(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const payload = {
        ...form,
        latitude: parseFloat(form.latitude),
        longitude: parseFloat(form.longitude),
        price_inr: parseFloat(form.price_inr),
        amenities: selectedAmenities.join(','),
      }
      await createSpot(payload)
      setForm(INITIAL)
      setSelectedAmenities([])
      setPin(null)
      setLocationStatus('')
      onCreated()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to list spot')
    } finally {
      setLoading(false)
    }
  }

  const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
  const activeCenter = pin || [
    parseFloat(form.latitude) || DEFAULT_CENTER[0],
    parseFloat(form.longitude) || DEFAULT_CENTER[1],
  ]

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 p-6 shadow-xs">
      <div className="border-b border-slate-200 dark:border-zinc-800 pb-4 mb-5">
        <h2 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
          List Parking Space
        </h2>
        <p className="text-xs text-slate-600 dark:text-zinc-400 mt-0.5 font-medium">
          Publish your driveway or parking slot into the network
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* Location Picker Section */}
        <div className="bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700/80 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>📍</span> Spot Location
              </span>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                Use your current GPS location, search address, or click on the map
              </p>
            </div>

            {/* Instant 1-Click Live Location */}
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={geoLoading}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-xl text-xs inline-flex items-center gap-1.5 transition shadow-xs"
            >
              <span>{geoLoading ? '⌛ Detecting…' : '🎯 Use My Current Location'}</span>
            </button>
          </div>

          {/* Address Search Bar */}
          <div className="relative">
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleSearchAddress()
                  }
                }}
                placeholder="🔍 Search building, street, or locality (e.g. Indiranagar, Bangalore)"
                className="flex-1 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-indigo-600"
              />
              <button
                type="button"
                onClick={handleSearchAddress}
                disabled={searching}
                className="bg-slate-800 hover:bg-slate-900 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-white px-3 py-2 rounded-xl text-xs font-bold transition"
              >
                {searching ? 'Searching…' : 'Search'}
              </button>
            </div>

            {/* Search Results Dropdown */}
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl shadow-lg z-30 max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-zinc-800">
                {searchResults.map((res, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSelectSearchResult(res)}
                    className="w-full text-left p-2.5 hover:bg-indigo-50 dark:hover:bg-zinc-800 text-xs text-slate-800 dark:text-zinc-200 transition flex items-start gap-2"
                  >
                    <span className="text-indigo-600 mt-0.5">📍</span>
                    <span className="truncate">{res.display_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Location Status Feedback */}
          {locationStatus && (
            <p className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
              <span>✓</span> {locationStatus}
            </p>
          )}

          {/* Interactive Map */}
          {showMap && (
            <div className="space-y-1.5">
              <div className="rounded-xl overflow-hidden border border-slate-300 dark:border-zinc-700 h-56 relative shadow-inner">
                <MapContainer
                  center={activeCenter}
                  zoom={14}
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url={tileUrl}
                    className="dark-tile-layer"
                  />
                  <MapCenterController center={pin} />
                  <MapClickHandler onPick={handlePick} />
                  {pin && <Marker position={pin} />}
                </MapContainer>
                <div className="absolute bottom-2 left-2 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xs px-2.5 py-1 rounded-lg text-[10px] text-slate-700 dark:text-zinc-300 z-1000 border border-slate-200 dark:border-zinc-700 font-semibold shadow-xs pointer-events-none">
                  💡 Click anywhere on the map to fine-tune your spot pin
                </div>
              </div>
            </div>
          )}

          {/* GPS Coordinates Inputs */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1 uppercase tracking-wider text-[10px]">
                Latitude *
              </label>
              <input
                value={form.latitude}
                onChange={set('latitude')}
                required
                type="number"
                step="any"
                placeholder="12.9716"
                className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:border-indigo-600 transition"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1 uppercase tracking-wider text-[10px]">
                Longitude *
              </label>
              <input
                value={form.longitude}
                onChange={set('longitude')}
                required
                type="number"
                step="any"
                placeholder="77.5946"
                className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:border-indigo-600 transition"
              />
            </div>
          </div>
        </div>

        {/* Spot Title / Neighborhood */}
        <div>
          <label className="block font-bold text-slate-800 dark:text-zinc-200 mb-1.5 uppercase tracking-wider text-[11px]">
            Spot Title / Neighborhood *
          </label>
          <input
            value={form.title}
            onChange={set('title')}
            required
            placeholder="e.g. Covered Driveway near Indiranagar Metro"
            className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-indigo-600 transition"
          />
        </div>

        {/* Pricing & Vehicle Type */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div>
            <label className="block font-bold text-slate-800 dark:text-zinc-200 mb-1.5 uppercase tracking-wider text-[11px]">
              Tariff (₹ / Hour) *
            </label>
            <input
              value={form.price_inr}
              onChange={set('price_inr')}
              required
              type="number"
              min="1"
              step="0.5"
              placeholder="60"
              className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-xl px-3.5 py-2 text-sm text-slate-900 dark:text-white font-bold font-mono focus:outline-none focus:border-indigo-600 transition"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-800 dark:text-zinc-200 mb-1.5 uppercase tracking-wider text-[11px]">
              Permitted Vehicle *
            </label>
            <select
              value={form.vehicle_type}
              onChange={set('vehicle_type')}
              className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white font-semibold focus:outline-none focus:border-indigo-600 transition"
            >
              <option value="4W">Four-Wheeler (Car / SUV)</option>
              <option value="2W">Two-Wheeler (Motorcycle)</option>
              <option value="Both">Universal (2W & 4W)</option>
            </select>
          </div>
        </div>

        {/* Operational hours window */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-bold text-slate-800 dark:text-zinc-200 mb-1.5 uppercase tracking-wider text-[11px]">
              Available From *
            </label>
            <input
              value={form.avail_start}
              onChange={set('avail_start')}
              required
              type="time"
              className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:border-indigo-600 transition"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-800 dark:text-zinc-200 mb-1.5 uppercase tracking-wider text-[11px]">
              Available Until *
            </label>
            <input
              value={form.avail_end}
              onChange={set('avail_end')}
              required
              type="time"
              className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:border-indigo-600 transition"
            />
          </div>
        </div>

        {/* Amenities Selection */}
        <div>
          <label className="block font-bold text-slate-800 dark:text-zinc-200 mb-1.5 uppercase tracking-wider text-[11px]">
            Spot Amenities
          </label>
          <div className="grid grid-cols-2 gap-2">
            {AMENITY_OPTIONS.map((item) => {
              const active = selectedAmenities.includes(item.id)
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => toggleAmenity(item.id)}
                  className={`p-2 rounded-xl border text-left font-semibold transition ${
                    active
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-600 text-indigo-700 dark:text-indigo-400'
                      : 'bg-slate-50 dark:bg-zinc-800 border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:border-slate-400'
                  }`}
                >
                  <span className="block text-[11px]">{item.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Private Contact Card */}
        <div className="bg-slate-50 dark:bg-zinc-800/60 border border-slate-300 dark:border-zinc-700 rounded-xl p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Host Contact (Encrypted until Reservation)
            </span>
            <span className="text-[10px] text-slate-600 dark:text-zinc-400 font-mono font-semibold">🔒 Private</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1">Host Name</label>
              <input
                value={form.owner_name}
                onChange={set('owner_name')}
                placeholder="e.g. Ramesh Iyer"
                className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-600"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-700 dark:text-zinc-300 mb-1">Phone / WhatsApp</label>
              <input
                value={form.owner_phone}
                onChange={set('owner_phone')}
                placeholder="e.g. 9845012345"
                type="tel"
                className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-indigo-600"
              />
            </div>
          </div>
        </div>

        {/* Additional instructions */}
        <div>
          <label className="block font-bold text-slate-800 dark:text-zinc-200 mb-1.5 uppercase tracking-wider text-[11px]">
            Access Notes
          </label>
          <input
            value={form.owner_label}
            onChange={set('owner_label')}
            placeholder="e.g. Covered, gate lock passcode given on call"
            className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-indigo-600 transition"
          />
        </div>

        {error && (
          <p className="text-xs text-rose-500 font-bold py-1">Notice: {error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition duration-200 shadow-sm disabled:opacity-50"
        >
          {loading ? 'Submitting listing…' : 'Publish Spot to Network'}
        </button>
      </form>
    </div>
  )
}
