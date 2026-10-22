/**
 * 👑 이소윤의 로블록스 오비 레이서 3D (Soyun's Roblox Obby Racer 3D)
 * Game Configuration, Infinite Stage Definitions, Speed Presets & Roblox Pet Evolution System
 */
(function (window) {
  'use strict';

  const STAGES = [
    {
      stage: 1,
      title: '🌈 레인보우 스타터 오비 (Rainbow Obby)',
      subtitle: '이소윤의 기초 연산·구구단 밖 곱셈·나눗셈 & 기초 영단어·생활영어!',
      questionsToBoss: 15, // 15문제 풀어야 보스 출현
      bossName: '블록 골렘 렉스 (Blocky Rex)',
      bossTitle: '1단계 로블록스 연산 수문장',
      bossHp: 9, // 보스 체력 9
      baseSpeed: 36, // 문제 풀이 시간 약 9.5초
      gateSolveSeconds: 9.5,
      themeColor: '#00f2fe',
      roadColor: '#1a103c',
      skyColor: '#07051a',
      fogColor: '#12092b',
      bossColor: 0xff3366
    },
    {
      stage: 2,
      title: '🍕 피자 팩토리 타워 (Pizza Obby Tower)',
      subtitle: '구구단 밖 곱셈·나눗셈 & 초등 필수 생활영어 회화!',
      questionsToBoss: 18,
      bossName: '알파벳 빌런 눕킹 (Noob King)',
      bossTitle: '2단계 생활영어·연산 보스',
      bossHp: 10,
      baseSpeed: 36.5, // 단계별 미세 가속 (+0.5)
      gateSolveSeconds: 9.4,
      themeColor: '#ff007f',
      roadColor: '#220b38',
      skyColor: '#160526',
      fogColor: '#24093a',
      bossColor: 0xff9900
    },
    {
      stage: 3,
      title: '💎 크리스탈 점프 아일랜드 (Crystal Obby)',
      subtitle: '곱셈·나눗셈·두자리 연산 & 실전 생활영어 마스터!',
      questionsToBoss: 16,
      bossName: '코블록스 스핑크스 (Korblox Sphinx)',
      bossTitle: '3단계 로블록스 수수께끼 보스',
      bossHp: 10,
      baseSpeed: 37.0, // 단계별 미세 가속 (+0.5)
      gateSolveSeconds: 9.2,
      themeColor: '#00ff88',
      roadColor: '#0d2638',
      skyColor: '#04121c',
      fogColor: '#0a2233',
      bossColor: 0x00ffcc
    },
    {
      stage: 4,
      title: '🌋 용암 탈출 메가 오비 (Lava Escape Obby)',
      subtitle: '심화 곱셈·나눗셈 & 필수 생활영어 스피드 배틀!',
      questionsToBoss: 17,
      bossName: '밴해머 레드 드래곤 (Ban-Hammer Dragon)',
      bossTitle: '4단계 로블록스 연산 드래곤',
      bossHp: 11,
      baseSpeed: 37.5, // 단계별 미세 가속 (+0.5)
      gateSolveSeconds: 9.1,
      themeColor: '#ffcc00',
      roadColor: '#331111',
      skyColor: '#1a0505',
      fogColor: '#2b0b0b',
      bossColor: 0xff2200
    }
  ];

  // 무한 스테이지(STAGE 5 ~ ∞)를 위한 12종 로블록스 오비 월드 템플릿
  const EXTRA_STAGE_TEMPLATES = [
    {
      titlePrefix: '🌌 갤럭시 발키리 타워',
      bossName: '오메가 발키리 (Omega Valkyrie)',
      bossRole: '우주 로블록스 지배자',
      themeColor: '#a855f7',
      roadColor: '#1f1038',
      skyColor: '#0c051c',
      fogColor: '#1a0b36',
      bossColor: 0xc084fc
    },
    {
      titlePrefix: '⚡ 사이버 로블록스 스타 링',
      bossName: '도미누스 타이탄 (Dominus Titan)',
      bossRole: '은하계 수리·언어 수호신',
      themeColor: '#38bdf8',
      roadColor: '#0f243c',
      skyColor: '#050e1a',
      fogColor: '#0b1b30',
      bossColor: 0x38bdf8
    },
    {
      titlePrefix: '🍭 스윗 캔디랜드 타이쿤',
      bossName: '마시멜로 골렘 킹 (Marshmallow King)',
      bossRole: '캔디 오비 수호 보스',
      themeColor: '#ff66cc',
      roadColor: '#2e102c',
      skyColor: '#170616',
      fogColor: '#290b27',
      bossColor: 0xff66cc
    },
    {
      titlePrefix: '❄️ 프로즌 크리스탈 캐슬',
      bossName: '아이스 프로스트 드래곤 (Frost Dragon)',
      bossRole: '빙하 오비 지배자',
      themeColor: '#00f5ff',
      roadColor: '#0b2236',
      skyColor: '#04101c',
      fogColor: '#081b2e',
      bossColor: 0x00f5ff
    },
    {
      titlePrefix: '🦖 쥬라기 블록 파크',
      bossName: '메카 티라노 렉스 (Mecha T-Rex)',
      bossRole: '공룡 아일랜드 챔피언',
      themeColor: '#22c55e',
      roadColor: '#0f2918',
      skyColor: '#06140b',
      fogColor: '#0c2113',
      bossColor: 0x22c55e
    },
    {
      titlePrefix: '🌊 아틀란티스 아쿠아 오비',
      bossName: '포세이돈 샤크 메카 (Shark Mecha)',
      bossRole: '심해 신전 수호자',
      themeColor: '#06b6d4',
      roadColor: '#082530',
      skyColor: '#031217',
      fogColor: '#071f29',
      bossColor: 0x06b6d4
    },
    {
      titlePrefix: '🔥 인피니티 블록 아레나',
      bossName: '인피니티 엠페러 (Infinity Emperor)',
      bossRole: '차원 초월 브레인 마스터',
      themeColor: '#f43f5e',
      roadColor: '#2d0c1e',
      skyColor: '#17040d',
      fogColor: '#290a19',
      bossColor: 0xf43f5e
    },
    {
      titlePrefix: '👑 골든 로벅스 제국',
      bossName: '갤럭시 오버로드 (Galaxy Overlord)',
      bossRole: '전설의 오비 챔피언',
      themeColor: '#facc15',
      roadColor: '#2b230c',
      skyColor: '#141004',
      fogColor: '#261e09',
      bossColor: 0xfacc15
    }
  ];

  // 속도 조절 프리셋 (기본 1.0x = 이전 속도의 절반인 55 KM/H 기준!)
  const SPEED_MULTIPLIERS = [
    { mult: 0.6, label: '🐢 0.6x 아주 천천히', shortLabel: '0.6x' },
    { mult: 0.8, label: '🐣 0.8x 천천히', shortLabel: '0.8x' },
    { mult: 1.0, label: '🚗 1.0x 기본 (추천)', shortLabel: '1.0x' },
    { mult: 1.3, label: '🚀 1.3x 약간 빠르게', shortLabel: '1.3x' },
    { mult: 1.6, label: '⚡ 1.6x 빠르게', shortLabel: '1.6x' }
  ];

  const ROBLOX_PETS = [
    {
      level: 1,
      minScore: 0,
      minStage: 1,
      icon: '🐣',
      name: '🐣 블록 병아리 펫 (Blocky Chick)',
      shortName: '🐣 블록 병아리 펫',
      cheerTag: '병아리펫',
      unlockDesc: '기본 파트너 (0+ R$)'
    },
    {
      level: 2,
      minScore: 500,
      minStage: 2,
      icon: '🐱',
      name: '🐱 네온 고양이 펫 (Neon Cat)',
      shortName: '🐱 네온 고양이 펫',
      cheerTag: '네온고양이펫',
      unlockDesc: '500+ R$ 또는 STAGE 2 달성'
    },
    {
      level: 3,
      minScore: 1500,
      minStage: 3,
      icon: '🦄',
      name: '🦄 레인보우 유니콘 펫 (Rainbow Unicorn)',
      shortName: '🦄 레인보우 유니콘 펫',
      cheerTag: '유니콘펫',
      unlockDesc: '1,500+ R$ 또는 STAGE 3 달성'
    },
    {
      level: 4,
      minScore: 3000,
      minStage: 4,
      icon: '🐉',
      name: '🐉 갤럭시 드래곤 펫 (Galaxy Dragon)',
      shortName: '🐉 갤럭시 드래곤 펫',
      cheerTag: '드래곤펫',
      unlockDesc: '3,000+ R$ 또는 STAGE 4 달성'
    },
    {
      level: 5,
      minScore: 5000,
      minStage: 5,
      icon: '👑',
      name: '👑 로블록스 여왕 발키리 펫 (Queen Valkyrie)',
      shortName: '👑 여왕 발키리 펫',
      cheerTag: '발키리펫',
      unlockDesc: '5,000+ R$ 또는 STAGE 5 달성'
    }
  ];

  const GameConfig = {
    STORAGE_KEY: 'run_and_learn_racer_save_v1',
    PLAYER_NAME: '이소윤',
    PLAYER_BADGE: '👑 VIP 플레이어: 이소윤',
    MAIN_TITLE: '👑 이소윤의 로블록스 오비 레이서 3D',
    SUB_TITLE: '이소윤 전용 VIP 에디션 · 무한 스테이지 · 연산·곱셈·나눗셈 & 영단어·생활영어 마스터!',

    LANES: [-4.5, 0, 4.5],
    LANE_NAMES: ['LEFT (1)', 'CENTER (2)', 'RIGHT (3)'],
    LANE_LABELS_KR: ['왼쪽 (1)', '중앙 (2)', '오른쪽 (3)'],

    MAX_HP: 5,
    MAX_PAUSE_CHANCES: 2, // 일시정지 기회는 2번!
    BOSS_SPEED_MULTIPLIER: 1.5, // 보스 출현 시 속도가 1.5배 빨라짐!
    BOSS_REWARD_GAUGE_BONUS: 10, // 일반 문제는 +1, 보스 격파 시 상금 게이지 +10 상승!
    JACKPOT_BOSS_INTERVAL: 10, // 10판째 보스마다 10,000원(만원) 상금!
    JACKPOT_BOSS_PRIZE_WON: 10000,

    BASE_SPEED: 36,
    MIN_SPEED_CAP: 18,
    MAX_SPEED_CAP: 45, // 단계가 올라가도 최대 속도 상한선(45) 유지 (충분한 풀이 시간 보장!)
    SPEED_INCREMENT_PER_CORRECT: 0.08, // 문제 정답 시 아주 미세하게만 가속
    SPEED_STAGE_BONUS: 0.5, // 스테이지 상승 시 +0.5씩 아주 미세하게만 가속
    SPEED_STEP_BUTTON: 6, // [ - / + ] 속도 조절 버튼 클릭 시 증감 폭
    SPEED_MULTIPLIERS: SPEED_MULTIPLIERS,

    GATE_SPAWN_Z: -74, // 처음부터 중앙 전광판이 큼직하게 보이도록 스폰 위치 최적화
    GATE_PASS_Z: 8,
    PLAYER_Z: 8,

    SCORE_PER_CORRECT: 100,
    SCORE_COMBO_BONUS: 25,
    SCORE_REVIEW_BONUS: 60,
    SCORE_BOSS_HIT: 150,
    SCORE_BOSS_CLEAR: 500,

    STAGES: STAGES,
    ROBLOX_PETS: ROBLOX_PETS,

    /**
     * Returns the highest unlocked Roblox Pet for Soyun based on cumulative Robux (totalScore) and stage.
     * Supports infinite pet mastery bonus levels for stage >= 6!
     */
    getCurrentPet: function (totalScore, maxStage) {
      const score = Math.max(0, parseInt(totalScore, 10) || 0);
      const stg = Math.max(1, parseInt(maxStage, 10) || 1);
      let current = ROBLOX_PETS[0];
      let nextPet = null;

      for (let i = 0; i < ROBLOX_PETS.length; i++) {
        const pet = ROBLOX_PETS[i];
        if (score >= pet.minScore || stg >= pet.minStage) {
          current = pet;
        } else if (!nextPet) {
          nextPet = pet;
        }
      }

      if (stg > 5 && current.level === 5) {
        current = Object.assign({}, current, {
          level: stg,
          name: `👑 신화 발키리 펫 ★${stg - 4} (Mythic Valkyrie)`
        });
      }

      return {
        current: current,
        next: nextPet
      };
    },

    /**
     * Computes Soyun's Real-Life Reward Gauges:
     * - 일반 문제 정답 시 +1, 보스 격파 시 +10 상금 게이지 상승!
     * 1) 💵 용돈 5,000원: 1st goal = 100점, then every +150점 thereafter (100, 250, 400, 550...)
     * 2) 🍓 애슐리 외식권: every 1,000점 (1000, 2000, 3000...)
     * 3) 💴 10판째 보스 상금 10,000원 (만원): 10판 보스마다 (STAGE 10, 20, 30...) 만원 상금!
     * @param {number} [totalCorrect]
     * @param {number} [bossesDefeated]
     * @param {number} [maxStageReached]
     */
    getRewardStatus: function (totalCorrect, bossesDefeated, maxStageReached) {
      const saveState = (window.SaveManager && typeof window.SaveManager.getState === 'function')
        ? window.SaveManager.getState()
        : {};

      const rawCorrect = totalCorrect !== undefined
        ? Math.max(0, parseInt(totalCorrect, 10) || 0)
        : Math.max(0, parseInt(saveState.totalCorrect, 10) || 0);
      const bosses = bossesDefeated !== undefined
        ? Math.max(0, parseInt(bossesDefeated, 10) || 0)
        : Math.max(0, parseInt(saveState.bossesDefeated, 10) || 0);
      const maxStg = maxStageReached !== undefined
        ? Math.max(1, parseInt(maxStageReached, 10) || 1)
        : Math.max(1, parseInt(saveState.maxStageReached, 10) || 1);

      const bossBonusPoints = bosses * 10;
      const gaugePoints = rawCorrect + bossBonusPoints;

      // 1. 용돈 5,000원 게이지 (첫 100, 이후 150씩 · 달성 시 다시 0부터 시작!)
      let pocketEarned = 0;
      let pocketCurrent = 0;
      let pocketTarget = 100;
      let pocketPhaseLabel = '첫 목표 100점';

      if (gaugePoints < 100) {
        pocketEarned = 0;
        pocketCurrent = gaugePoints;
        pocketTarget = 100;
        pocketPhaseLabel = '첫 100점 (보스+10)';
      } else {
        const afterFirst = gaugePoints - 100;
        pocketEarned = 1 + Math.floor(afterFirst / 150);
        pocketCurrent = afterFirst % 150;
        pocketTarget = 150;
        pocketPhaseLabel = `(0→150점 반복)`;
      }
      const pocketPct = Math.min(100, Math.round((pocketCurrent / pocketTarget) * 100));

      // 2. 애슐리 외식권 게이지 (1,000씩 · 달성 시 다시 0부터 시작!)
      const ashleyEarned = Math.floor(gaugePoints / 1000);
      const ashleyCurrent = gaugePoints % 1000;
      const ashleyTarget = 1000;
      const ashleyPct = Math.min(100, Math.round((ashleyCurrent / ashleyTarget) * 100));
      const ashleyPhaseLabel = '(0→1,000점 반복)';

      // 3. 10판째 보스마다 만원(10,000원) 상금 게이지 (달성 시 다시 0부터 시작!)
      const effectiveBossClears = Math.max(bosses, Math.max(0, maxStg - 1));
      const jackpotEarned = Math.floor(effectiveBossClears / 10);
      const jackpotCurrent = effectiveBossClears % 10;
      const jackpotTarget = 10;
      const jackpotPct = Math.min(100, Math.round((jackpotCurrent / jackpotTarget) * 100));
      const nextJackpotStage = (jackpotEarned + 1) * 10;
      const jackpotPhaseLabel = `(0→10판 반복)`;

      // 지급 완료(삭제) 또는 보호자 직접 수정 오프셋 반영 -> 현재 달성(미지급) 보너스 횟수 계산
      const paidPocket = parseInt(saveState.paidPocketCount, 10) || 0;
      const paidAshley = parseInt(saveState.paidAshleyCount, 10) || 0;
      const paidJackpot = parseInt(saveState.paidJackpotCount, 10) || 0;

      const unpaidPocket = Math.max(0, pocketEarned - paidPocket);
      const unpaidAshley = Math.max(0, ashleyEarned - paidAshley);
      const unpaidJackpot = Math.max(0, jackpotEarned - paidJackpot);
      const totalUnpaidBonuses = unpaidPocket + unpaidAshley + unpaidJackpot;

      const namePocket = (saveState.bonusNamePocket && String(saveState.bonusNamePocket).trim()) || '용돈 5,000원';
      const nameAshley = (saveState.bonusNameAshley && String(saveState.bonusNameAshley).trim()) || '애슐리 외식';
      const nameJackpot = (saveState.bonusNameJackpot && String(saveState.bonusNameJackpot).trim()) || '10판 보스 만원 상금';

      return {
        totalCorrect: rawCorrect,
        bossesDefeated: bosses,
        bossBonusPoints: bossBonusPoints,
        gaugePoints: gaugePoints,
        totalUnpaidBonuses: totalUnpaidBonuses,
        pocketMoney: {
          key: 'pocket',
          icon: '💵',
          customName: namePocket,
          title: `💵 ${namePocket}`,
          earnedCount: pocketEarned,
          paidCount: Math.max(0, paidPocket),
          unpaidCount: unpaidPocket,
          totalWon: unpaidPocket * 5000,
          current: pocketCurrent,
          target: pocketTarget,
          remaining: pocketTarget - pocketCurrent,
          percent: pocketPct,
          phaseLabel: pocketPhaseLabel
        },
        ashley: {
          key: 'ashley',
          icon: '🍓',
          customName: nameAshley,
          title: `🍓 ${nameAshley}`,
          earnedCount: ashleyEarned,
          paidCount: Math.max(0, paidAshley),
          unpaidCount: unpaidAshley,
          current: ashleyCurrent,
          target: ashleyTarget,
          remaining: ashleyTarget - ashleyCurrent,
          percent: ashleyPct,
          phaseLabel: ashleyPhaseLabel
        },
        bossJackpot: {
          key: 'jackpot',
          icon: '💴',
          customName: nameJackpot,
          title: `💴 ${nameJackpot}`,
          earnedCount: jackpotEarned,
          paidCount: Math.max(0, paidJackpot),
          unpaidCount: unpaidJackpot,
          totalWon: unpaidJackpot * 10000,
          current: jackpotCurrent,
          target: jackpotTarget,
          remaining: jackpotTarget - jackpotCurrent,
          nextJackpotStage: nextJackpotStage,
          percent: jackpotPct,
          phaseLabel: jackpotPhaseLabel
        }
      };
    },

    /**
     * Always returns a valid stage configuration object for ANY stageNum (1 ~ ∞ Infinite Stages!).
     * Every 10th stage (STAGE 10, 20, 30...) is a 10,000원 (만원) Jackpot Boss Stage!
     * @param {number} stageNum
     * @returns {Object}
     */
    getStageConfig: function (stageNum) {
      const parsed = parseInt(stageNum, 10);
      const s = (!isNaN(parsed) && parsed >= 1) ? parsed : 1;
      const isJackpotStage = (s % 10 === 0);

      if (s <= STAGES.length) {
        return Object.assign({}, STAGES[s - 1], {
          isJackpotStage: isJackpotStage,
          jackpotPrizeWon: isJackpotStage ? 10000 : 0
        });
      }

      const extraIdx = (s - 5) % EXTRA_STAGE_TEMPLATES.length;
      const tpl = EXTRA_STAGE_TEMPLATES[extraIdx];
      const tier = s - 4;

      const baseTitle = isJackpotStage
        ? `💴 [만원 상금] ${tpl.titlePrefix} (STAGE ${s})`
        : `${tpl.titlePrefix} (STAGE ${s})`;
      const baseBossName = isJackpotStage
        ? `💴 황금 만원 보스 · ${tpl.bossName} Mk-${tier}`
        : `${tpl.bossName} Mk-${tier}`;
      const baseBossTitle = isJackpotStage
        ? `💴 ${s}판째 만원(10,000원) 상금 보스 · ${tpl.bossRole}`
        : `${s}단계 ${tpl.bossRole}`;
      const baseSubtitle = isJackpotStage
        ? `💴 대박 찬스! ${s}판째 보스 격파 시 [만원(10,000원) 상금] + 상금 게이지 +10 획득!`
        : `${s}단계 무한 오비 · 곱셈·나눗셈·연산 & 실전 생활영어 챌린지`;

      return {
        stage: s,
        title: baseTitle,
        subtitle: baseSubtitle,
        questionsToBoss: Math.min(24, 15 + Math.floor((s - 1) * 0.6)),
        bossName: baseBossName,
        bossTitle: baseBossTitle,
        bossHp: Math.min(18, 9 + Math.floor((s - 1) * 0.5)),
        baseSpeed: Math.min(45, +(36 + (s - 1) * 0.5).toFixed(1)),
        gateSolveSeconds: Math.max(7.6, +(9.5 - (s - 1) * 0.1).toFixed(1)),
        themeColor: isJackpotStage ? '#ffd700' : tpl.themeColor,
        roadColor: tpl.roadColor,
        skyColor: tpl.skyColor,
        fogColor: tpl.fogColor,
        bossColor: isJackpotStage ? 0xffd700 : tpl.bossColor,
        isJackpotStage: isJackpotStage,
        jackpotPrizeWon: isJackpotStage ? 10000 : 0
      };
    }
  };

  window.GameConfig = GameConfig;
})(window);
