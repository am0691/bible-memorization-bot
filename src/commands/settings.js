const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const db = require('../database/connection');
const Q = require('../database/statements');
const { saveCourseProgress, loadCourseProgress } = require('../services/review');

module.exports = {
  async execute(interaction) {
    const member = db.prepare(Q.getMemberByDiscordId).get(interaction.user.id);
    if (!member) {
      await interaction.reply({ content: '먼저 /등록 을 해주세요!', flags: [MessageFlags.Ephemeral] });
      return;
    }

    await showSettingsMenu(interaction, member);
  },

  async handleSelect(interaction) {
    const [action, memberId] = interaction.customId.split(':');
    const member = db.prepare(Q.getMemberById).get(memberId);
    if (!member || member.discord_id !== interaction.user.id) return;

    switch (action) {
      case 'settings_menu': return handleMenuSelect(interaction, member);
      case 'settings_new_course': return handleNewCourseChange(interaction, member);
      case 'settings_new_perweek': return handleNewPerWeekChange(interaction, member);
      case 'settings_review_course': return handleReviewCourseChange(interaction, member);
    }
  },

  async handleModal(interaction) {
    const [action, memberId] = interaction.customId.split(':');
    const member = db.prepare(Q.getMemberById).get(memberId);
    if (!member || member.discord_id !== interaction.user.id) return;

    switch (action) {
      case 'modal_new_position': {
        const course = db.prepare(Q.getCourseById).get(member.new_course_id);
        const input = interaction.fields.getTextInputValue('position_input');
        const pos = parseInt(input, 10);
        if (isNaN(pos) || pos < 1 || pos > course.total_verses) {
          await interaction.reply({ content: `❌ 1~${course.total_verses} 사이의 숫자를 입력해주세요.`, flags: [MessageFlags.Ephemeral] });
          return;
        }
        db.prepare(Q.updateMemberNewPosition).run(pos, member.id);
        await interaction.reply({ content: `✅ 새구절 시작점이 **${pos}번째**로 변경되었습니다!`, flags: [MessageFlags.Ephemeral] });
        break;
      }
      case 'modal_review_position': {
        const course = db.prepare(Q.getCourseById).get(member.review_course_id);
        const maxPos = (member.review_course_id === member.new_course_id)
          ? Math.max(member.new_position - 1, 1)
          : course.total_verses;
        const input = interaction.fields.getTextInputValue('position_input');
        const pos = parseInt(input, 10);
        if (isNaN(pos) || pos < 1 || pos > maxPos) {
          await interaction.reply({ content: `❌ 1~${maxPos} 사이의 숫자를 입력해주세요.`, flags: [MessageFlags.Ephemeral] });
          return;
        }
        db.prepare(Q.updateMemberReviewPosition).run(pos, member.id);
        await interaction.reply({ content: `✅ 복습 시작점이 **${pos}번째**로 변경되었습니다!`, flags: [MessageFlags.Ephemeral] });
        break;
      }
      case 'modal_review_perday': {
        const input = interaction.fields.getTextInputValue('perday_input');
        const val = parseInt(input, 10);
        if (isNaN(val) || val < 1 || val > 50) {
          await interaction.reply({ content: '❌ 1~50 사이의 숫자를 입력해주세요.', flags: [MessageFlags.Ephemeral] });
          return;
        }
        db.prepare(Q.updateMemberReviewPerDay).run(val, member.id);
        await interaction.reply({ content: `✅ 일일 복습이 **${val}구절/일**로 변경되었습니다!`, flags: [MessageFlags.Ephemeral] });
        break;
      }
    }
  },
};

