const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../database/connection');
const Q = require('../database/statements');
const { completeNew, completeRecent, completeReview, skipToday } = require('../services/progress');
const { getNewVerses, getRecentReviewVerses, getReviewVerses } = require('../services/review');
const config = require('../config');

async function handleButton(interaction, client) {
  const parts = interaction.customId.split(':');
  const action = parts[0];

  // Onboarding goal button
  if (action === 'onboard_goal') {
    const registerHandler = require('../commands/register-handler');
    return registerHandler.handleGoalSelect(interaction);
  }

  // Team progress button
  if (action === 'team_progress') {
    return handleTeamProgress(interaction);
  }

  const memberId = parts[1];
  const date = parts[2];

  const member = db.prepare(Q.getMemberById).get(memberId);
  if (!member || member.discord_id !== interaction.user.id) {
    await interaction.reply({ content: '본인의 버튼만 사용할 수 있습니다.', flags: [MessageFlags.Ephemeral] });
    return;
  }

  switch (action) {
    case 'complete_new': {
      await interaction.deferUpdate();
      const log = db.prepare(Q.getDailyLog).get(memberId, date);
      if (log && log.new_done) {
        await interaction.followUp({ content: '이미 암송 완료 처리되었습니다!', flags: [MessageFlags.Ephemeral] });
        return;
      }
      completeNew(memberId, date);

      const updatedLog = db.prepare(Q.getDailyLog).get(memberId, date);
      const updatedMember = db.prepare(Q.getMemberById).get(memberId);

      if (updatedLog && updatedLog.status === 'complete') {
        await postCertification(client, updatedMember);
      }

      const embed = new EmbedBuilder().setColor(0x57F287).setTitle('✅ 새 구절 암송 완료!')
        .setDescription('이번 주 새 구절을 잘 외우고 계시네요! 🙏');
      if (updatedLog && updatedLog.status === 'complete') {
        embed.addFields({ name: '🎉', value: `오늘 모든 암송 완료! 연속 **${updatedMember.streak}일**` });
      }
      await interaction.followUp({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
      break;
    }

    case 'complete_recent': {
      await interaction.deferUpdate();
      const log = db.prepare(Q.getDailyLog).get(memberId, date);
      if (log && log.recent_done) {
        await interaction.followUp({ content: '이미 최신 복습 완료 처리되었습니다!', flags: [MessageFlags.Ephemeral] });
        return;
      }
      completeRecent(memberId, date);

      const updatedLog = db.prepare(Q.getDailyLog).get(memberId, date);
      const updatedMember = db.prepare(Q.getMemberById).get(memberId);

      if (updatedLog && updatedLog.status === 'complete') {
        await postCertification(client, updatedMember);
      }

      const embed = new EmbedBuilder().setColor(0x57F287).setTitle('✅ 최신 복습 완료!')
        .setDescription('최근에 배운 구절들을 잘 복습하셨습니다! 🔄');
      if (updatedLog && updatedLog.status === 'complete') {
        embed.addFields({ name: '🎉', value: `오늘 모든 암송 완료! 연속 **${updatedMember.streak}일**` });
      }
      await interaction.followUp({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
      break;
    }

    case 'complete_review': {
      await interaction.deferUpdate();
      const log = db.prepare(Q.getDailyLog).get(memberId, date);
      if (log && log.review_done) {
        await interaction.followUp({ content: '이미 복습 완료 처리되었습니다!', flags: [MessageFlags.Ephemeral] });
        return;
      }
      completeReview(memberId, date);

      const updatedLog = db.prepare(Q.getDailyLog).get(memberId, date);
      const updatedMember = db.prepare(Q.getMemberById).get(memberId);

      if (updatedLog && updatedLog.status === 'complete') {
        await postCertification(client, updatedMember);
      }

      const embed = new EmbedBuilder().setColor(0x57F287).setTitle('✅ 복습 완료!')
        .setDescription('복습 포인터가 다음 구절로 이동했습니다! 📗');
      if (updatedLog && updatedLog.status === 'complete') {
        embed.addFields({ name: '🎉', value: `오늘 모든 암송 완료! 연속 **${updatedMember.streak}일**` });
      }
      await interaction.followUp({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
      break;
    }

    case 'skip_today': {
      await interaction.deferUpdate();
      skipToday(memberId, date);
      const embed = new EmbedBuilder().setColor(0x99AAB5).setTitle('😴 오늘 하루 쉬어가요')
        .setDescription('괜찮아요, 내일 다시 말씀과 함께해요 🌅');
      await interaction.editReply({ embeds: [embed], components: [] });
      break;
    }

    case 'view_new': {
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      const verses = getNewVerses(memberId);
      const text = verses.map((v, i) => `**${v.order_num}. ${v.reference}**\n"${v.text}"`).join('\n\n');
      const embed = new EmbedBuilder().setColor(0x4A90D9).setTitle('📖 이번 주 새 구절')
        .setDescription(text || '이번 주 배정된 새 구절이 없습니다.');
      await interaction.editReply({ embeds: [embed] });
      break;
    }

    case 'view_recent': {
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      const verses = getRecentReviewVerses(memberId);
      const text = verses.map((v, i) => `**${v.order_num}. ${v.reference}**\n"${v.text}"`).join('\n\n');
      const embed = new EmbedBuilder().setColor(0xE2B04A).setTitle('🔄 최신 복습 구절')
        .setDescription(text || '최신 복습 구절이 없습니다.');
      await interaction.editReply({ embeds: [embed] });
      break;
    }

    case 'view_review': {
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      const verses = getReviewVerses(memberId);
      const text = verses.map((v, i) => `**${v.order_num}. ${v.reference}**\n"${v.text}"`).join('\n\n');
      const embed = new EmbedBuilder().setColor(0x57F287).setTitle('📗 오늘의 복습 구절')
        .setDescription(text || '복습 구절이 없습니다. /설정 에서 복습 코스를 설정하세요.');
      await interaction.editReply({ embeds: [embed] });
      break;
    }

    case 'settings_toggle': {
      await interaction.deferUpdate();
      const newActive = member.is_active ? 0 : 1;
      db.prepare(Q.updateMemberActive).run(newActive, memberId);
      const toggleMsg = newActive
        ? '🔔 알림이 다시 활성화되었습니다! (`/설정`에서 현황 확인)'
        : '🔕 알림이 일시정지되었습니다. `/설정`에서 다시 켤 수 있습니다.';
      await interaction.followUp({ content: toggleMsg, flags: [MessageFlags.Ephemeral] });
      break;
    }

    case 'settings_sunday': {
      await interaction.deferUpdate();
      const newMode = member.sunday_mode ? 0 : 1;
      db.prepare(Q.updateMemberSundayMode).run(newMode, memberId);
      const sundayMsg = newMode
        ? '🔕 주일 알림이 꺼졌습니다. 일요일에는 알림을 보내지 않습니다.'
        : '🔔 주일 알림이 켜졌습니다. 일요일에도 알림을 보냅니다.';
      await interaction.followUp({ content: sundayMsg, flags: [MessageFlags.Ephemeral] });
      break;
    }
  }
}

async function handleTeamProgress(interaction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const members = db.prepare(Q.getAllActiveMembers).all();
  const { getMemberStats } = require('../services/progress');
  const { buildProgressBar } = require('../utils/messages');

  const lines = [];
  for (const m of members) {
    const stats = getMemberStats(m.id);
    let line = `**${m.discord_name}**`;
    if (stats.newCourse) {
      const nc = stats.newCourse;
      line += `\n📘 ${nc.name}: ${nc.completed}/${nc.total}`;
      if (!nc.finished) line += ` (이번 주 ${nc.position}번째~)`;
    }
    if (stats.reviewCourse) {
      const rc = stats.reviewCourse;
      line += `\n📗 복습: ${rc.name} ${rc.position}번째`;
    }
    line += `\n🔥 연속 ${stats.streak}일`;
    lines.push(line);
  }

  const embed = new EmbedBuilder()
    .setColor(0xE2B04A)
    .setTitle('👥 팀 암송 현황')
    .setDescription(lines.join('\n\n') || '등록된 멤버가 없습니다.')
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function postCertification(client, member) {
  if (!config.certChannelId) return;
  try {
    const channel = await client.channels.fetch(config.certChannelId);
    const streak = member.streak;
    const streakEmoji = streak >= 30 ? '🔥🔥🔥' : streak >= 14 ? '🔥🔥' : streak >= 7 ? '🔥' : '✨';
    const embed = new EmbedBuilder().setColor(0x57F287)
      .setTitle(`${streakEmoji} 암송 완료!`)
      .setDescription(`<@${member.discord_id}>님이 오늘 암송+복습 모두 완료!`)
      .addFields({ name: '연속 완료', value: `${streak}일`, inline: true })
      .setTimestamp();
    await channel.send({ embeds: [embed] });
  } catch (e) {
    console.error('[인증] 채널 게시 실패:', e.message);
  }
}

module.exports = { handleButton };
