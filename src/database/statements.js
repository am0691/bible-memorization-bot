module.exports = {
  // Members
  getMemberById: 'SELECT * FROM members WHERE id = ?',
  getMemberByDiscordId: 'SELECT * FROM members WHERE discord_id = ?',
  getAllActiveMembers: 'SELECT * FROM members WHERE is_active = 1',
  insertMember: `INSERT INTO members (discord_id, discord_name, new_course_id, new_position, new_per_week, review_course_id, review_position, review_per_day)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  updateMemberStreak: 'UPDATE members SET streak = streak + 1 WHERE id = ?',
  resetMemberStreak: 'UPDATE members SET streak = 0 WHERE id = ?',
  updateMemberNewCourse: 'UPDATE members SET new_course_id = ?, new_position = ? WHERE id = ?',
  updateMemberNewPosition: 'UPDATE members SET new_position = ? WHERE id = ?',
  updateMemberNewPerWeek: 'UPDATE members SET new_per_week = ? WHERE id = ?',
  updateMemberReviewCourse: 'UPDATE members SET review_course_id = ?, review_position = ? WHERE id = ?',
  updateMemberReviewPosition: 'UPDATE members SET review_position = ? WHERE id = ?',
  updateMemberReviewPerDay: 'UPDATE members SET review_per_day = ? WHERE id = ?',
  updateMemberSundayMode: 'UPDATE members SET sunday_mode = ? WHERE id = ?',
  updateMemberActive: 'UPDATE members SET is_active = ? WHERE id = ?',
  advanceNewPosition: 'UPDATE members SET new_position = new_position + ? WHERE id = ?',

  // Verses
  getVersesByCourse: 'SELECT * FROM verses WHERE course_id = ? ORDER BY order_num',
  getVerseById: 'SELECT * FROM verses WHERE id = ?',
  getVerseByOrder: 'SELECT * FROM verses WHERE course_id = ? AND order_num = ?',
  getCourseById: 'SELECT * FROM courses WHERE id = ?',
  getCourseSections: `SELECT section, MIN(order_num) as start_num, MAX(order_num) as end_num, COUNT(*) as count
    FROM verses WHERE course_id = ? GROUP BY section ORDER BY MIN(order_num)`,
  getVersesInRange: `SELECT * FROM verses WHERE course_id = ? AND order_num >= ? AND order_num < ? ORDER BY order_num`,
  getNextCourse: 'SELECT * FROM courses WHERE id > ? ORDER BY id LIMIT 1',
  getFirstCourse: 'SELECT * FROM courses ORDER BY id LIMIT 1',

  // Course progress preservation
  saveCourseProgress: `INSERT OR REPLACE INTO member_course_progress (member_id, course_id, new_position, review_position)
    VALUES (?, ?, ?, ?)`,
  getCourseProgress: 'SELECT * FROM member_course_progress WHERE member_id = ? AND course_id = ?',

  // Daily logs
  getDailyLog: 'SELECT * FROM daily_logs WHERE member_id = ? AND log_date = ?',
  insertDailyLog: "INSERT OR IGNORE INTO daily_logs (member_id, log_date) VALUES (?, ?)",
  updateDailyLogNewDone: "UPDATE daily_logs SET new_done = 1 WHERE member_id = ? AND log_date = ?",
  updateDailyLogReviewDone: "UPDATE daily_logs SET review_done = 1 WHERE member_id = ? AND log_date = ?",
  updateDailyLogSkipped: "UPDATE daily_logs SET status = 'skipped' WHERE member_id = ? AND log_date = ?",

  // Settings
  getSetting: 'SELECT value FROM settings WHERE key = ?',
  setSetting: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',

  // Stats
  getWeeklyLogs: `SELECT dl.*, m.discord_name, m.streak
    FROM daily_logs dl JOIN members m ON dl.member_id = m.id
    WHERE dl.log_date BETWEEN ? AND ? ORDER BY m.id, dl.log_date`,
};
