import sqlite3
conn = sqlite3.connect('epark.db')
cur = conn.cursor()

cur.execute('PRAGMA table_info(spots)')
spot_cols = [r[1] for r in cur.fetchall()]
cur.execute('PRAGMA table_info(bookings)')
booking_cols = [r[1] for r in cur.fetchall()]

additions = []
if 'amenities' not in spot_cols:
    cur.execute('ALTER TABLE spots ADD COLUMN amenities TEXT DEFAULT ""')
    additions.append('spots.amenities')
if 'duration_hrs' not in booking_cols:
    cur.execute('ALTER TABLE bookings ADD COLUMN duration_hrs REAL DEFAULT 1.0')
    additions.append('bookings.duration_hrs')
if 'expires_at' not in booking_cols:
    cur.execute('ALTER TABLE bookings ADD COLUMN expires_at TEXT')
    additions.append('bookings.expires_at')

conn.commit()
conn.close()
print('Added:', additions if additions else 'nothing (already up to date)')
print('Migration done!')
