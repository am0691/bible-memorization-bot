const { EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../database/connection');
const Q = require('../database/statements');
const config = require('../config');

module.exports = {
  async execute(interaction, client) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    if (config.adminId && interaction.user.id !== config.adminId) {
      await interaction.editReply({ content: '관리자만 사용할 수 있는 명령어입니다.' });
      return;
    }

    const sub = interaction.options.getSubcommand();

    switch (sub) {
      case '멤버목록': {
        const members = db.prepare(Q.getAllActiveMembers).all();
        const lines = members.map(m => {
          const newCourse = m.new_course_id ? db.prepare(Q.getCourseById).get(m.new_course_id) : null;
          const reviewCourse = m.review_course_id ? db.prepare(Q.getCourseById).get(m.review_course_id) : null;
          return `**${m.discord_name}** — 📘${newCourse?.name || '-'}(${m.new_position}) | 📗${reviewCourse?.name || '-'}(${m.review_position}) | 🔥${m.streak}일`;
        });
        const embed = new EmbedBuilder().setColor(0x4A90D9).setTitle('👥 멤버 목록')
          .setDescription(lines.join('\n') || '등록된 멤버가 없습니다.')
          .setFooter({ text: `총 ${members.length}명` });
        await interaction.editReply({ embeds: [embed] });
        break;
      }

      case '리포트': {
        const { sendWeeklyReport } = require('../scheduler/weekly');
        await sendWeeklyReport(client);
        await interaction.editReply({ content: '✅ 주간 리포트가 발송되었습니다.' });
        break;
      }

      case '알림테스트': {
        const { sendDailyReminders } = require('../scheduler/daily');
        await sendDailyReminders(client);
        await interaction.editReply({ content: '✅ 일일 알림이 발송되었습니다.' });
        break;
      }

      case '강제발송': {
        const targetUser = interaction.options.getUser('대상');
        const member = db.prepare(Q.getMemberByDiscordId).get(targetUser.id);
        if (!member) {
          await interaction.editReply({ content: '해당 멤버가 등록되어 있지 않습니다.' });
          return;
        }
        const { sendReminderToMember } = require('../scheduler/daily');
        await sendReminderToMember(client, member);
        await interaction.editReply({ content: `✅ ${member.discord_name}에게 알림이 발송되었습니다.` });
        break;
      }

      case '신규구절': {
        const { advanceAllNewVerses } = require('../scheduler/newverse');
        await advanceAllNewVerses();
        await interaction.editReply({ content: '✅ 전체 멤버의 신규 구절이 전진되었습니다.' });
        break;
      }
    }
  }
};
