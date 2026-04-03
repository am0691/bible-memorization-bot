const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder().setName('등록').setDescription('성경 암송 팀에 등록합니다').toJSON(),
  new SlashCommandBuilder().setName('설정').setDescription('나의 암송 설정을 변경합니다').toJSON(),
  new SlashCommandBuilder().setName('진도').setDescription('나의 암송 진도를 확인합니다').toJSON(),
  new SlashCommandBuilder().setName('도움말').setDescription('봇 사용법을 안내합니다').toJSON(),
  new SlashCommandBuilder().setName('관리').setDescription('관리자 전용 명령어')
    .addSubcommand(sub => sub.setName('멤버목록').setDescription('등록된 멤버 목록'))
    .addSubcommand(sub => sub.setName('리포트').setDescription('즉시 주간 리포트 발송'))
    .addSubcommand(sub => sub.setName('알림테스트').setDescription('즉시 오늘 알림 발송'))
    .addSubcommand(sub => sub.setName('강제발송').setDescription('특정 멤버에게 알림 재발송')
      .addUserOption(opt => opt.setName('대상').setDescription('알림 받을 멤버').setRequired(true)))
    .addSubcommand(sub => sub.setName('신규구절').setDescription('즉시 전체 멤버 신규 구절 전진'))
    .toJSON(),
];

async function registerCommands(client) {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
    { body: commands }
  );

  // Register handlers
  const handlers = {
    '등록': require('./register-handler'),
    '설정': require('./settings'),
    '진도': require('./progress'),
    '도움말': require('./help'),
    '관리': require('./admin'),
  };
  for (const [name, handler] of Object.entries(handlers)) {
    client.commands.set(name, handler);
  }
}

module.exports = { registerCommands };
