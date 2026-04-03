const cron = require('node-cron');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const db = require('../database/connection');
const Q = require('../database/statements');
const config = require('../config');
const { getNewVerses, getRecentReviewVerses, getReviewVerses } = require('../services/review');
const { getMotivationalVerse } = require('../utils/bible-verses');
const { notifyAdmin } = require('../utils/messages');

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
    .setDescription(`> *"${motivational.text}"*\n> — ${motivational.reference}`)
    .setTimestamp();

  // New verse section
  if (newVerses.length > 0) {
    const newCourse = db.prepare(Q.getCourseById).get(member.new_course_id);
    const newList = newVerses.map(v => {
      const sectionTag = v.section ? ` | ${v.section}` : '';
      return `${v.order_num}. **${v.reference}**${sectionTag}\n> ${v.text_short || v.text.substring(0, 40) + '...'}`;
    }).join('\n');

    embed.addFields({
      name: `🆕 이번 주 새 구절 (${newVerses.length}구절) — ${newCourse?.name || ''}`,
      value: newList,
      inline: false,
    });
  }

  // Recent review section
  if (recentVerses.length > 0) {
    const newCourse = db.prepare(Q.getCourseById).get(member.new_course_id);
    const recentList = recentVerses.map(v => {
      const sectionTag = v.section ? ` | ${v.section}` : '';
      return `${v.order_num}. **${v.reference}**${sectionTag}`;
    }).join('\n');

    embed.addFields({
      name: `🔄 최신 복습 (${recentVerses.length}구절) — ${newCourse?.name || ''}`,
      value: recentList,
      inline: false,
    });
  }

  // Review section
  if (reviewVerses.length > 0) {
    const reviewCourse = db.prepare(Q.getCourseById).get(member.review_course_id);
    const reviewList = reviewVerses.map(v => {
      const sectionTag = v.section ? ` | ${v.section}` : '';
      return `${v.order_num}. **${v.reference}**${sectionTag}`;
    }).join('\n');

    embed.addFields({
      name: `📗 오늘의 복습 (${reviewVerses.length}구절) — ${reviewCourse?.name || ''}`,
      value: reviewList,
      inline: false,
    });
  }

  if (newVerses.length === 0 && recentVerses.length === 0 && reviewVerses.length === 0) {
    embed.addFields({
      name: '📌 안내',
      value: '오늘 배정된 구절이 없습니다. /설정 에서 코스를 확인해주세요.',
    });
  }

  // Stats line
  embed.addFields({
    name: '📊 현황',
    value: `🔥 연속 완료: **${member.streak}일**`,
    inline: false,
  });

  // Buttons
  const row1 = new ActionRowBuilder();
  if (newVerses.length > 0) {
    row1.addComponents(
      new ButtonBuilder().setCustomId(`complete_new:${member.id}:${today}`).setLabel('✅ 암송 완료').setStyle(ButtonStyle.Success),
    );
  }
  if (recentVerses.length > 0) {
    row1.addComponents(
      new ButtonBuilder().setCustomId(`complete_recent:${member.id}:${today}`).setLabel('✅ 최신 복습 완료').setStyle(ButtonStyle.Success),
    );
  }
  if (reviewVerses.length > 0) {
    row1.addComponents(
      new ButtonBuilder().setCustomId(`complete_review:${member.id}:${today}`).setLabel('✅ 복습 완료').setStyle(ButtonStyle.Success),
    );
  }
  row1.addComponents(
    new ButtonBuilder().setCustomId(`skip_today:${member.id}:${today}`).setLabel('😴 쉴게요').setStyle(ButtonStyle.Danger),
  );

  const row2 = new ActionRowBuilder();
  if (newVerses.length > 0) {
    row2.addComponents(
      new ButtonBuilder().setCustomId(`view_new:${member.id}:${today}`).setLabel('📖 새구절 전문').setStyle(ButtonStyle.Secondary),
    );
  }
  if (recentVerses.length > 0) {
    row2.addComponents(
      new ButtonBuilder().setCustomId(`view_recent:${member.id}:${today}`).setLabel('📖 최신 전문').setStyle(ButtonStyle.Secondary),
    );
  }
  if (reviewVerses.length > 0) {
    row2.addComponents(
      new ButtonBuilder().setCustomId(`view_review:${member.id}:${today}`).setLabel('📖 복습 전문').setStyle(ButtonStyle.Secondary),
    );
  }

  const components = [row1];
  if (row2.components.length > 0) components.push(row2);

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
