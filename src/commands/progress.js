const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const db = require('../database/connection');
const Q = require('../database/statements');
const { getMemberStats } = require('../services/progress');
const { getSectionProgress } = require('../services/review');
const { buildProgressBar } = require('../utils/messages');

module.exports = {
  async execute(interaction) {
    const discordId = interaction.user.id;
    const member = db.prepare(Q.getMemberByDiscordId).get(discordId);

    if (!member) {
      await interaction.reply({ content: '먼저 /등록 을 해주세요!', flags: [MessageFlags.Ephemeral] });
      return;
    }

    const stats = getMemberStats(member.id);

    const embed = new EmbedBuilder()
      .setColor(0x4A90D9)
      .setTitle('📊 나의 암송 진도')
      .setTimestamp();

    // New verse section
    if (stats.newCourse) {
      const nc = stats.newCourse;
      const sectionProgress = getSectionProgress(nc.id, nc.completed);
      const sectionText = sectionProgress.map(s => {
        const check = s.complete ? ' ✅' : '';
        return `${s.section || nc.name}: ${s.done}/${s.count}${check}`;
      }).join('\n');

      embed.addFields(
        { name: '━━ 🆕 새 구절 ━━', value: '\u200b', inline: false },
        { name: '코스', value: `${nc.name} (${nc.total}구절)`, inline: true },
        { name: '진도', value: nc.finished ? '🎉 전체 완료!' : `${nc.completed}/${nc.total} 외움`, inline: true },
        { name: '이번 주', value: nc.finished ? '-' : `${nc.position}번째부터 ${nc.perWeek}구절`, inline: true },
        { name: '전체 진행률', value: buildProgressBar(nc.completed, nc.total), inline: false },
      );

      if (sectionProgress.length > 1) {
        embed.addFields({ name: '섹션별 진도', value: sectionText, inline: false });
      }
    }

    // Review section
    if (stats.reviewCourse) {
      const rc = stats.reviewCourse;
      embed.addFields(
        { name: '━━ 📗 복습 ━━', value: '\u200b', inline: false },
        { name: '코스', value: `${rc.name} (${rc.total}구절)`, inline: true },
        { name: '현재 위치', value: `${rc.position}번째`, inline: true },
        { name: '일일 목표', value: `${rc.perDay}구절/일`, inline: true },
      );
    }

    embed.addFields(
      { name: '━━ 🔥 기록 ━━', value: '\u200b', inline: false },
      { name: '연속 완료', value: `${stats.streak}일`, inline: true },
    );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`team_progress:${member.id}`).setLabel('👥 팀 현황 보기').setStyle(ButtonStyle.Secondary),
    );

    await interaction.reply({ embeds: [embed], components: [row], flags: [MessageFlags.Ephemeral] });
  },
};
