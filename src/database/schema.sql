CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  total_verses INTEGER NOT NULL,
  created_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS verses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL,
  order_num INTEGER NOT NULL,
  reference TEXT NOT NULL,
  text TEXT NOT NULL,
  text_short TEXT,
  topic TEXT,
  section TEXT,
  FOREIGN KEY (course_id) REFERENCES courses(id)
);

CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id TEXT NOT NULL UNIQUE,
  discord_name TEXT NOT NULL,
  -- New verse tracking
  new_course_id INTEGER DEFAULT 1,
  new_position INTEGER DEFAULT 1,
  new_per_week INTEGER DEFAULT 2,
  -- Review tracking
  review_course_id INTEGER,
  review_position INTEGER DEFAULT 1,
  review_per_day INTEGER DEFAULT 3,
  -- General
  streak INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  sunday_mode INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT (datetime('now')),
  FOREIGN KEY (new_course_id) REFERENCES courses(id)
);

CREATE TABLE IF NOT EXISTS member_course_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  new_position INTEGER DEFAULT 1,
  review_position INTEGER DEFAULT 1,
  UNIQUE(member_id, course_id),
  FOREIGN KEY (member_id) REFERENCES members(id),
  FOREIGN KEY (course_id) REFERENCES courses(id)
);

CREATE TABLE IF NOT EXISTS daily_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  log_date TEXT NOT NULL,
  new_done INTEGER DEFAULT 0,
  review_done INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT (datetime('now')),
  UNIQUE(member_id, log_date),
  FOREIGN KEY (member_id) REFERENCES members(id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('new_verse_day', 'monday'),
  ('reminder_time', '08:30'),
  ('report_day', 'sunday'),
  ('report_time', '20:00');
