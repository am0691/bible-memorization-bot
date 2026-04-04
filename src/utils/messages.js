const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

async function notifyAdmin(client, adminId, errorMsg) {
  if (!adminId) return;
  try {
    const admin = await client.users.fetch(adminId);
    await admin.send(`⚠️ **봇 오류 알림**\n\`\`\`${errorMsg}\`\`\``);
  } catch (e) {
    console.error('[알림] 관리자 DM 전송 실패:', e.message);
  }
}

function buildProgressBar(current, total, length = 10) {
  const filled = Math.round((current / total) * length);
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty) + ` ${current}/${total}`;
}

/**
 * 일일 알림 버튼 생성 (daily.js 초기 발송 + buttons.js 업데이트 공용)
 * @param {number} memberId
 * @param {string} date - YYYY-MM-DD
 * @param {object|null} dailyLog - null이면 초기 상태 (모두 미완료)
 * @param {string[]} activeTracks - ['new', 'recent', 'old']
 */
function buildDailyButtons(memberId, date, dailyLog, activeTracks) {
  const hasNew = activeTracks.includes('new');
  const hasRecent = activeTracks.includes('recent');
  const hasReview = activeTracks.includes('old');
  const allDone = dailyLog?.status === 'complete';

  const row1 = new ActionRowBuilder();

  if (hasNew) {
    const done = !!dailyLog?.new_done;
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`complete_new:${memberId}:${date}`)
        .setLabel(done ? '✅ 새 구절 ✓' : '🆕 새 구절 완료')
        .setStyle(done ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setDisabled(done),
    );
  }

  if (hasRecent) {
    const done = !!dailyLog?.recent_done;
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`complete_recent:${memberId}:${date}`)
        .setLabel(done ? '✅ 최신 복습 ✓' : '🔄 최신 복습 완료')
        .setStyle(done ? ButtonStyle.Secondary : ButtonStyle.Primary)
        .setDisabled(done),
    );
  }

  if (hasReview) {
    const done = !!dailyLog?.review_done;
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`complete_review:${memberId}:${date}`)
        .setLabel(done ? '✅ 복습 ✓' : '📗 복습 완료')
        .setStyle(done ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setDisabled(done),
    );
  }

  if (!allDone && row1.components.length > 0) {
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`skip_today:${memberId}:${date}`)
        .setLabel('💤 쉴게요')
        .setStyle(ButtonStyle.Secondary),
    );
  }

  const row2 = new ActionRowBuilder();
  if (hasNew) {
    row2.addComponents(new ButtonBuilder().setCustomId(`view_new:${memberId}:${date}`).setLabel('📖 새구절 전문').setStyle(ButtonStyle.Secondary));
  }
  if (hasRecent) {
    row2.addComponents(new ButtonBuilder().setCustomId(`view_recent:${memberId}:${date}`).setLabel('📖 최신 전문').setStyle(ButtonStyle.Secondary));
  }
  if (hasReview) {
    row2.addComponents(new ButtonBuilder().setCustomId(`view_review:${memberId}:${date}`).setLabel('📖 복습 전문').setStyle(ButtonStyle.Secondary));
  }

  const components = [];
  if (row1.components.length > 0) components.push(row1);
  if (row2.components.length > 0) components.push(row2);

  return components;
}

/**
 * 완료 버튼 클릭 후 원본 embed 업데이트
 * @param {object} originalEmbed - interaction.message.embeds[0]
 * @param {'new'|'recent'|'review'} trackType
 * @param {object} updatedLog - daily_logs row
 * @param {object} updatedMember - members row
 * @param {string[]} activeTracks
 */
function updateEmbedAfterCompletion(originalEmbed, trackType, updatedLog, updatedMember, activeTracks) {
  const embed = EmbedBuilder.from(originalEmbed);
  const fields = [...(embed.data.fields || [])];

  const emojiMap = { new: '🆕', recent: '🔄', review: '📗' };
  const emoji = emojiMap[trackType];

  // Mark completed track field
  for (let i = 0; i < fields.length; i++) {
    if (fields[i].name.startsWith(emoji)) {
      fields[i] = { ...fields[i], name: fields[i].name.replace(emoji, '✅') };
      break;
    }
  }

  // Update stats field
  const allDone = updatedLog.status === 'complete';
  const statsIdx = fields.findIndex(f => f.name === '📊 현황');
  if (statsIdx >= 0) {
    if (allDone) {
      fields[statsIdx] = {
        name: '📊 현황',
        value: `🎉 오늘 모든 암송 완료! 연속 **${updatedMember.streak}일**`,
        inline: false,
      };
    } else {
      const remaining = [];
      if (activeTracks.includes('new') && !updatedLog.new_done) remaining.push('🆕 새 구절');
      if (activeTracks.includes('recent') && !updatedLog.recent_done) remaining.push('🔄 최신 복습');
      if (activeTracks.includes('old') && !updatedLog.review_done) remaining.push('📗 예전 복습');
      fields[statsIdx] = {
        name: '📊 현황',
        value: `🔥 연속 완료: **${updatedMember.streak}일** | 남은: ${remaining.join(' · ')}`,
        inline: false,
      };
    }
  }

  embed.setFields(fields);
  if (allDone) embed.setColor(0x57F287);

  return embed;
}

module.exports = { notifyAdmin, buildProgressBar, buildDailyButtons, updateEmbedAfterCompletion };
