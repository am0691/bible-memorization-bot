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
      case 'settings_recent_count': return handleRecentCountChange(interaction, member);
      case 'settings_pos_section': return handlePosSectionSelect(interaction, member);
      case 'settings_pos_verse': return handlePosVerseSelect(interaction, member);
    }
  },

  async handleButton(interaction) {
    const [action, memberId] = interaction.customId.split(':');
    const member = db.prepare(Q.getMemberById).get(memberId);
    if (!member || member.discord_id !== interaction.user.id) return;

    switch (action) {
      case 'settings_toggle': {
        const newActive = member.is_active ? 0 : 1;
        db.prepare(Q.updateMemberActive).run(newActive, member.id);
        const msg = newActive ? '알림이 다시 활성화되었습니다' : '알림이 일시정지되었습니다';
        const updated = db.prepare(Q.getMemberById).get(member.id);
        return showSettingsMenu(interaction, updated, true, msg);
      }
      case 'settings_sunday': {
        const newMode = member.sunday_mode ? 0 : 1;
        db.prepare(Q.updateMemberSundayMode).run(newMode, member.id);
        const msg = newMode ? '주일 알림이 꺼졌습니다' : '주일 알림이 켜졌습니다';
        const updated = db.prepare(Q.getMemberById).get(member.id);
        return showSettingsMenu(interaction, updated, true, msg);
      }
      case 'settings_done': {
        const embed = new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('✅ 설정 완료')
          .setDescription('설정이 저장되었습니다. 변경사항은 다음 알림부터 적용됩니다.');
        await interaction.update({ embeds: [embed], components: [] });
        break;
      }
      case 'settings_track_new': {
        const newVal = member.is_new_active ? 0 : 1;
        db.prepare(Q.updateMemberNewActive).run(newVal, member.id);
        const msg = newVal ? '새 구절 트랙이 활성화되었습니다' : '새 구절 트랙이 비활성화되었습니다';
        const updated = db.prepare(Q.getMemberById).get(member.id);
        return showSettingsMenu(interaction, updated, true, msg);
      }
      case 'settings_track_recent': {
        const newVal = member.is_recent_active ? 0 : 1;
        db.prepare(Q.updateMemberRecentActive).run(newVal, member.id);
        const msg = newVal ? '최신 복습 트랙이 활성화되었습니다' : '최신 복습 트랙이 비활성화되었습니다';
        const updated = db.prepare(Q.getMemberById).get(member.id);
        return showSettingsMenu(interaction, updated, true, msg);
      }
      case 'settings_track_old': {
        const newVal = member.is_old_active ? 0 : 1;
        db.prepare(Q.updateMemberOldActive).run(newVal, member.id);
        const msg = newVal ? '예전 복습 트랙이 활성화되었습니다' : '예전 복습 트랙이 비활성화되었습니다';
        const updated = db.prepare(Q.getMemberById).get(member.id);
        return showSettingsMenu(interaction, updated, true, msg);
      }
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

async function showSettingsMenu(interaction, member, isUpdate = false, successMsg = null) {
  const newCourse = member.new_course_id ? db.prepare(Q.getCourseById).get(member.new_course_id) : null;
  const reviewCourse = member.review_course_id ? db.prepare(Q.getCourseById).get(member.review_course_id) : null;
  const statusText = member.is_active ? '🟢 활성' : '🔴 비활성';
  const sundayText = member.sunday_mode ? '🔕 꺼짐' : '🔔 켜짐';

  const newPosText = newCourse
    ? (member.new_position > newCourse.total_verses ? '전체 완료' : `${member.new_position}번째`)
    : '-';

  const embed = new EmbedBuilder()
    .setColor(0x4A90D9)
    .setTitle('⚙️ 나의 암송 설정');

  if (successMsg) {
    embed.setDescription(`✅ ${successMsg}`);
  }

  embed.addFields(
      { name: '━━ 🆕 새 구절 ━━', value: '\u200b', inline: false },
      { name: '📚 코스', value: newCourse ? `${newCourse.name} (${newCourse.total_verses}구절)` : '-', inline: true },
      { name: '📍 현재 위치', value: newPosText, inline: true },
      { name: '📊 주간 목표', value: `${member.new_per_week}구절/주`, inline: true },
      { name: '━━ 🔄 최신 복습 ━━', value: '\u200b', inline: false },
      { name: '📚 범위', value: newCourse ? `최근 ${member.recent_count}구절 (${newCourse.name})` : '-', inline: true },
      { name: '📍 상태', value: member.is_recent_active ? '🟢 활성' : '🔴 비활성', inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
      { name: '━━ 📗 예전 복습 ━━', value: '\u200b', inline: false },
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
      { label: '🔄 최신 복습 범위 변경', value: 'recent_count' },
    );

  const toggleBtn = new ButtonBuilder()
    .setCustomId(`settings_toggle:${member.id}`)
    .setLabel(member.is_active ? '🔕 알림 일시정지' : '🔔 알림 다시 받기')
    .setStyle(member.is_active ? ButtonStyle.Danger : ButtonStyle.Success);

  const sundayBtn = new ButtonBuilder()
    .setCustomId(`settings_sunday:${member.id}`)
    .setLabel(member.sunday_mode ? '🔔 주일 알림 켜기' : '🔕 주일 알림 끄기')
    .setStyle(member.sunday_mode ? ButtonStyle.Success : ButtonStyle.Secondary);

  const doneBtn = new ButtonBuilder()
    .setCustomId(`settings_done:${member.id}`)
    .setLabel('✅ 설정 완료')
    .setStyle(ButtonStyle.Primary);

  const newTrackBtn = new ButtonBuilder()
    .setCustomId(`settings_track_new:${member.id}`)
    .setLabel(member.is_new_active ? '🆕 새구절 ON' : '🆕 새구절 OFF')
    .setStyle(member.is_new_active ? ButtonStyle.Success : ButtonStyle.Secondary);

  const recentTrackBtn = new ButtonBuilder()
    .setCustomId(`settings_track_recent:${member.id}`)
    .setLabel(member.is_recent_active ? '🔄 최신복습 ON' : '🔄 최신복습 OFF')
    .setStyle(member.is_recent_active ? ButtonStyle.Success : ButtonStyle.Secondary);

  const oldTrackBtn = new ButtonBuilder()
    .setCustomId(`settings_track_old:${member.id}`)
    .setLabel(member.is_old_active ? '📗 예전복습 ON' : '📗 예전복습 OFF')
    .setStyle(member.is_old_active ? ButtonStyle.Success : ButtonStyle.Secondary);

  const row1 = new ActionRowBuilder().addComponents(settingsMenu);
  const row2 = new ActionRowBuilder().addComponents(toggleBtn, sundayBtn, doneBtn);
  const row3 = new ActionRowBuilder().addComponents(newTrackBtn, recentTrackBtn, oldTrackBtn);

  const payload = { embeds: [embed], components: [row1, row2, row3], flags: [MessageFlags.Ephemeral] };
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
      return showPositionSectionSelect(interaction, member.id, course, 'new');
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
      return showPositionSectionSelect(interaction, member.id, course, 'review');
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
    case 'recent_count': {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(`settings_recent_count:${member.id}`)
        .setPlaceholder('최신 복습 범위')
        .addOptions([6,9,12,15,18].map(n => ({ label: `최근 ${n}구절`, value: String(n), default: member.recent_count === n })));
      const embed = new EmbedBuilder().setColor(0x4A90D9).setTitle('🔄 최신 복습 범위 변경');
      await interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
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
  const updated = db.prepare(Q.getMemberById).get(member.id);
  return showSettingsMenu(interaction, updated, true, `새구절 코스가 ${course.name}으로 변경되었습니다`);
}

async function handleNewPerWeekChange(interaction, member) {
  const val = parseInt(interaction.values[0]);
  db.prepare(Q.updateMemberNewPerWeek).run(val, member.id);
  const updated = db.prepare(Q.getMemberById).get(member.id);
  return showSettingsMenu(interaction, updated, true, `주간 새구절이 ${val}구절/주로 변경되었습니다`);
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
  const updated = db.prepare(Q.getMemberById).get(member.id);
  return showSettingsMenu(interaction, updated, true, `복습 코스가 ${course.name}으로 변경되었습니다`);
}

async function handleRecentCountChange(interaction, member) {
  const val = parseInt(interaction.values[0]);
  db.prepare(Q.updateMemberRecentCount).run(val, member.id);
  const updated = db.prepare(Q.getMemberById).get(member.id);
  return showSettingsMenu(interaction, updated, true, `최신 복습 범위가 최근 ${val}구절로 변경되었습니다`);
}

// Show section selection for position change (step 1)
async function showPositionSectionSelect(interaction, memberId, course, type) {
  const sections = db.prepare(Q.getCourseSections).all(course.id);

  // Small courses (≤25 verses) or single section: show verses directly
  if (course.total_verses <= 25 || sections.length <= 1) {
    return showPositionVerseSelect(interaction, memberId, course, type, 1, course.total_verses);
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`settings_pos_section:${memberId}:${course.id}:${type}`)
    .setPlaceholder('섹션을 선택하세요');

  for (const s of sections) {
    const sectionName = s.section || `${s.start_num}~${s.end_num}번째`;
    if (s.count > 25) {
      for (let start = s.start_num; start <= s.end_num; start += 20) {
        const end = Math.min(start + 19, s.end_num);
        menu.addOptions({
          label: `${sectionName} (${start}~${end}번째)`,
          value: `${start}:${end}`,
          description: `${end - start + 1}구절`,
        });
      }
    } else {
      menu.addOptions({
        label: `${sectionName} (${s.start_num}~${s.end_num}번째)`,
        value: `${s.start_num}:${s.end_num}`,
        description: `${s.count}구절`,
      });
    }
  }

  const title = type === 'new' ? '📍 새구절 시작점 변경' : '📍 복습 시작점 변경';
  const embed = new EmbedBuilder().setColor(0x4A90D9).setTitle(title)
    .setDescription(`**${course.name}** — 섹션을 먼저 선택하세요.\n섹션 선택 후 구절 단위로 세부 지정합니다.`);

  await interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
}

// Handle section selection → show verses within section (step 2)
async function handlePosSectionSelect(interaction, member) {
  const parts = interaction.customId.split(':');
  const courseId = parseInt(parts[2]);
  const type = parts[3]; // 'new' or 'review'
  const course = db.prepare(Q.getCourseById).get(courseId);

  const [startStr, endStr] = interaction.values[0].split(':');
  const rangeStart = parseInt(startStr);
  const rangeEnd = parseInt(endStr);

  return showPositionVerseSelect(interaction, member.id, course, type, rangeStart, rangeEnd);
}

// Show individual verse selection within a range
async function showPositionVerseSelect(interaction, memberId, course, type, rangeStart, rangeEnd) {
  const verses = db.prepare(Q.getVersesInRange).all(course.id, rangeStart, rangeEnd + 1);

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`settings_pos_verse:${memberId}:${course.id}:${type}`)
    .setPlaceholder('시작할 구절을 선택하세요');

  for (const v of verses) {
    const sectionTag = v.section ? ` | ${v.section}` : '';
    menu.addOptions({
      label: `${v.order_num}번째 — ${v.reference}`,
      value: String(v.order_num),
      description: (v.text_short || v.text.substring(0, 50)) + sectionTag,
    });
  }

  const title = type === 'new' ? '📍 새구절 시작점 변경' : '📍 복습 시작점 변경';
  const embed = new EmbedBuilder().setColor(0x4A90D9).setTitle(title)
    .setDescription(`**${course.name}** — ${rangeStart}~${rangeEnd}번째\n시작할 구절을 선택하세요.`);

  await interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
}

// Handle final verse selection → update position
async function handlePosVerseSelect(interaction, member) {
  const parts = interaction.customId.split(':');
  const courseId = parseInt(parts[2]);
  const type = parts[3]; // 'new' or 'review'
  const pos = parseInt(interaction.values[0]);

  if (type === 'new') {
    db.prepare(Q.updateMemberNewPosition).run(pos, member.id);
    const updated = db.prepare(Q.getMemberById).get(member.id);
    return showSettingsMenu(interaction, updated, true, `새구절 시작점이 ${pos}번째로 변경되었습니다`);
  } else {
    db.prepare(Q.updateMemberReviewPosition).run(pos, member.id);
    const updated = db.prepare(Q.getMemberById).get(member.id);
    return showSettingsMenu(interaction, updated, true, `복습 시작점이 ${pos}번째로 변경되었습니다`);
  }
}

function buildCourseDropdown(customId, currentId, includeNone = false) {
  const courses = db.prepare('SELECT * FROM courses ORDER BY id').all();
  const menu = new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder('코스 선택');

  for (const c of courses) {
    menu.addOptions({ label: `${c.name} (${c.total_verses}구절)`, value: String(c.id), default: c.id === currentId });
  }

  return menu;
}

