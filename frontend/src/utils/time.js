// Helper utilities for clean, human-readable time formatting

export function timeToMinutes(tStr) {
  if (!tStr) return 0
  const parts = tStr.split(':')
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)
}

export function minutesToTime(m) {
  const h = Math.floor(m / 60) % 24
  const mins = m % 60
  return `${h < 10 ? '0' : ''}${h}:${mins < 10 ? '0' : ''}${mins}`
}

/**
 * Converts "13:00" -> "1:00 PM", "09:30" -> "9:30 AM"
 */
export function formatTime12(tStr) {
  if (!tStr) return ''
  const [hStr, mStr] = tStr.split(':')
  let h = parseInt(hStr, 10)
  const mins = mStr || '00'
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${mins} ${ampm}`
}

/**
 * Calculates human duration: (13:00, 15:00) -> "2 hours", (13:00, 13:30) -> "30 mins"
 */
export function formatDuration(startStr, endStr) {
  if (!startStr || !endStr) return ''
  const startM = timeToMinutes(startStr)
  const endM = timeToMinutes(endStr)
  const diffM = endM - startM
  if (diffM <= 0) return '0 hrs'
  const hours = Math.floor(diffM / 60)
  const mins = diffM % 60
  if (hours > 0 && mins > 0) {
    return `${hours} hr ${mins} mins`
  } else if (hours > 0) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  } else {
    return `${mins} mins`
  }
}

/**
 * Calculates remaining available (free) time intervals within the host window.
 * If filterPast=true (default for today's bookings), slots before the current time are excluded.
 * E.g., host: 08:00 to 20:00, now is 18:30 -> slots start from 18:30 onwards.
 */
export function getAvailableSlots(availStart, availEnd, bookedSlots = [], filterPast = true) {
  if (!availStart || !availEnd) return []
  const hostStart = timeToMinutes(availStart)
  const hostEnd = timeToMinutes(availEnd)
  if (hostStart >= hostEnd) return []

  // If filtering past hours today, advance window start to current time rounded up to nearest 5 mins
  let effectiveStart = hostStart
  if (filterPast) {
    const now = new Date()
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    // Round up to nearest 5 mins (e.g. 18:31 -> 18:35)
    const roundedNow = Math.ceil(nowMinutes / 5) * 5
    effectiveStart = Math.max(hostStart, roundedNow)
  }

  // If current time has already passed host window for today
  if (effectiveStart >= hostEnd) {
    return []
  }

  // Sort and clamp active bookings within [effectiveStart, hostEnd]
  const sorted = [...bookedSlots]
    .map((s) => ({
      start: Math.max(effectiveStart, timeToMinutes(s.start_time)),
      end: Math.min(hostEnd, timeToMinutes(s.end_time)),
    }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start)

  // Merge overlapping or adjacent booked intervals
  const merged = []
  for (const slot of sorted) {
    if (merged.length === 0) {
      merged.push({ ...slot })
    } else {
      const last = merged[merged.length - 1]
      if (slot.start <= last.end) {
        last.end = Math.max(last.end, slot.end)
      } else {
        merged.push({ ...slot })
      }
    }
  }

  // Find free gaps between effectiveStart and hostEnd
  const freeSlots = []
  let cursor = effectiveStart

  for (const b of merged) {
    if (b.start > cursor) {
      freeSlots.push({
        start_time: minutesToTime(cursor),
        end_time: minutesToTime(b.start),
      })
    }
    cursor = Math.max(cursor, b.end)
  }

  if (cursor < hostEnd) {
    freeSlots.push({
      start_time: minutesToTime(cursor),
      end_time: minutesToTime(hostEnd),
    })
  }

  return freeSlots
}

/**
 * Parses any ISO timestamp string ensuring UTC interpretation if timezone offset is missing.
 */
export function parseUtcDate(isoStr) {
  if (!isoStr) return null
  // If string does not specify 'Z' or timezone offset '+/-', force 'Z' for UTC interpretation
  const hasTz = isoStr.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(isoStr)
  return new Date(hasTz ? isoStr : `${isoStr}Z`)
}

/**
 * Formats a UTC timestamp string to local time (e.g., "11:04 AM")
 */
export function formatLocalTime(isoStr) {
  const d = parseUtcDate(isoStr)
  if (!d || isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}
