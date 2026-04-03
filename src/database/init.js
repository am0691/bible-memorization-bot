const db = require('./connection');
const fs = require('fs');
const path = require('path');

function initDatabase() {
  migrateIfNeeded();

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);

  const courseCount = db.prepare('SELECT COUNT(*) as count FROM courses').get().count;
  if (courseCount > 0) {
    console.log(`[DB] 커리큘럼 이미 로드됨 (${courseCount}개 코스)`);
    return;
  }

  const curriculumDir = path.join(__dirname, '..', '..', 'data', 'curriculum');
  const files = [
    'course1-intro.json',
    'course2-basic.json',
    'course3-mid.json',
    'course4-advanced.json',
    'course5-master.json',
  ];

  const insertCourse = db.prepare('INSERT INTO courses (name, description, total_verses) VALUES (?, ?, ?)');
  const insertVerse = db.prepare('INSERT INTO verses (course_id, order_num, reference, text, text_short, topic, section) VALUES (?, ?, ?, ?, ?, ?, ?)');

  const seedAll = db.transaction(() => {
    for (const file of files) {
      const data = JSON.parse(fs.readFileSync(path.join(curriculumDir, file), 'utf-8'));
      const result = insertCourse.run(data.name, data.description, data.total_verses);
      const courseId = result.lastInsertRowid;

      for (const verse of data.verses) {
        insertVerse.run(
          courseId, verse.order_num, verse.reference, verse.text,
          verse.text_short || verse.text.substring(0, 30) + '...',
          verse.topic || null, verse.section || verse.subtopic || null
        );
      }
      console.log(`[DB] ${data.name} 코스 로드 완료 (${data.verses.length}구절)`);
    }
  });

  seedAll();
  console.log('[DB] 전체 커리큘럼 시딩 완료');
}

function migrateIfNeeded() {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);

  // Fresh install — no migration needed
  if (!tables.includes('members')) return;

  const memberCols = db.pragma('table_info(members)').map(c => c.name);

  if (memberCols.includes('new_course_id')) return; // already migrated

  console.log('[DB] v2.0 마이그레이션 시작...');

  db.transaction(() => {
    // Add new columns to members
    db.exec(`
      ALTER TABLE members ADD COLUMN new_course_id INTEGER DEFAULT 1;
      ALTER TABLE members ADD COLUMN new_position INTEGER DEFAULT 1;
      ALTER TABLE members ADD COLUMN new_per_week INTEGER DEFAULT 2;
      ALTER TABLE members ADD COLUMN review_course_id INTEGER;
      ALTER TABLE members ADD COLUMN review_position INTEGER DEFAULT 1;
      ALTER TABLE members ADD COLUMN review_per_day INTEGER DEFAULT 3;
      ALTER TABLE members ADD COLUMN sunday_mode INTEGER DEFAULT 0;
    `);

    // Migrate existing data: course_id → new_course_id, daily_goal → review_per_day
    db.exec(`UPDATE members SET new_course_id = course_id, review_per_day = daily_goal`);

    // Create member_course_progress table
    db.exec(`
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
    `);

    // Add new columns to daily_logs if needed
    const logCols = db.pragma('table_info(daily_logs)').map(c => c.name);
    if (!logCols.includes('new_done')) {
      db.exec(`
        ALTER TABLE daily_logs ADD COLUMN new_done INTEGER DEFAULT 0;
        ALTER TABLE daily_logs ADD COLUMN review_done INTEGER DEFAULT 0;
      `);
    }

    // Update settings
    db.exec(`
      INSERT OR REPLACE INTO settings (key, value) VALUES ('new_verse_day', 'monday');
      DELETE FROM settings WHERE key = 'weekly_new_verse_count';
    `);
  })();

  console.log('[DB] v2.0 마이그레이션 완료');
}

module.exports = { initDatabase };
