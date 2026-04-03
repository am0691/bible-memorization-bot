const db = require('../database/connection');
const Q = require('../database/statements');

const INTERVALS = [1, 1, 1, 1, 1, 1, 1, 2, 2, 3, 3, 7, 14, 30];

function getInterval(reviewCount) {
  return reviewCount < INTERVALS.length ? INTERVALS[reviewCount] : 30;
}

// Select verses for today's review
function selectReviewVerses(memberId, count) {
  // 1. Get all due verses (next_review_at <= today)
  const dueVerses = db.prepare(Q.getReviewDueVerses).all(memberId);

  if (dueVerses.length >= count) {
    return dueVerses.slice(0, count);
  }

  // 2. If not enough, fill with new verses
  const remaining = count - dueVerses.length;
  const newVerses = db.prepare(Q.getNewVerses).all(memberId, remaining);

  return [...dueVerses, ...newVerses];
}

// Record a successful review for a verse
function recordReview(memberId, verseId) {
  const progress = db.prepare(
    'SELECT * FROM member_progress WHERE member_id = ? AND verse_id = ?'
  ).get(memberId, verseId);

  if (!progress) return;

  const newReviewCount = progress.review_count + 1;
  const newInterval = getInterval(newReviewCount);

  // Determine new status
  let newStatus = progress.status;
  if (progress.status === 'new') {
    newStatus = 'learning';
  } else if (newReviewCount >= 7 && progress.status === 'learning') {
    newStatus = 'memorized';
  } else if (newInterval >= 30) {
    newStatus = 'reviewing';
  }

  db.prepare(Q.updateProgressReview).run(
    newInterval, newInterval, newStatus, memberId, verseId
  );

  // Set first_learned_at if first time
  if (!progress.first_learned_at) {
    db.prepare(
      "UPDATE member_progress SET first_learned_at = datetime('now') WHERE member_id = ? AND verse_id = ?"
    ).run(memberId, verseId);
  }
}

module.exports = { selectReviewVerses, recordReview, getInterval, INTERVALS };
