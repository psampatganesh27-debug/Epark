import sqlite3

conn = sqlite3.connect('epark.db')
cur = conn.cursor()

cur.execute('PRAGMA table_info(bookings)')
cols = [r[1] for r in cur.fetchall()]

added = []
if 'start_time' not in cols:
    cur.execute('ALTER TABLE bookings ADD COLUMN start_time TEXT')
    added.append('start_time')
if 'end_time' not in cols:
    cur.execute('ALTER TABLE bookings ADD COLUMN end_time TEXT')
    added.append('end_time')

conn.commit()
conn.close()
print("Migration complete. Added columns:", added if added else "None (already up to date)")
