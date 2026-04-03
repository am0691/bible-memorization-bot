require('dotenv').config();

module.exports = {
  token: process.env.DISCORD_TOKEN,
  guildId: process.env.GUILD_ID,
  certChannelId: process.env.CERTIFICATION_CHANNEL_ID,
  reportChannelId: process.env.REPORT_CHANNEL_ID,
  adminId: process.env.ADMIN_DISCORD_ID,
  dailyReminderTime: process.env.DAILY_REMINDER_TIME || '08:30',
  timezone: process.env.TIMEZONE || 'Asia/Seoul',
};
