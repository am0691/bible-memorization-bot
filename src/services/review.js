const db = require('../database/connection');
const Q = require('../database/statements');

// Get this week's new verses for a member
function getNewVerses(memberId) {
  const member = db.prepare(Q.getMemberById).get(memberId);
  if (!member || !member.new_course_id) return [];

  const course = db.prepare(Q.getCourseById).get(member.new_course_id);
  if (!course) return [];

  // If position exceeds course total, no more new verses
  if (member.new_position > course.total_verses) return [];

  const endPos = Math.min(member.new_position + member.new_per_week, course.total_verses + 1);
  return db.prepare(Q.getVersesInRange).all(member.new_course_id, member.new_position, endPos);
}

// Get recent review verses (dynamic range based on new_position)
function getRecentReviewVerses(memberId) {
  const member = db.prepare(Q.getMemberById).get(memberId);
  if (!member || !member.is_recent_active || !member.new_course_id) return [];

  const effectiveEnd = member.new_position - 1;
  if (effectiveEnd <= 0) return [];

  const effectiveStart = Math.max(1, effectiveEnd - member.recent_count + 1);
  return db.prepare(Q.getVersesInRange).all(
    member.new_course_id, effectiveStart, effectiveEnd + 1
  );
}

// Get today's review verses (sequential cycling)
function getReviewVerses(memberId) {
  const member = db.prepare(Q.getMemberById).get(memberId);
  if (!member || !member.review_course_id) return [];

  const course = db.prepare(Q.getCourseById).get(member.review_course_id);
  if (!course || course.total_verses === 0) return [];

  // Determine effective range
  let total;
  if (member.review_course_id === member.new_course_id) {
    // Only review verses already learned (before new_position)
    total = member.new_position - 1;
    if (total <= 0) return [];
  } else {
    total = course.total_verses;
  }

  const count = Math.min(member.review_per_day, total);
  const verses = [];

  for (let i = 0; i < count; i++) {
    const orderNum = ((member.review_position - 1 + i) % total) + 1;
    const verse = db.prepare(Q.getVerseByOrder).get(member.review_course_id, orderNum);
    if (verse) verses.push(verse);
  }

  return verses;
}

// Advance review pointer after completion
function advanceReviewPointer(memberId) {
  const member = db.prepare(Q.getMemberById).get(memberId);
  if (!member || !member.review_course_id) return;

  const course = db.prepare(Q.getCourseById).get(member.review_course_id);
  if (!course || course.total_verses === 0) return;

  // Determine effective total for this course
  let total;
  if (member.review_course_id === member.new_course_id) {
    total = member.new_position - 1;
    if (total <= 0) return;
  } else {
    total = course.total_verses;
  }

  const newPos = member.review_position + member.review_per_day;

  // Check if we've completed a full cycle of this course
  if (newPos > total) {
    // Try to advance to next course
    if (member.review_course_id === member.new_course_id) {
      // Reached end of learned range in current course — restart from first course
      const firstCourse = db.prepare(Q.getFirstCourse).get();
      if (firstCourse) {
        db.prepare(Q.updateMemberReviewCourse).run(firstCourse.id, 1, memberId);
      }
    } else {
      // Try next course, but don't go beyond new_course_id
      const nextCourse = db.prepare(Q.getNextCourse).get(member.review_course_id);
      if (nextCourse && nextCourse.id <= member.new_course_id) {
        db.prepare(Q.updateMemberReviewCourse).run(nextCourse.id, 1, memberId);
      } else {
        // No next course or would exceed — restart from first
        const firstCourse = db.prepare(Q.getFirstCourse).get();
        if (firstCourse) {
          db.prepare(Q.updateMemberReviewCourse).run(firstCourse.id, 1, memberId);
        }
      }
    }
  } else {
    // Normal advance within same course
    db.prepare(Q.updateMemberReviewPosition).run(newPos, memberId);
  }
}

