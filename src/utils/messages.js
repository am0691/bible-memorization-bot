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

module.exports = { notifyAdmin, buildProgressBar };
