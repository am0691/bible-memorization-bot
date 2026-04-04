const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const db = require('../database/connection');
const Q = require('../database/statements');
const config = require('../config');
const { getNewVerses, getRecentReviewVerses, getReviewVerses } = require('../services/review');
const { getMotivationalVerse } = require('../utils/bible-verses');
const { notifyAdmin, buildDailyButtons } = require('../utils/messages');

function startDailyScheduler(client) {
  const [hour, minute] = config.dailyReminderTime.split(':');
  cron.schedule(`${minute} ${hour} * * *`, async () => {
    console.log(`[알림] 발송 시작 — ${new Date().toLocaleString('ko-KR')}`);
    await sendDailyReminders(client);
  }, { timezone: config.timezone });
  console.log(`[알림] 스케줄: 매일 ${config.dailyReminderTime} (KST)`);
}

async function sendDailyReminders(client) {
  const members = db.prepare(Q.getAllActiveMembers).all();
  let sent = 0, failed = 0;

  const today = new Date();
  const isSunday = today.getDay() === 0;

  // Reset streaks for members who missed yesterday
  resetMissedStreaks(members);

  for (const member of members) {
    // Sunday mode: skip if member has sunday_mode enabled
    if (isSunday && member.sunday_mode) {
      console.log(`[알림] ${member.discord_name} 주일 모드 — 건너뜀`);
      continue;
    }

    try {
      await sendReminderToMember(client, member);
      sent++;
      await new Promise(r => setTimeout(r, 500));
    } catch (error) {
      failed++;
      console.error(`[알림] ${member.discord_name} 실패:`, error.message);
      await notifyAdmin(client, config.adminId, `DM 발송 실패: ${member.discord_name} - ${error.message}`);
    }
  }
  console.log(`[알림] 완료 (성공: ${sent}, 실패: ${failed})`);
}

async function sendReminderToMember(client, member) {
  const today = new Date().toISOString().split('T')[0];
  const newVerses = member.is_new_active ? getNewVerses(member.id) : [];
  const recentVerses = member.is_recent_active ? getRecentReviewVerses(member.id) : [];
  const reviewVerses = member.is_old_active ? getReviewVerses(member.id) : [];

  // Create daily log
  db.prepare(Q.insertDailyLog).run(member.id, today);

  // Snapshot active tracks
  const activeTracks = [];
  if (member.is_new_active && newVerses.length > 0) activeTracks.push('new');
  if (member.is_recent_active && recentVerses.length > 0) activeTracks.push('recent');
  if (member.is_old_active && reviewVerses.length > 0) activeTracks.push('old');
  db.prepare(Q.updateDailyLogActiveTracks).run(activeTracks.join(','), member.id, today);

  const discordUser = await client.users.fetch(member.discord_id);
  const motivational = getMotivationalVerse();

  const embed = new EmbedBuilder()
    .setColor(0x4A90D9)
    .setTitle('📖 오늘의 암송')
    .setDescription(`🔥 연속 완료: **${member.streak}일**`)
    .setFooter({ text: `"${motivational.text}" — ${motivational.reference}` })
    .setTimestamp();

  // New verse section
  if (newVerses.length > 0 && newVerses.length <= 3) {
    const newList = newVerses.map(v =>
      `**${v.reference}** "${v.text}"`
    ).join('\n');
    embed.addFields({
      name: `🆕 새 구절 (${newVerses.length}개)`,
      value: newList,
      inline: false,
    });
  } else if (newVerses.length > 3) {
    embed.addFields({
      name: `🆕 새 구절 (${newVerses.length}개)`,
      value: newVerses.map(v => v.reference).join(', '),
      inline: false,
    });
  }

  // Recent review section
  if (recentVerses.length > 0) {
    embed.addFields({
      name: `🔄 최신 복습 (${recentVerses.length}개)`,
      value: recentVerses.map(v => v.reference).join(', '),
      inline: false,
    });
  }

  // Review section
  if (reviewVerses.length > 0) {
    embed.addFields({
      name: `📗 예전 복습 (${reviewVerses.length}개)`,
      value: reviewVerses.map(v => v.reference).join(', '),
      inline: false,
    });
  }

  if (newVerses.length === 0 && recentVerses.length === 0 && reviewVerses.length === 0) {
    embed.addFields({
      name: '📌 안내',
      value: '오늘 배정된 구절이 없습니다. /설정 에서 코스를 확인해주세요.',
    });
  }

  // Buttons — 트랙별 고유 스타일 (#2), 쉴게요 Secondary (#3)
  const showNewViewBtn = newVerses.length > 3;
  const components = buildDailyButtons(member.id, today, null, activeTracks, { showNewViewBtn });

  await discordUser.send({ embeds: [embed], components });
}

function resetMissedStreaks(members) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  for (const member of members) {
    if (member.streak === 0) continue;
    const log = db.prepare(Q.getDailyLog).get(member.id, yesterdayStr);
    if (!log || log.status !== 'complete') {
      db.prepare(Q.resetMemberStreak).run(member.id);
      console.log(`[스트릭] ${member.discord_name}: 리셋 (어제 미완료)`);
    }
  }
}

module.exports = { startDailyScheduler, sendDailyReminders, sendReminderToMember };