// Advance new verse pointer (called weekly by scheduler)
function advanceNewVersePointer(memberId) {
  const member = db.prepare(Q.getMemberById).get(memberId);
  if (!member || !member.new_course_id) return 0;

  const course = db.prepare(Q.getCourseById).get(member.new_course_id);
  if (!course) return 0;

  // Already completed this course
  if (member.new_position > course.total_verses) {
    // Try auto-advance to next course
    const nextCourse = db.prepare(Q.getNextCourse).get(member.new_course_id);
    if (nextCourse) {
      // Preserve existing review_position for this course (don't contaminate with current review course's position)
      const prevSaved = loadCourseProgress(member.id, member.new_course_id);
      const prevReviewPos = prevSaved ? prevSaved.review_position : 1;
      saveCourseProgress(member.id, member.new_course_id, course.total_verses + 1, prevReviewPos);
      db.prepare(Q.updateMemberNewCourse).run(nextCourse.id, 1, member.id);
      return 0;
    }
    return 0;
  }

  const newPos = Math.min(member.new_position + member.new_per_week, course.total_verses + 1);
  const advanced = newPos - member.new_position;
  db.prepare(Q.updateMemberNewPosition).run(newPos, memberId);

  // If we just finished the course, auto-advance
  if (newPos > course.total_verses) {
    const nextCourse = db.prepare(Q.getNextCourse).get(member.new_course_id);
    if (nextCourse) {
      const prevSaved = loadCourseProgress(member.id, member.new_course_id);
      const prevReviewPos = prevSaved ? prevSaved.review_position : 1;
      saveCourseProgress(member.id, member.new_course_id, newPos, prevReviewPos);
      db.prepare(Q.updateMemberNewCourse).run(nextCourse.id, 1, member.id);
    }
  }

  return advanced;
}

// Get section-based progress for a course
function getSectionProgress(courseId, completedUpTo) {
  const sections = db.prepare(Q.getCourseSections).all(courseId);
  if (!sections || sections.length === 0) {
    const course = db.prepare(Q.getCourseById).get(courseId);
    if (!course) return [];
    return [{ section: course.name, start_num: 1, end_num: course.total_verses, count: course.total_verses,
      done: Math.min(completedUpTo, course.total_verses), complete: completedUpTo >= course.total_verses }];
  }

  return sections.map(s => {
    const done = Math.max(0, Math.min(completedUpTo, s.end_num) - s.start_num + 1);
    return {
      ...s,
      done: Math.max(0, done),
      complete: completedUpTo >= s.end_num,
    };
  });
}

// Save course progress before switching
function saveCourseProgress(memberId, courseId, newPosition, reviewPosition) {
  db.prepare(Q.saveCourseProgress).run(memberId, courseId, newPosition, reviewPosition);
}

// Load course progress when switching back
function loadCourseProgress(memberId, courseId) {
  return db.prepare(Q.getCourseProgress).get(memberId, courseId);
}

// Check if member has pending new verses (position not past course end)
function hasNewVerses(memberId) {
  const member = db.prepare(Q.getMemberById).get(memberId);
  if (!member || !member.new_course_id) return false;
  const course = db.prepare(Q.getCourseById).get(member.new_course_id);
  return course && member.new_position <= course.total_verses;
}

// Check if member has review configured
function hasReview(memberId) {
  const member = db.prepare(Q.getMemberById).get(memberId);
  return member && member.review_course_id != null;
}

// Check if member has active recent review
function hasRecentReview(memberId) {
  const member = db.prepare(Q.getMemberById).get(memberId);
  if (!member || !member.is_recent_active || !member.new_course_id) return false;
  return (member.new_position - 1) > 0;
}

module.exports = {
  getNewVerses, getRecentReviewVerses, getReviewVerses,
  advanceReviewPointer, advanceNewVersePointer,
  getSectionProgress, saveCourseProgress, loadCourseProgress,
  hasNewVerses, hasRecentReview, hasReview,
};
