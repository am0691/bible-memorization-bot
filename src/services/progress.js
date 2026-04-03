const db = require('../database/connection');
const Q = require('../database/statements');
const { hasNewVerses, hasReview } = require('./review');

// Record new verse completion for the day
function completeNew(memberId, date) {
  db.prepare(Q.insertDailyLog).run(memberId, date);
  db.prepare(Q.updateDailyLogNewDone).run(memberId, date);
  checkAndUpdateStreak(memberId, date);
}

// Record review completion for the day (advances pointer)
function completeReview(memberId, date) {
  const { advanceReviewPointer } = require('./review');
  db.prepare(Q.insertDailyLog).run(memberId, date);
  db.prepare(Q.updateDailyLogReviewDone).run(memberId, date);
  advanceReviewPointer(memberId);
  checkAndUpdateStreak(memberId, date);
}

// Check if streak should increment and update status
function checkAndUpdateStreak(memberId, date) {
  const log = db.prepare(Q.getDailyLog).get(memberId, date);
  if (!log || log.status === 'complete') return;

  const memberHasNew = hasNewVerses(memberId);
  const memberHasReview = hasReview(memberId);

  let isComplete = false;
  if (memberHasNew && memberHasReview) {
    isComplete = log.new_done === 1 && log.review_done === 1;
  } else if (memberHasNew) {
    isComplete = log.new_done === 1;
  } else if (memberHasReview) {
    isComplete = log.review_done === 1;
  }

  if (isComplete) {
    db.prepare("UPDATE daily_logs SET status = 'complete' WHERE id = ?").run(log.id);
    db.prepare(Q.updateMemberStreak).run(memberId);
  } else if (log.new_done || log.review_done) {
    db.prepare("UPDATE daily_logs SET status = 'partial' WHERE id = ?").run(log.id);
  }
}

// Skip today
function skipToday(memberId, date) {
  db.prepare(Q.insertDailyLog).run(memberId, date);
  db.prepare(Q.updateDailyLogSkipped).run(memberId, date);
}

// Get member stats for progress display
function getMemberStats(memberId) {
  const member = db.prepare(Q.getMemberById).get(memberId);
  if (!member) return null;

  const result = { newCourse: null, reviewCourse: null, streak: member.streak };

  if (member.new_course_id) {
    const course = db.prepare(Q.getCourseById).get(member.new_course_id);
    if (course) {
      result.newCourse = {
        id: course.id, name: course.name, total: course.total_verses,
        position: member.new_position,
        completed: Math.max(0, member.new_position - 1),
        perWeek: member.new_per_week,
        finished: member.new_position > course.total_verses,
      };
    }
  }

  if (member.review_course_id) {
    const course = db.prepare(Q.getCourseById).get(member.review_course_id);
    if (course) {
      result.reviewCourse = {
        id: course.id, name: course.name, total: course.total_verses,
        position: member.review_position,
        perDay: member.review_per_day,
      };
    }
  }

  return result;
}

module.exports = { completeNew, completeReview, skipToday, getMemberStats };