async function showSettingsMenu(interaction, member, isUpdate = false) {
  const newCourse = member.new_course_id ? db.prepare(Q.getCourseById).get(member.new_course_id) : null;
  const reviewCourse = member.review_course_id ? db.prepare(Q.getCourseById).get(member.review_course_id) : null;
  const statusText = member.is_active ? '🟢 활성' : '🔴 비활성';
  const sundayText = member.sunday_mode ? '🔕 꺼짐' : '🔔 켜짐';

  const newPosText = newCourse
    ? (member.new_position > newCourse.total_verses ? '전체 완료' : `${member.new_position}번째`)
    : '-';

  const embed = new EmbedBuilder()
    .setColor(0x4A90D9)
    .setTitle('⚙️ 나의 암송 설정')
    .addFields(
      { name: '━━ 🆕 새 구절 ━━', value: '\u200b', inline: false },
      { name: '📚 코스', value: newCourse ? `${newCourse.name} (${newCourse.total_verses}구절)` : '-', inline: true },
      { name: '📍 현재 위치', value: newPosText, inline: true },
      { name: '📊 주간 목표', value: `${member.new_per_week}구절/주`, inline: true },
      { name: '━━ 📗 복습 ━━', value: '\u200b', inline: false },
      { name: '📚 코스', value: reviewCourse ? `${reviewCourse.name} (${reviewCourse.total_verses}구절)` : '없음', inline: true },
      { name: '📍 현재 위치', value: reviewCourse ? `${member.review_position}번째` : '-', inline: true },
      { name: '📊 일일 목표', value: `${member.review_per_day}구절/일`, inline: true },
      { name: '━━ 🔔 알림 ━━', value: '\u200b', inline: false },
      { name: '알림', value: statusText, inline: true },
      { name: '주일 알림', value: sundayText, inline: true },
      { name: '연속 완료', value: `${member.streak}일 🔥`, inline: true },
    )
    .setTimestamp();

  const settingsMenu = new StringSelectMenuBuilder()
    .setCustomId(`settings_menu:${member.id}`)
    .setPlaceholder('변경할 항목을 선택하세요')
    .addOptions(
      { label: '🆕 새구절 코스 변경', value: 'new_course' },
      { label: '📍 새구절 시작점 변경', value: 'new_position' },
      { label: '📊 주간 새구절 수 변경', value: 'new_perweek' },
      { label: '📗 복습 코스 변경', value: 'review_course' },
      { label: '📍 복습 시작점 변경', value: 'review_position' },
      { label: '📊 일일 복습 수 변경', value: 'review_perday' },
    );

  const toggleBtn = new ButtonBuilder()
    .setCustomId(`settings_toggle:${member.id}`)
    .setLabel(member.is_active ? '🔕 알림 일시정지' : '🔔 알림 다시 받기')
    .setStyle(member.is_active ? ButtonStyle.Danger : ButtonStyle.Success);

  const sundayBtn = new ButtonBuilder()
    .setCustomId(`settings_sunday:${member.id}`)
    .setLabel(member.sunday_mode ? '🔔 주일 알림 켜기' : '🔕 주일 알림 끄기')
    .setStyle(member.sunday_mode ? ButtonStyle.Success : ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder().addComponents(settingsMenu);
  const row2 = new ActionRowBuilder().addComponents(toggleBtn, sundayBtn);

  const payload = { embeds: [embed], components: [row1, row2], flags: [MessageFlags.Ephemeral] };
  if (isUpdate) {
    await interaction.update(payload);
  } else {
    await interaction.reply(payload);
  }
}

async function handleMenuSelect(interaction, member) {
  const selected = interaction.values[0];

  switch (selected) {
    case 'new_course': {
      const menu = buildCourseDropdown(`settings_new_course:${member.id}`, member.new_course_id);
      const embed = new EmbedBuilder().setColor(0x4A90D9).setTitle('🆕 새구절 코스 변경')
        .setDescription('새 구절을 외울 코스를 선택하세요.\n(기존 코스 진도는 보존됩니다)');
      await interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
      break;
    }
    case 'new_position': {
      const course = db.prepare(Q.getCourseById).get(member.new_course_id);
      if (!course) {
        await interaction.reply({ content: '먼저 새구절 코스를 설정해주세요.', flags: [MessageFlags.Ephemeral] });
        return;
      }
      const modal = new ModalBuilder()
        .setCustomId(`modal_new_position:${member.id}`)
        .setTitle('📍 새구절 시작점 변경');
      const input = new TextInputBuilder()
        .setCustomId('position_input')
        .setLabel(`시작할 구절 번호 (1~${course.total_verses})`)
        .setPlaceholder(`현재: ${member.new_position}번째`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      break;
    }
    case 'new_perweek': {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`settings_new_perweek:${member.id}`)
        .setPlaceholder('주간 새구절 수')
        .addOptions([1,2,3,4,5].map(n => ({ label: `${n}구절/주`, value: String(n), default: member.new_per_week === n })));
      const embed = new EmbedBuilder().setColor(0x4A90D9).setTitle('📊 주간 새구절 수 변경');
      await interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
      break;
    }
    case 'review_course': {
      const menu = buildCourseDropdown(`settings_review_course:${member.id}`, member.review_course_id, true);
      const embed = new EmbedBuilder().setColor(0x4A90D9).setTitle('📗 복습 코스 변경')
        .setDescription('복습할 코스를 선택하세요.');
      await interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
      break;
    }
    case 'review_position': {
      if (!member.review_course_id) {
        await interaction.reply({ content: '먼저 복습 코스를 설정해주세요.', flags: [MessageFlags.Ephemeral] });
        return;
      }
      const course = db.prepare(Q.getCourseById).get(member.review_course_id);
      const modal = new ModalBuilder()
        .setCustomId(`modal_review_position:${member.id}`)
        .setTitle('📍 복습 시작점 변경');
      const input = new TextInputBuilder()
        .setCustomId('position_input')
        .setLabel(`시작할 구절 번호 (1~${course.total_verses})`)
        .setPlaceholder(`현재: ${member.review_position}번째`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      break;
    }
    case 'review_perday': {
      const modal = new ModalBuilder()
        .setCustomId(`modal_review_perday:${member.id}`)
        .setTitle('📊 일일 복습 수 변경');
      const input = new TextInputBuilder()
        .setCustomId('perday_input')
        .setLabel('하루에 복습할 구절 수 (1~50)')
        .setPlaceholder(`현재: ${member.review_per_day}구절/일`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      break;
    }
  }
}

async function handleNewCourseChange(interaction, member) {
  const newCourseId = parseInt(interaction.values[0]);
  const course = db.prepare(Q.getCourseById).get(newCourseId);

  // Save current NEW course progress only (don't contaminate with review data)
  if (member.new_course_id) {
    const prevSaved = loadCourseProgress(member.id, member.new_course_id);
    const prevReviewPos = prevSaved ? prevSaved.review_position : 1;
    saveCourseProgress(member.id, member.new_course_id, member.new_position, prevReviewPos);
  }

  // Load previous progress for the target course, or start from 1
  const prev = loadCourseProgress(member.id, newCourseId);
  const newPos = prev ? prev.new_position : 1;

  db.prepare(Q.updateMemberNewCourse).run(newCourseId, newPos, member.id);
  await interaction.reply({ content: `✅ 새구절 코스가 **${course.name}**으로 변경되었습니다! (${newPos}번째부터)`, flags: [MessageFlags.Ephemeral] });
}

async function handleNewPerWeekChange(interaction, member) {
  const val = parseInt(interaction.values[0]);
  db.prepare(Q.updateMemberNewPerWeek).run(val, member.id);
  await interaction.reply({ content: `✅ 주간 새구절이 **${val}구절/주**로 변경되었습니다!`, flags: [MessageFlags.Ephemeral] });
}

async function handleReviewCourseChange(interaction, member) {
  const newCourseId = parseInt(interaction.values[0]);
  const course = db.prepare(Q.getCourseById).get(newCourseId);

  // Save current REVIEW course progress only (don't contaminate with new verse data)
  if (member.review_course_id) {
    const prevSaved = loadCourseProgress(member.id, member.review_course_id);
    const prevNewPos = prevSaved ? prevSaved.new_position : 1;
    saveCourseProgress(member.id, member.review_course_id, prevNewPos, member.review_position);
  }

  const prev = loadCourseProgress(member.id, newCourseId);
  const reviewPos = prev ? prev.review_position : 1;

  db.prepare(Q.updateMemberReviewCourse).run(newCourseId, reviewPos, member.id);
  await interaction.reply({ content: `✅ 복습 코스가 **${course.name}**으로 변경되었습니다! (${reviewPos}번째부터)`, flags: [MessageFlags.Ephemeral] });
}

function buildCourseDropdown(customId, currentId, includeNone = false) {
  const courses = db.prepare('SELECT * FROM courses ORDER BY id').all();
  const menu = new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder('코스 선택');

  for (const c of courses) {
    menu.addOptions({ label: `${c.name} (${c.total_verses}구절)`, value: String(c.id), default: c.id === currentId });
  }

  return menu;
}

