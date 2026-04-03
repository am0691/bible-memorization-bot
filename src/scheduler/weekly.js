const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const db = require('../database/connection');
const Q = require('../database/statements');
const config = require('../config');
const { getMemberStats } = require('../services/progress');
const { getSectionProgress } = require('../services/review');
const { buildProgressBar } = require('../utils/messages');

function startWeeklyScheduler(client) {
  cron.schedule('0 20 * * 0', async () => {
    await sendWeeklyReport(client);
  }, { timezone: config.timezone });
  console.log('[리포트] 스케줄: 매주 일요일 20:00 (KST)');
}

async function sendWeeklyReport(client) {
  if (!config.reportChannelId) return;

  const channel = await client.channels.fetch(config.reportChannelId);
  const members = db.prepare(Q.getAllActiveMembers).all();

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);
  const startStr = weekStart.toISOString().split('T')[0];
  const endStr = now.toISOString().split('T')[0];

  const memberLines = [];
  let mvp = null;
  let mvpScore = -1;

  for (const member of members) {
    const stats = getMemberStats(member.id);
    const weekLogs = db.prepare(
      'SELECT * FROM daily_logs WHERE member_id = ? AND log_date BETWEEN ? AND ?'
    ).all(member.id, startStr, endStr);

    const completeDays = weekLogs.filter(l => l.status === 'complete').length;

    // MVP: streak + completion rate
    const score = member.streak + completeDays;
    if (score > mvpScore) { mvpScore = score; mvp = member.discord_name; }

    const weekDots = '🟢'.repeat(completeDays) + '⚪'.repeat(Math.max(0, 7 - completeDays));

    let line = `**${member.discord_name}** — 🔥 ${member.streak}일\n이번 주: ${weekDots} (${completeDays}/7)`;

    // New course progress
    if (stats.newCourse) {
      const nc = stats.newCourse;
      line += `\n📘 ${nc.name}: ${buildProgressBar(nc.completed, nc.total, 8)}`;

      // Section breakdown (compact)
      const sections = getSectionProgress(nc.id, nc.completed);
      if (sections.length > 1) {
        const sectionLine = sections.map(s => {
          const check = s.complete ? '✅' : `${s.done}/${s.count}`;
          return `${(s.section || '').split('.')[0] || '-'}:${check}`;
        }).join(' | ');
        line += `\n> ${sectionLine}`;
      }
    }

    // Review info
    if (stats.reviewCourse) {
      line += `\n📗 복습: ${stats.reviewCourse.name} (${stats.reviewCourse.position}번째)`;
    }

    memberLines.push(line);
  }

  // Calculate team totals
  let totalCompleted = 0;
  for (const m of members) {
    const s = getMemberStats(m.id);
    if (s.newCourse) totalCompleted += s.newCourse.completed;
  }

  const embed = new EmbedBuilder()
    .setColor(0xE2B04A)
    .setTitle('📊 주간 암송 리포트')
    .setDescription(`**${startStr} ~ ${endStr}**\n\n👑 이번 주 MVP: **${mvp || '-'}**\n📚 팀 누적 암송: **${totalCompleted}구절**`)
    .setFooter({ text: '성경암송팀 봇' })
    .setTimestamp();

  for (const line of memberLines) {
    embed.addFields({ name: '\u200b', value: line, inline: false });
  }

  await channel.send({ embeds: [embed] });
  console.log('[리포트] 주간 리포트 발송 완료');
}

module.exports = { startWeeklyScheduler, sendWeeklyReport };
