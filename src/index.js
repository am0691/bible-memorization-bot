require('dotenv').config();

const { Client, GatewayIntentBits, Collection, Partials, MessageFlags } = require('discord.js');
const { initDatabase } = require('./database/init');
const { registerCommands } = require('./commands/register');
const { handleButton } = require('./interactions/buttons');
const { startDailyScheduler } = require('./scheduler/daily');
const { startWeeklyScheduler } = require('./scheduler/weekly');
const { startNewVerseScheduler } = require('./scheduler/newverse');
const { notifyAdmin } = require('./utils/messages');
const config = require('./config');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

client.commands = new Collection();

client.once('clientReady', async () => {
  console.log(`\u2705 봇 로그인: ${client.user.tag}`);

  initDatabase();
  console.log('\u2705 데이터베이스 초기화 완료');

  await registerCommands(client);
  console.log('\u2705 슬래시 커맨드 등록 완료');

  startDailyScheduler(client);
  startWeeklyScheduler(client);
  startNewVerseScheduler(client);
  console.log('\u2705 스케줄러 시작 완료');

  console.log('\uD83D\uDE4F 성경 암송 봇 v2.0이 준비되었습니다!');
});

client.on('interactionCreate', async (interaction) => {
  // Button interactions
  if (interaction.isButton()) {
    try {
      // All settings buttons → settings handler
      if (interaction.customId.startsWith('settings_')) {
        const settings = require('./commands/settings');
        return await settings.handleButton(interaction);
      }
      await handleButton(interaction, client);
    } catch (error) {
      console.error('[버튼] 처리 오류:', error);
      await notifyAdmin(client, config.adminId, `버튼 오류: ${error.message}`);
    }
    return;
  }

  // Select menu interactions
  if (interaction.isStringSelectMenu()) {
    try {
      const customId = interaction.customId;

      // Onboarding flow
      if (customId.startsWith('onboard_course:')) {
        const registerHandler = require('./commands/register-handler');
        return await registerHandler.handleCourseSelect(interaction);
      }
      if (customId.startsWith('onboard_section:')) {
        const registerHandler = require('./commands/register-handler');
        return await registerHandler.handleSectionSelect(interaction);
      }
      if (customId.startsWith('onboard_position:')) {
        const registerHandler = require('./commands/register-handler');
        return await registerHandler.handlePositionSelect(interaction);
      }

      // Settings menus
      if (customId.startsWith('settings_')) {
        const settings = require('./commands/settings');
        if (settings.handleSelect) {
          return await settings.handleSelect(interaction);
        }
      }
    } catch (error) {
      console.error('[메뉴] 처리 오류:', error);
      const msg = { content: '설정 처리 중 오류가 발생했습니다.', flags: [MessageFlags.Ephemeral] };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg).catch(() => {});
      } else {
        await interaction.reply(msg).catch(() => {});
      }
    }
    return;
  }

  // Modal submissions
  if (interaction.isModalSubmit()) {
    try {
      const settings = require('./commands/settings');
      if (settings.handleModal) {
        return await settings.handleModal(interaction);
      }
    } catch (error) {
      console.error('[모달] 처리 오류:', error);
      const msg = { content: '설정 처리 중 오류가 발생했습니다.', flags: [MessageFlags.Ephemeral] };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg).catch(() => {});
      } else {
        await interaction.reply(msg).catch(() => {});
      }
    }
    return;
  }

  // Slash commands
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction, client);
    } catch (error) {
      console.error(`[커맨드] ${interaction.commandName} 오류:`, error);
      await notifyAdmin(client, config.adminId, `커맨드 오류 (${interaction.commandName}): ${error.message}`);
      const msg = { content: '명령 처리 중 오류가 발생했습니다.', flags: [MessageFlags.Ephemeral] };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg).catch(() => {});
      } else {
        await interaction.reply(msg).catch(() => {});
      }
    }
    return;
  }
});

process.on('unhandledRejection', (error) => {
  console.error('[봇] Unhandled Rejection:', error);
  notifyAdmin(client, config.adminId, `Unhandled Rejection: ${error?.message || error}`).catch(() => {});
});

client.on('error', (error) => {
  console.error('[봇] Client Error:', error);
});

client.login(config.token);
