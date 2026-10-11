import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// ── Spots ────────────────────────────────────────────────────────────────────
export const getSpots = (status, includeArchived = false) => {
  const params = {}
  if (status) params.status = status
  if (includeArchived) params.include_archived = true
  return api.get('/api/spots', { params }).then((r) => r.data)
}

export const createSpot = (data) =>
  api.post('/api/spots', data).then((r) => r.data)

export const deleteSpot = (id) => api.delete(`/api/spots/${id}`)

export const unarchiveSpot = (id) =>
  api.post(`/api/spots/${id}/unarchive`).then((r) => r.data)

export const getSpotBookings = (spotId) =>
  api.get(`/api/spots/${spotId}/bookings`).then((r) => r.data)

export const resetSpot = (spotId) =>
  api.post(`/api/spots/${spotId}/reset`).then((r) => r.data)

// ── Bookings ─────────────────────────────────────────────────────────────────
export const createBooking = (data) =>
  api.post('/api/bookings', data).then((r) => r.data)

export const verifyBooking = (bookingId, otp) =>
  api.post(`/api/bookings/${bookingId}/verify`, { otp }).then((r) => r.data)

export const cancelBooking = (bookingId) =>
  api.delete(`/api/bookings/${bookingId}`)
