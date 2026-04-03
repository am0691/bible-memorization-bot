const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const db = require('../database/connection');
const Q = require('../database/statements');

module.exports = {
  async execute(interaction) {
    const discordId = interaction.user.id;
    const discordName = interaction.user.displayName || interaction.user.username;

    const existing = db.prepare(Q.getMemberByDiscordId).get(discordId);
    if (existing) {
      await interaction.reply({ content: '이미 등록된 멤버입니다! /진도 로 현황을 확인하세요.', flags: [MessageFlags.Ephemeral] });
      return;
    }

    // Step 1: Course selection
    const courseMenu = new StringSelectMenuBuilder()
      .setCustomId(`onboard_course:${discordId}`)
      .setPlaceholder('외우고 있는 코스를 선택하세요')
      .addOptions(
        { label: '입문 - 5확신 (5구절)', value: '1', description: '구원, 기도응답, 승리, 사죄, 인도의 확신' },
        { label: '기초 - 8확신 (8구절)', value: '2', description: '그리스도인의 생활 기초' },
        { label: '성장 - 60구절', value: '3', description: 'A~E 섹션, 12구절씩' },
        { label: '심화 - 242구절', value: '4', description: '8가지 주제 심화 암송' },
        { label: '마스터 - 180구절', value: '5', description: 'TMS 180구절 전체' },
      );

    const embed = new EmbedBuilder()
      .setColor(0x4A90D9)
      .setTitle('📖 성경 암송 등록 (1/3)')
      .setDescription('환영합니다! 먼저 **현재 외우고 있는 코스**를 선택해주세요.')
      .setFooter({ text: '선택 후 시작 위치를 설정합니다' });

    const row = new ActionRowBuilder().addComponents(courseMenu);
    await interaction.reply({ embeds: [embed], components: [row], flags: [MessageFlags.Ephemeral] });
  },

  // Step 2: Position selection (called from index.js select handler)
  async handleCourseSelect(interaction) {
    const discordId = interaction.customId.split(':')[1];
    if (interaction.user.id !== discordId) return;

    const courseId = parseInt(interaction.values[0]);
    const course = db.prepare(Q.getCourseById).get(courseId);

    // Build position options from sections
    const sections = db.prepare(Q.getCourseSections).all(courseId);
    const positionMenu = new StringSelectMenuBuilder()
      .setCustomId(`onboard_position:${discordId}:${courseId}`)
      .setPlaceholder('어디서부터 시작하시나요?');

    positionMenu.addOptions({ label: '처음부터 (1번째)', value: '1', description: `${course.name} 1번째 구절부터` });

    if (sections.length > 1) {
      for (const s of sections) {
        if (s.start_num === 1) continue;
        const sectionName = s.section || `${s.start_num}번째부터`;
        positionMenu.addOptions({
          label: `${sectionName} (${s.start_num}번째~)`,
          value: String(s.start_num),
          description: `${s.start_num}~${s.end_num}번째 구절`,
        });
      }
    }

    // Add "all done" option
    positionMenu.addOptions({
      label: `전부 외움 (복습만)`,
      value: String(course.total_verses + 1),
      description: `${course.name} 전체 완료 상태로 시작`,
    });

    const embed = new EmbedBuilder()
      .setColor(0x4A90D9)
      .setTitle('📖 성경 암송 등록 (2/3)')
      .setDescription(`**${course.name} (${course.total_verses}구절)** 선택!\n\n새 구절을 **어디서부터** 시작하시나요?`)
      .setFooter({ text: '이미 외운 구절이 있으면 해당 위치를 선택하세요' });

    const row = new ActionRowBuilder().addComponents(positionMenu);
    await interaction.update({ embeds: [embed], components: [row] });
  },

  // Step 3: Goal selection (called from index.js select handler)
  async handlePositionSelect(interaction) {
    const parts = interaction.customId.split(':');
    const discordId = parts[1];
    const courseId = parseInt(parts[2]);
    if (interaction.user.id !== discordId) return;

    const position = parseInt(interaction.values[0]);

    const embed = new EmbedBuilder()
      .setColor(0x4A90D9)
      .setTitle('📖 성경 암송 등록 (3/3)')
      .setDescription('하루에 **복습할 구절 수**를 선택해주세요.\n(나머지 설정은 /설정 에서 변경 가능합니다)')
      .setFooter({ text: '기본값: 주간 새구절 2개, 복습 시작점: 1번째' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`onboard_goal:${discordId}:${courseId}:${position}:1`).setLabel('1구절/일').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`onboard_goal:${discordId}:${courseId}:${position}:3`).setLabel('3구절/일').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`onboard_goal:${discordId}:${courseId}:${position}:5`).setLabel('5구절/일').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`onboard_goal:${discordId}:${courseId}:${position}:7`).setLabel('7구절/일').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`onboard_goal:${discordId}:${courseId}:${position}:10`).setLabel('10구절/일').setStyle(ButtonStyle.Secondary),
    );

    await interaction.update({ embeds: [embed], components: [row] });
  },

  // Final: Create member (called from buttons handler)
  async handleGoalSelect(interaction) {
    const parts = interaction.customId.split(':');
    const discordId = parts[1];
    const courseId = parseInt(parts[2]);
    const position = parseInt(parts[3]);
    const reviewPerDay = parseInt(parts[4]);
    if (interaction.user.id !== discordId) return;

    const discordName = interaction.user.displayName || interaction.user.username;
    const course = db.prepare(Q.getCourseById).get(courseId);

    // Smart defaults
    const newPerWeek = 2;
    // Review course = same course, starting from 1 (if they have completed verses)
    const reviewCourseId = position > 1 ? courseId : null;
    const reviewPosition = 1;

    const result = db.prepare(Q.insertMember).run(
      discordId, discordName, courseId, position, newPerWeek,
      reviewCourseId, reviewPosition, reviewPerDay
    );

    const positionText = position > course.total_verses
      ? `전체 완료 (복습만)`
      : `${position}번째부터`;

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('🎉 등록 완료!')
      .setDescription(`**${discordName}**님, 성경 암송 팀에 등록되었습니다!`)
      .addFields(
        { name: '📘 암송 코스', value: `${course.name} (${course.total_verses}구절)`, inline: true },
        { name: '📍 시작 위치', value: positionText, inline: true },
        { name: '🆕 주간 새구절', value: `${newPerWeek}구절/주`, inline: true },
        { name: '📗 복습', value: reviewCourseId ? `${course.name} | ${reviewPerDay}구절/일` : '아직 없음', inline: true },
      )
      .addFields({
        name: '📌 다음 단계',
        value: '매일 아침 DM으로 암송 알림이 전송됩니다.\n`/설정`으로 세부 설정을 조정할 수 있습니다.',
      })
      .setFooter({ text: '주간 새구절 수, 복습 코스 등은 /설정 에서 변경 가능' });

    await interaction.update({ embeds: [embed], components: [] });
  },
};
