const cron = require('node-cron');
const db = require('../database/connection');
const Q = require('../database/statements');
const config = require('../config');
const { advanceNewVersePointer } = require('../services/review');

function startNewVerseScheduler(client) {
  // Monday 00:01 — advance new verse pointers at start of week
  cron.schedule('1 0 * * 1', async () => {
    await advanceAllNewVerses();
  }, { timezone: config.timezone });
  console.log('[신규구절] 스케줄: 매주 월요일 00:01 (KST)');
}

async function advanceAllNewVerses() {
  const members = db.prepare(Q.getAllActiveMembers).all();

  for (const member of members) {
    const advanced = advanceNewVersePointer(member.id);
    if (advanced > 0) {
      console.log(`[신규구절] ${member.discord_name}: ${advanced}구절 전진 → ${member.new_position + advanced}번째`);
    }
  }
  console.log(`[신규구절] 전체 배정 완료 (${members.length}명)`);
}

module.exports = { startNewVerseScheduler, advanceAllNewVerses };
