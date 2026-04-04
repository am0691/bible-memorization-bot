const { EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x4A90D9)
      .setTitle('📖 성경 암송 봇 사용법')
      .setDescription('매일 아침 DM으로 암송 알림을 받고, 버튼으로 완료를 기록합니다.')
      .addFields(
        {
          name: '📌 슬래시 명령어',
          value: [
            '`/등록` — 암송 팀에 등록 (3단계 설정)',
            '`/설정` — 코스, 시작점, 목표, 복습 등 세부 설정',
            '`/진도` — 나의 암송 진도 + 팀 현황 보기',
            '`/도움말` — 이 안내 메시지',
          ].join('\n'),
        },
        {
          name: '📬 일일 알림 버튼',
          value: [
            '`🆕 새 구절 완료` — 이번 주 새 구절 암송 완료 기록',
            '`🔄 최신 복습 완료` — 최근 배운 구절 복습 완료',
            '`📗 복습 완료` — 예전 복습 완료 (포인터 전진)',
            '`💤 쉴게요` — 오늘 하루 쉬기',
            '`📖 전문 보기` — 각 트랙의 전체 텍스트 보기',
          ].join('\n'),
        },
        {
          name: '🔄 3트랙 암송 시스템',
          value: [
            '**🆕 새 구절**: 매주 월요일에 새 구절이 배정됩니다. 한 주 동안 매일 같은 구절을 연습합니다.',
            '**🔄 최신 복습**: 최근에 배운 구절들을 자동으로 복습합니다. 범위는 /설정에서 조정 가능.',
            '**📗 예전 복습**: 이미 외운 구절을 순서대로 순환 복습합니다. 완료하면 다음으로 자동 이동.',
            '**🔥 연속 기록**: 활성화된 모든 트랙을 완료하면 연속 일수가 올라갑니다!',
          ].join('\n'),
        },
        {
          name: '⚙️ 설정 가능 항목',
          value: [
            '새구절 코스 / 시작 위치 / 주간 목표',
            '최신 복습 범위 (최근 6~18구절)',
            '예전 복습 코스 / 시작 위치 / 일일 목표',
            '트랙별 ON/OFF / 알림 / 주일 알림',
          ].join('\n'),
        }
      )
      .setFooter({ text: '문의: 관리자에게 DM | v3.0' });

    await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
  }
};
