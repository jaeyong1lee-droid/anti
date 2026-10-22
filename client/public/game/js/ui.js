/**
 * 👑 이소윤의 로블록스 오비 레이서 3D (Soyun's Roblox Obby Racer 3D)
 * UI Dashboard, HUD, Roblox Pet Evolution, Hit-Marker Impact FX & Modal Manager
 * Exposes `window.UIManager` and `window.UI`
 */
(function (window) {
  'use strict';

  let _toastTimer = null;
  let _stageClearTimer = null;
  let _damageFlashTimer = null;
  let _shakeTimer = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    return String(str !== undefined && str !== null ? str : '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getPetInfo(totalScore, maxStage) {
    if (window.GameConfig && typeof window.GameConfig.getCurrentPet === 'function') {
      return window.GameConfig.getCurrentPet(totalScore, maxStage);
    }
    return {
      current: {
        level: 1,
        icon: '🐣',
        name: '🐣 블록 병아리 펫 (Blocky Chick)',
        shortName: '🐣 블록 병아리 펫',
        cheerTag: '병아리펫'
      },
      next: null
    };
  }

  function getRewardInfo(totalCorrect, bossesDefeated, maxStageReached) {
    if (window.GameConfig && typeof window.GameConfig.getRewardStatus === 'function') {
      return window.GameConfig.getRewardStatus(totalCorrect, bossesDefeated, maxStageReached);
    }
    const c = Math.max(0, parseInt(totalCorrect, 10) || 0);
    const b = Math.max(0, parseInt(bossesDefeated, 10) || 0);
    const gaugePoints = c + b * 10;
    const pocketEarned = gaugePoints < 100 ? 0 : 1 + Math.floor((gaugePoints - 100) / 150);
    const pocketCur = gaugePoints < 100 ? gaugePoints : (gaugePoints - 100) % 150;
    const pocketTgt = gaugePoints < 100 ? 100 : 150;
    const ashleyEarned = Math.floor(gaugePoints / 1000);
    const ashleyCur = gaugePoints % 1000;
    const jackpotEarned = Math.floor(b / 10);
    const jackpotCur = b % 10;
    return {
      totalCorrect: c,
      bossesDefeated: b,
      gaugePoints: gaugePoints,
      pocketMoney: {
        earnedCount: pocketEarned,
        current: pocketCur,
        target: pocketTgt,
        percent: Math.min(100, Math.round((pocketCur / pocketTgt) * 100)),
        phaseLabel: gaugePoints < 100 ? '첫 100점 (보스+10)' : `🎉 ${pocketEarned}회 달성 (+150점씩)`
      },
      ashley: {
        earnedCount: ashleyEarned,
        current: ashleyCur,
        target: 1000,
        percent: Math.min(100, Math.round((ashleyCur / 1000) * 100)),
        phaseLabel: ashleyEarned > 0 ? `🎉 ${ashleyEarned}회 달성` : '1,000점 목표 (보스+10)'
      },
      bossJackpot: {
        earnedCount: jackpotEarned,
        totalWon: jackpotEarned * 10000,
        current: jackpotCur,
        target: 10,
        remaining: 10 - jackpotCur,
        percent: Math.min(100, Math.round((jackpotCur / 10) * 100)),
        phaseLabel: jackpotEarned > 0 ? `💴 ${jackpotEarned}회 (만원 상금!)` : '10판 보스마다 만원!'
      }
    };
  }

  const UIManager = {
    /**
     * Renders the Title / Start Cumulative Progress Dashboard for Soyun
     * @param {Object} saveState
     * @param {number} [selectedStage]
     */
    renderDashboard: function (saveState, selectedStage) {
      const state = saveState || (window.SaveManager ? window.SaveManager.getState() : {});
      const currentStage = Math.max(1, parseInt(state.currentStage, 10) || 1);
      const maxStageReached = Math.max(currentStage, parseInt(state.maxStageReached, 10) || 1);
      const activeStage = Math.max(1, parseInt(selectedStage, 10) || currentStage);

      const stageCfg = (window.GameConfig && window.GameConfig.getStageConfig)
        ? window.GameConfig.getStageConfig(currentStage)
        : { stage: currentStage, title: '🌈 레인보우 스타터 오비 (Rainbow Obby)' };

      const activeStageCfg = (window.GameConfig && window.GameConfig.getStageConfig)
        ? window.GameConfig.getStageConfig(activeStage)
        : stageCfg;

      const totalScore = parseInt(state.totalScore, 10) || 0;
      const totalSolved = parseInt(state.totalSolved, 10) || 0;
      const totalCorrect = parseInt(state.totalCorrect, 10) || 0;
      const accuracy = totalSolved > 0 ? Math.round((totalCorrect / totalSolved) * 100) : 0;
      const wrongQueue = Array.isArray(state.wrongAnswerQueue) ? state.wrongAnswerQueue : [];
      const reviewHistory = Array.isArray(state.reviewHistory) ? state.reviewHistory : [];

      const petInfo = getPetInfo(totalScore, maxStageReached);
      const activePet = petInfo.current;

      const elStage = byId('dash-current-stage');
      if (elStage) {
        elStage.textContent = `STAGE ${currentStage} - ${stageCfg.title}`;
      }

      const elScore = byId('dash-total-score');
      if (elScore) {
        elScore.textContent = `🟢 R$ ${totalScore.toLocaleString()}`;
      }

      const elPet = byId('dash-current-pet');
      if (elPet && activePet) {
        elPet.textContent = `${activePet.shortName || activePet.name} (Lv.${activePet.level})`;
      }

      const elAcc = byId('dash-accuracy');
      if (elAcc) {
        elAcc.textContent = `${accuracy}% (${totalCorrect}/${totalSolved})`;
      }

      const elReview = byId('dash-review-count');
      if (elReview) {
        elReview.textContent = `${wrongQueue.length} 문제`;
      }

      const elMath = byId('dash-math-stat');
      if (elMath) {
        elMath.textContent = `🧮 수학 정답: ${state.mathCorrect || 0}문제`;
      }

      const elEng = byId('dash-eng-stat');
      if (elEng) {
        elEng.textContent = `🔤 영어 정답: ${state.englishCorrect || 0}문제`;
      }

      const elBoss = byId('dash-boss-stat');
      if (elBoss) {
        elBoss.textContent = `👾 격파한 오비 보스: ${state.bossesDefeated || 0}기 (보스당 게이지 +10)`;
      }

      const elSpeed = byId('dash-speed-stat');
      const currentMult = typeof state.speedMultiplier === 'number' ? state.speedMultiplier : 1.0;
      if (elSpeed) {
        elSpeed.textContent = `🔒 현재 설정 속도: ${currentMult.toFixed(1)}x 배속 (보호자 창에서 변경)`;
      }

      const elReviewBtnNum = byId('dash-btn-review-num');
      if (elReviewBtnNum) {
        elReviewBtnNum.textContent = String(wrongQueue.length || reviewHistory.length || 0);
      }

      const elUtilBadge = byId('review-badge-count');
      if (elUtilBadge) {
        elUtilBadge.textContent = String(wrongQueue.length);
      }

      // Render Roblox Pet Evolution Showcase Strip
      const petShowcase = byId('dash-pet-showcase');
      if (petShowcase && window.GameConfig && Array.isArray(window.GameConfig.ROBLOX_PETS)) {
        petShowcase.innerHTML = window.GameConfig.ROBLOX_PETS.map(function (pet) {
          const isUnlocked = totalScore >= pet.minScore || maxStageReached >= pet.minStage;
          const isCurrent = activePet && activePet.level === pet.level;
          const cls = 'pet-evo-chip' + (isUnlocked ? ' unlocked' : '') + (isCurrent ? ' active-pet' : '');
          const lockIcon = isUnlocked ? '' : '🔒 ';
          return `
            <div class="${cls}" title="${escapeHtml(pet.unlockDesc || '')}">
              <span class="pet-evo-lvl">Lv.${pet.level} (${pet.minScore.toLocaleString()}+ R$)</span>
              <span>${lockIcon}${escapeHtml(pet.shortName || pet.name)}</span>
            </div>
          `;
        }).join('');
      }

      // Render Real-Life Reward Gauges on Dashboard (달성 시 0부터 다시 시작 + 보너스 달성 개수 별도 표시!)
      const rewards = getRewardInfo(totalCorrect, state.bossesDefeated || 0, maxStageReached);
      const pm = rewards.pocketMoney;
      const ash = rewards.ashley;
      const jp = rewards.bossJackpot;
      const unpaidPocket = typeof pm.unpaidCount === 'number' ? pm.unpaidCount : pm.earnedCount;
      const unpaidAshley = typeof ash.unpaidCount === 'number' ? ash.unpaidCount : ash.earnedCount;
      const unpaidJackpot = jp ? (typeof jp.unpaidCount === 'number' ? jp.unpaidCount : jp.earnedCount) : 0;
      const totalUnpaid = unpaidPocket + unpaidAshley + unpaidJackpot;

      const elTotalBonusBadge = byId('dash-total-bonus-badge');
      if (elTotalBonusBadge) {
        elTotalBonusBadge.textContent = `🎁 달성 보너스 ${totalUnpaid}개`;
        elTotalBonusBadge.classList.toggle('has-bonus', totalUnpaid > 0);
      }

      const pocketTitleText = pm.customName || state.bonusNamePocket || '용돈 5,000원';
      const ashleyTitleText = ash.customName || state.bonusNameAshley || '애슐리 외식';
      const jackpotTitleText = (jp && jp.customName) || state.bonusNameJackpot || '10판 보스 만원 상금';

      const elDashPocketTitle = byId('dash-pocket-title');
      if (elDashPocketTitle) {
        elDashPocketTitle.textContent = String(pocketTitleText).replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\s]+/u, '');
      }
      const elDashPocketBonus = byId('dash-pocket-bonus-pill');
      if (elDashPocketBonus) {
        elDashPocketBonus.textContent = `${unpaidPocket}개`;
        elDashPocketBonus.classList.toggle('has-bonus', unpaidPocket > 0);
      }
      const elDashPocketFill = byId('dash-pocket-fill');
      if (elDashPocketFill) {
        elDashPocketFill.style.width = `${pm.percent}%`;
      }
      const elDashPocketDesc = byId('dash-pocket-desc');
      if (elDashPocketDesc) {
        elDashPocketDesc.textContent = `0→${pm.target}점`;
      }
      const elDashPocketCount = byId('dash-pocket-count');
      if (elDashPocketCount) {
        elDashPocketCount.textContent = `${pm.current} / ${pm.target}점`;
      }

      const elDashAshleyTitle = byId('dash-ashley-title');
      if (elDashAshleyTitle) {
        elDashAshleyTitle.textContent = String(ashleyTitleText).replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\s]+/u, '');
      }
      const elDashAshleyBonus = byId('dash-ashley-bonus-pill');
      if (elDashAshleyBonus) {
        elDashAshleyBonus.textContent = `${unpaidAshley}개`;
        elDashAshleyBonus.classList.toggle('has-bonus', unpaidAshley > 0);
      }
      const elDashAshleyFill = byId('dash-ashley-fill');
      if (elDashAshleyFill) {
        elDashAshleyFill.style.width = `${ash.percent}%`;
      }
      const elDashAshleyDesc = byId('dash-ashley-desc');
      if (elDashAshleyDesc) {
        elDashAshleyDesc.textContent = `0→1,000점`;
      }
      const elDashAshleyCount = byId('dash-ashley-count');
      if (elDashAshleyCount) {
        elDashAshleyCount.textContent = `${ash.current} / ${ash.target.toLocaleString()}점`;
      }

      if (jp) {
        const elDashJackpotTitle = byId('dash-jackpot-title');
        if (elDashJackpotTitle) {
          elDashJackpotTitle.textContent = String(jackpotTitleText).replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\s]+/u, '');
        }
        const elDashJackpotBonus = byId('dash-jackpot-bonus-pill');
        if (elDashJackpotBonus) {
          elDashJackpotBonus.textContent = `${unpaidJackpot}개`;
          elDashJackpotBonus.classList.toggle('has-bonus', unpaidJackpot > 0);
        }
        const elDashJackpotFill = byId('dash-jackpot-fill');
        if (elDashJackpotFill) {
          elDashJackpotFill.style.width = `${jp.percent}%`;
        }
        const elDashJackpotDesc = byId('dash-jackpot-desc');
        if (elDashJackpotDesc) {
          elDashJackpotDesc.textContent = `0→10판 보스`;
        }
        const elDashJackpotCount = byId('dash-jackpot-count');
        if (elDashJackpotCount) {
          elDashJackpotCount.textContent = `${jp.current} / ${jp.target}판`;
        }
      }

      const elMainStageBadge = byId('main-stage-badge');
      if (elMainStageBadge) {
        elMainStageBadge.textContent = `🏁 STAGE ${activeStage}`;
      }
      const elMainPetBadge = byId('main-pet-badge');
      if (elMainPetBadge && activePet) {
        elMainPetBadge.textContent = `${activePet.shortName || activePet.name}`;
      }

      // Keep Parent Modal in sync if rendered
      this.renderParentModal(state);

      // Subject Mode Buttons
      const modeContainer = byId('subject-mode-selector');
      if (modeContainer) {
        const modeBtns = modeContainer.querySelectorAll('.mode-pill');
        modeBtns.forEach(function (btn) {
          const m = btn.getAttribute('data-mode');
          btn.classList.toggle('active', m === (state.subjectMode || 'mixed'));
        });
      }

      // Speed Multiplier Preset Buttons inside Parent Modal
      const speedContainer = byId('dashboard-speed-selector');
      if (speedContainer) {
        const speedBtns = speedContainer.querySelectorAll('.speed-preset-pill');
        speedBtns.forEach(function (btn) {
          const m = parseFloat(btn.getAttribute('data-mult'));
          btn.classList.toggle('active', Math.abs(m - currentMult) < 0.08);
        });
      }

      // Orientation Mode Selector Buttons on Dashboard (자동 / 세로보기 / 가로보기)
      if (state.orientationMode) {
        this.updateOrientationUI(state.orientationMode);
      }

      // Infinite Stage Selector Pill Bar (1 .. maxStageReached + 2 preview + STAGE 10 jackpot preview + STAGE ∞ badge)
      const stageBar = byId('stage-selector-bar');
      if (stageBar) {
        const totalPills = Math.max(5, maxStageReached + 2);
        stageBar.innerHTML = '';
        for (let s = 1; s <= totalPills; s++) {
          const cfg = (window.GameConfig && window.GameConfig.getStageConfig)
            ? window.GameConfig.getStageConfig(s)
            : { stage: s, title: `스테이지 ${s}` };
          const unlocked = s <= maxStageReached;
          const isJackpot = (s % 10 === 0);
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'stage-pill' + (s === activeStage ? ' active' : '') + (isJackpot ? ' stage-pill-jackpot' : '');
          btn.disabled = !unlocked;
          btn.setAttribute('data-stage', String(s));
          const jackpotTag = isJackpot ? ` 💴${escapeHtml(jackpotTitleText)}!` : '';
          btn.innerHTML = unlocked
            ? `<span>🏁 STAGE ${s}${jackpotTag}</span><span>· ${escapeHtml(cfg.title)}</span>`
            : `<span>🔒 STAGE ${s}${jackpotTag}</span><span>· ${escapeHtml(cfg.title)}</span>`;
          stageBar.appendChild(btn);
        }

        // Always show next 10th stage preview pill if not already rendered in totalPills
        const nextJackpotStage = Math.ceil(Math.max(1, maxStageReached) / 10) * 10;
        if (nextJackpotStage > totalPills) {
          const jBtn = document.createElement('button');
          jBtn.type = 'button';
          jBtn.className = 'stage-pill stage-pill-jackpot';
          jBtn.disabled = true;
          jBtn.innerHTML = `<span>🔒 STAGE ${nextJackpotStage} 💴${escapeHtml(jackpotTitleText)}!</span><span>· 10단계 보스 보너스!</span>`;
          stageBar.appendChild(jBtn);
        }

        const infBadge = document.createElement('div');
        infBadge.className = 'stage-infinity-pill';
        infBadge.innerHTML = `<span>♾️ STAGE ∞ (10판 보스마다 💴${escapeHtml(jackpotTitleText)}!)</span>`;
        stageBar.appendChild(infBadge);
      }

      // Primary CTA Button
      const btnStart = byId('btn-start-game');
      if (btnStart) {
        btnStart.textContent = `🚀 STAGE ${activeStage} 시작하기!`;
      }
    },

    /**
     * Shows or hides the Start / Dashboard Modal
     * @param {boolean} visible
     */
    setStartScreenVisible: function (visible) {
      const el = byId('start-screen');
      if (el) {
        el.classList.toggle('hidden', !visible);
      }
      document.body.classList.toggle('start-screen-active', Boolean(visible));
    },

    /**
     * Updates the Arcade Racing Dashboard HUD (HP, Stage, Progress, Speed, Robux Score, Active Pet, Combo, Review Queue)
     * @param {Object} data
     */
    updateHUD: function (data) {
      if (!data) return;
      const maxHp = (window.GameConfig && window.GameConfig.MAX_HP) ? window.GameConfig.MAX_HP : 5;
      const hp = Math.max(0, Math.min(maxHp, typeof data.hp === 'number' ? data.hp : maxHp));

      // 1. HP Hearts
      const elHearts = byId('hp-hearts');
      if (elHearts) {
        let heartsStr = '';
        for (let i = 0; i < maxHp; i++) {
          heartsStr += i < hp ? '❤️' : '🖤';
        }
        elHearts.textContent = heartsStr;
      }
      const elHpNum = byId('hp-numeric');
      if (elHpNum) {
        elHpNum.textContent = `${hp} / ${maxHp}`;
      }

      // 2. Stage & Progress toward Boss
      const stageNum = data.stage || 1;
      const stageCfg = data.stageConfig || (window.GameConfig ? window.GameConfig.getStageConfig(stageNum) : { title: '🌈 레인보우 스타터 오비', questionsToBoss: 15 });
      const elStage = byId('hud-stage');
      if (elStage) {
        elStage.textContent = stageNum % 10 === 0 ? `STAGE ${stageNum} 💴만원!` : `STAGE ${stageNum}`;
      }
      const elStageTitle = byId('hud-stage-title');
      if (elStageTitle) {
        elStageTitle.textContent = stageCfg.title || '';
      }

      const qToBoss = Math.max(1, stageCfg.questionsToBoss || 15);
      const solvedInStage = Math.max(0, data.stageProgress || 0);
      const isBoss = Boolean(data.isBossPhase);

      const elProgText = byId('hud-stage-progress-text');
      const elBossHint = byId('hud-stage-boss-hint');
      const elProgFill = byId('hud-stage-progress-fill');

      if (isBoss) {
        if (elProgText) {
          elProgText.textContent = stageNum % 10 === 0
            ? '💴 10판 만원 상금 보스전! (1.5x)'
            : '🔥 1.5x 다이나믹 보스전!';
        }
        if (elBossHint) elBossHint.textContent = '정답 시 💣폭탄 발사! (격파시 게이지+10)';
        if (elProgFill) elProgFill.style.width = '100%';
      } else {
        const clampedSolved = Math.min(qToBoss, solvedInStage);
        const remaining = Math.max(0, qToBoss - clampedSolved);
        if (elProgText) elProgText.textContent = `일반 문제 ${clampedSolved} / ${qToBoss}`;
        if (elBossHint) {
          elBossHint.textContent = stageNum % 10 === 0
            ? `💴만원 보스까지 ${remaining}문제`
            : `보스 출현까지 ${remaining}문제`;
        }
        if (elProgFill) elProgFill.style.width = `${Math.round((clampedSolved / qToBoss) * 100)}%`;
      }

      // 3. Speedometer, RPM Bar & Speed Multiplier Badge
      const speedKmh = Math.round(data.speed || 36);
      const elSpeedVal = byId('hud-speed-value');
      if (elSpeedVal) {
        elSpeedVal.textContent = String(speedKmh);
      }
      const elMultBadge = byId('hud-speed-mult-badge');
      if (elMultBadge) {
        const multVal = typeof data.speedMultiplier === 'number' ? data.speedMultiplier : 1.0;
        if (isBoss) {
          const bossMult = Math.round(multVal * 1.5 * 100) / 100;
          elMultBadge.textContent = `🔥${bossMult}x 보스폭주`;
        } else {
          elMultBadge.textContent = `${multVal.toFixed(1)}x 배속`;
        }
      }
      const elRpmFill = byId('hud-rpm-fill');
      if (elRpmFill) {
        const minSpd = 18;
        const maxSpd = 120;
        const rpmPct = Math.max(12, Math.min(100, Math.round(((speedKmh - minSpd) / (maxSpd - minSpd)) * 100)));
        elRpmFill.style.width = `${rpmPct}%`;
      }

      // 4. Robux Score, Active Pet, Combo & Pending Review Queue Counter
      const totalScore = typeof data.totalScore === 'number' ? data.totalScore : 0;
      const elScore = byId('hud-score');
      if (elScore) {
        elScore.textContent = `🟢 R$ ${totalScore.toLocaleString()}`;
      }

      const petInfo = getPetInfo(totalScore, Math.max(stageNum, data.maxStageReached || stageNum));
      if (petInfo && petInfo.current) {
        const elPetName = byId('hud-pet-name');
        const elPetLvl = byId('hud-pet-level');
        if (elPetName) {
          elPetName.textContent = petInfo.current.name;
        }
        if (elPetLvl) {
          elPetLvl.textContent = `Lv.${petInfo.current.level}`;
        }
      }

      const combo = data.combo || 0;
      const elCombo = byId('hud-combo');
      if (elCombo) {
        elCombo.textContent = `${combo} COMBO!`;
        elCombo.classList.remove('combo-pop');
        if (combo > 0) {
          void elCombo.offsetWidth;
          elCombo.classList.add('combo-pop');
        }
      }

      const reviewCount = typeof data.reviewCount === 'number' ? data.reviewCount : 0;
      const elHudReview = byId('hud-review-count');
      if (elHudReview) {
        elHudReview.textContent = `복습 대기: ${reviewCount}`;
      }
      const elBadgeCount = byId('review-badge-count');
      if (elBadgeCount) {
        elBadgeCount.textContent = String(reviewCount);
      }

      // 5. Real-Life Reward Gauges on Left Panel (달성 시 0부터 재시작 + 보너스 달성 개수 별도 표시)
      const totalCorrect = typeof data.totalCorrect === 'number' ? data.totalCorrect : 0;
      const bossesDefeated = typeof data.bossesDefeated === 'number'
        ? data.bossesDefeated
        : (window.SaveManager ? (window.SaveManager.getState().bossesDefeated || 0) : 0);
      const rewards = getRewardInfo(totalCorrect, bossesDefeated, Math.max(stageNum, data.maxStageReached || stageNum));
      const pm = rewards.pocketMoney;
      const ash = rewards.ashley;
      const jp = rewards.bossJackpot;

      const unpaidPocket = typeof pm.unpaidCount === 'number' ? pm.unpaidCount : pm.earnedCount;
      const unpaidAshley = typeof ash.unpaidCount === 'number' ? ash.unpaidCount : ash.earnedCount;
      const unpaidJackpot = jp ? (typeof jp.unpaidCount === 'number' ? jp.unpaidCount : jp.earnedCount) : 0;
      const totalUnpaid = unpaidPocket + unpaidAshley + unpaidJackpot;

      const elBonusSummaryPill = byId('hud-bonus-achieved-pill');
      if (elBonusSummaryPill) {
        elBonusSummaryPill.textContent = `🏆 달성 보너스 ${totalUnpaid}개`;
        elBonusSummaryPill.classList.toggle('has-bonus', totalUnpaid > 0);
      }

      const elHudPocketName = byId('hud-pocket-name');
      if (elHudPocketName) {
        elHudPocketName.textContent = String(pm.customName || '용돈 5,000원').replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\s]+/u, '');
      }
      const elPocketPhase = byId('hud-pocket-phase');
      if (elPocketPhase) {
        elPocketPhase.textContent = `(0→${pm.target}점)`;
      }
      const elPocketBonusBadge = byId('hud-pocket-bonus-badge');
      if (elPocketBonusBadge) {
        elPocketBonusBadge.textContent = `${unpaidPocket}개`;
        elPocketBonusBadge.classList.toggle('has-bonus', unpaidPocket > 0);
      }
      const elPocketCount = byId('hud-pocket-count');
      if (elPocketCount) {
        elPocketCount.textContent = `${pm.current} / ${pm.target}점`;
      }
      const elPocketFill = byId('hud-pocket-fill');
      if (elPocketFill) {
        elPocketFill.style.width = `${pm.percent}%`;
      }

      const elHudAshleyName = byId('hud-ashley-name');
      if (elHudAshleyName) {
        elHudAshleyName.textContent = String(ash.customName || '애슐리 외식').replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\s]+/u, '');
      }
      const elAshleyPhase = byId('hud-ashley-phase');
      if (elAshleyPhase) {
        elAshleyPhase.textContent = '(0→1,000점)';
      }
      const elAshleyBonusBadge = byId('hud-ashley-bonus-badge');
      if (elAshleyBonusBadge) {
        elAshleyBonusBadge.textContent = `${unpaidAshley}개`;
        elAshleyBonusBadge.classList.toggle('has-bonus', unpaidAshley > 0);
      }
      const elAshleyCount = byId('hud-ashley-count');
      if (elAshleyCount) {
        elAshleyCount.textContent = `${ash.current} / ${ash.target.toLocaleString()}점`;
      }
      const elAshleyFill = byId('hud-ashley-fill');
      if (elAshleyFill) {
        elAshleyFill.style.width = `${ash.percent}%`;
      }

      if (jp) {
        const elHudJackpotName = byId('hud-jackpot-name');
        if (elHudJackpotName) {
          elHudJackpotName.textContent = String(jp.customName || '10판 보스 만원').replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\s]+/u, '');
        }
        const elJackpotPhase = byId('hud-jackpot-phase');
        if (elJackpotPhase) {
          elJackpotPhase.textContent = '(0→10판)';
        }
        const elJackpotBonusBadge = byId('hud-jackpot-bonus-badge');
        if (elJackpotBonusBadge) {
          elJackpotBonusBadge.textContent = `${unpaidJackpot}개`;
          elJackpotBonusBadge.classList.toggle('has-bonus', unpaidJackpot > 0);
        }
        const elJackpotCount = byId('hud-jackpot-count');
        if (elJackpotCount) {
          elJackpotCount.textContent = `${jp.current} / ${jp.target}판`;
        }
        const elJackpotFill = byId('hud-jackpot-fill');
        if (elJackpotFill) {
          elJackpotFill.style.width = `${jp.percent}%`;
        }
      }

      // 6. Pause Chances Badge (2/2)
      if (typeof data.pauseChancesRemaining === 'number') {
        this.updatePauseButton(Boolean(data.isPaused), data.pauseChancesRemaining, data.maxPauseChances || 2);
      }
    },

    /**
     * Appends a live cheering message into the Roblox Live Cheer Box (#roblox-chat-feed)
     * @param {string} senderTag e.g. '시스템' | '유니콘펫' | '로블록스TV'
     * @param {string} text
     * @param {string} [styleType='system'] 'system' | 'pet' | 'tv'
     */
    pushRobloxChat: function (senderTag, text, styleType) {
      const feed = byId('roblox-chat-feed');
      if (!feed) return;

      const line = document.createElement('div');
      const clsType = styleType === 'pet'
        ? 'chat-line-pet'
        : (styleType === 'tv' ? 'chat-line-tv' : 'chat-line-system');
      line.className = `chat-line ${clsType}`;
      line.textContent = `[${senderTag}] ${text}`;
      feed.appendChild(line);

      while (feed.children.length > 3) {
        feed.removeChild(feed.firstElementChild);
      }
    },

    /**
     * Triggers Explosive Comic / Roblox Hit-Marker Impact Effect (Screen Shake + Floating Burst Badges)
     * @param {string} type 'correct' | 'boss' | 'wrong' | 'stageClear'
     * @param {Object} [options]
     */
    triggerImpactEffect: function (type, options) {
      const opts = options || {};
      const layer = byId('impact-fx-layer');

      // 1. Trigger Screen Shake on Body
      const isHeavy = type === 'boss' || type === 'stageClear' || (opts.combo && opts.combo >= 3);
      document.body.classList.remove('screen-shake-hit', 'screen-shake-heavy');
      void document.body.offsetWidth;
      document.body.classList.add(isHeavy ? 'screen-shake-heavy' : 'screen-shake-hit');

      if (_shakeTimer) {
        window.clearTimeout(_shakeTimer);
      }
      _shakeTimer = window.setTimeout(function () {
        document.body.classList.remove('screen-shake-hit', 'screen-shake-heavy');
      }, 440);

      if (!layer) return;

      // Helper to spawn a floating comic badge
      function spawnBadge(text, badgeClass, offsetX, offsetY) {
        const badge = document.createElement('div');
        badge.className = `impact-burst-badge ${badgeClass}`;
        badge.textContent = text;
        if (offsetX || offsetY) {
          badge.style.left = `calc(50% + ${offsetX || 0}px)`;
          badge.style.top = `calc(46% + ${offsetY || 0}px)`;
        }
        layer.appendChild(badge);
        window.setTimeout(function () {
          if (badge.parentNode) {
            badge.parentNode.removeChild(badge);
          }
        }, 960);
      }

      const pts = opts.points || 100;
      const combo = opts.combo || 1;

      if (type === 'boss') {
        // Spawn 2D Flying Bomb projectile visual flying from player car to boss
        const bombEl = document.createElement('div');
        bombEl.className = 'impact-flying-bomb';
        bombEl.textContent = '💣🚀';
        layer.appendChild(bombEl);
        window.setTimeout(function () {
          if (bombEl.parentNode) {
            bombEl.parentNode.removeChild(bombEl);
          }
        }, 720);

        spawnBadge(`💣 초대형 폭탄 보스 직격!! BOOM!!`, 'impact-boss', 0, -24);
        spawnBadge(`🔥 1.5x 보스 타격!! +${pts} R$`, 'impact-combo', 0, 28);
      } else if (type === 'stageClear') {
        spawnBadge(`👑 BOSS KO!! 상금 게이지 +10 상승!`, 'impact-boss', 0, -22);
        spawnBadge(`🎉 보스 클리어 보너스 +${pts} R$!`, 'impact-combo', 0, 26);
      } else if (type === 'wrong') {
        spawnBadge(`💢 OOF!! 함정 블록 충돌! (-1 ❤️)`, 'impact-wrong', 0, 0);
      } else {
        spawnBadge(`💥 블록 격파!! +${pts} R$`, 'impact-correct', 0, combo >= 2 ? -20 : 0);
        if (combo >= 2) {
          spawnBadge(`👑 소윤이 나이스! x${combo} COMBO!`, 'impact-combo', 0, 26);
        }
      }
    },

    /**
     * Updates the Top Overhead Highway Quiz Display Board (#question-banner) and 3-lane buttons
     * @param {Object} question
     * @param {boolean} isBossPhase
     * @param {number} currentLane
     */
    showQuestion: function (question, isBossPhase, currentLane) {
      if (!question) return;

      const banner = byId('question-banner');
      const catBadge = byId('question-category-badge');
      const revBadge = byId('question-review-badge');
      const bossBadge = byId('question-boss-badge');
      const promptEl = byId('question-prompt');
      const subPromptEl = byId('question-subprompt');

      const isReview = Boolean(question.isReview);
      const isBoss = Boolean(isBossPhase);

      if (banner) {
        banner.classList.toggle('review-mode-active', isReview);
        banner.classList.toggle('boss-mode-active', isBoss && !isReview);
      }

      if (catBadge) {
        if (question.categoryLabel) {
          catBadge.textContent = question.categoryLabel;
        } else if (question.category === 'english') {
          catBadge.textContent = '🔤 영어 단어 퀴즈';
        } else {
          catBadge.textContent = '🧮 수학 (두자리 연산)';
        }
      }

      if (revBadge) {
        revBadge.classList.toggle('hidden', !isReview);
      }

      if (bossBadge) {
        bossBadge.classList.toggle('hidden', !isBoss);
      }

      if (promptEl) {
        const prefix = isReview ? '🔥 [복습] ' : '';
        promptEl.textContent = prefix + (question.prompt || '');
      }

      if (subPromptEl) {
        subPromptEl.textContent = question.subPrompt || '정답 차선으로 이동하여 게이트를 통과하세요!';
      }

      const choices = Array.isArray(question.choices) ? question.choices : ['-', '-', '-'];
      for (let i = 0; i < 3; i++) {
        const cText = choices[i] !== undefined ? String(choices[i]) : '-';
        const pillTextEl = byId(`choice-text-${i}`);
        if (pillTextEl) {
          pillTextEl.textContent = cText;
        }
        const laneBtnChoiceEl = byId(`lane-btn-choice-${i}`);
        if (laneBtnChoiceEl) {
          laneBtnChoiceEl.textContent = cText;
        }
      }

      if (typeof currentLane === 'number') {
        this.updateActiveLane(currentLane);
      }

      this.updateGateProgress(0); const _sp = byId('speech-hud-panel'); if (_sp) { const _isS = Boolean(question.isSpeech); _sp.classList.toggle('hidden', !_isS); if (_isS) this.updateSpeechStatus('🎙️ 마이크 켜짐', `큰 소리로 "${(question.targetWord || question.answerText || '').toUpperCase()}" [${question.targetPron || ''}] 말하기!`, true, false); }
    },

    /**
     * Highlights the currently selected lane on both the top preview pills and bottom cockpit buttons
     * @param {number} laneIndex (0, 1, 2)
     */
    updateSpeechStatus: function (statusText, heardText, isListening, isMatched) { const indEl = byId('speech-mic-indicator'); if (indEl && statusText) { indEl.textContent = statusText; indEl.classList.toggle('listening', Boolean(isListening)); indEl.classList.toggle('matched', Boolean(isMatched)); } const heardEl = byId('speech-heard-text'); if (heardEl && heardText) { heardEl.textContent = heardText; } }, updateActiveLane: function (laneIndex) {
      for (let i = 0; i < 3; i++) {
        const isCurrent = (i === laneIndex);
        const pill = byId(`choice-pill-${i}`);
        if (pill) {
          pill.classList.toggle('active-lane', isCurrent);
        }
        const btn = byId(`btn-lane-${i}`);
        if (btn) {
          btn.classList.toggle('active-lane', isCurrent);
        }
        const steerBtn = byId(`touch-steer-${i}`);
        if (steerBtn) {
          steerBtn.classList.toggle('active-lane', isCurrent);
        }
      }
    },

    /**
     * Updates the gate approach progress bar (0.0 -> 1.0)
     * @param {number} progress0to1
     */
    updateGateProgress: function (progress0to1) {
      const fill = byId('gate-progress-fill');
      if (fill) {
        const pct = Math.max(0, Math.min(100, Math.round((Number(progress0to1) || 0) * 100)));
        fill.style.width = `${pct}%`;
      }
    },

    /**
     * Shows and initializes the Boss Battle HUD (#boss-hud)
     * @param {Object} stageConfig
     * @param {number} bossCurrentHp
     * @param {number} bossMaxHp
     */
    showBossHUD: function (stageConfig, bossCurrentHp, bossMaxHp) {
      const bossHud = byId('boss-hud');
      if (bossHud) {
        bossHud.classList.remove('hidden');
      }
      const elName = byId('boss-name');
      if (elName && stageConfig) {
        elName.textContent = stageConfig.bossName || '메카 보스';
      }
      const elTitle = byId('boss-title');
      if (elTitle && stageConfig) {
        elTitle.textContent = stageConfig.bossTitle || '스테이지 수문장';
      }
      this.updateBossHUD(bossCurrentHp, bossMaxHp);
    },

    /**
     * Updates Boss HP bar and text
     * @param {number} bossCurrentHp
     * @param {number} bossMaxHp
     */
    updateBossHUD: function (bossCurrentHp, bossMaxHp) {
      const maxHp = Math.max(1, bossMaxHp || 9);
      const curHp = Math.max(0, Math.min(maxHp, bossCurrentHp));
      const pct = Math.round((curHp / maxHp) * 100);

      const fill = byId('boss-hp-fill');
      if (fill) {
        fill.style.width = `${pct}%`;
      }
      const text = byId('boss-hp-text');
      if (text) {
        text.textContent = `BOSS HP ${curHp} / ${maxHp}`;
      }
    },

    /**
     * Hides the Boss Battle HUD
     */
    hideBossHUD: function () {
      const bossHud = byId('boss-hud');
      if (bossHud) {
        bossHud.classList.add('hidden');
      }
    },

    /**
     * Displays an instant visual feedback toast when passing a gate
     * @param {boolean} isCorrect
     * @param {string} message
     */
    showFeedbackToast: function (isCorrect, message) {
      const toast = byId('feedback-toast');
      if (!toast) return;

      if (_toastTimer) {
        window.clearTimeout(_toastTimer);
        _toastTimer = null;
      }

      toast.textContent = message;
      toast.classList.remove('hidden', 'toast-correct', 'toast-wrong');
      toast.classList.add(isCorrect ? 'toast-correct' : 'toast-wrong');

      _toastTimer = window.setTimeout(function () {
        toast.classList.add('hidden');
      }, 2400);
    },

    /**
     * Triggers red damage flash on the screen edges
     */
    triggerDamageFlash: function () {
      document.body.classList.add('damage-flash');
      if (_damageFlashTimer) {
        window.clearTimeout(_damageFlashTimer);
      }
      _damageFlashTimer = window.setTimeout(function () {
        document.body.classList.remove('damage-flash');
      }, 460);
    },

    /**
     * Displays the Stage Clear celebratory banner when a Boss is defeated
     * @param {number} clearedStage
     * @param {Object} nextStageConfig
     */
    showStageClearBanner: function (clearedStage, nextStageConfig) {
      const banner = byId('stage-clear-banner');
      if (!banner) return;

      const nextStageNum = nextStageConfig ? nextStageConfig.stage : (clearedStage + 1);
      const nextTitle = nextStageConfig ? nextStageConfig.title : '';
      const isJackpot = (clearedStage % 10 === 0);

      const titleEl = byId('stage-clear-title');
      if (titleEl) {
        titleEl.textContent = isJackpot
          ? `💴 STAGE ${clearedStage} 10판 보스 격파! 만원(10,000원) 상금 획득!! 🎉`
          : `🎉 STAGE ${clearedStage} 보스 격파 & 상금 게이지 +10 상승!`;
      }
      const descEl = byId('stage-clear-desc');
      if (descEl) {
        descEl.textContent = isJackpot
          ? `🏆 초대박!! 이소윤 선수가 10판째 보스를 해치우고 만원(10,000원) 상금 + 상금 게이지 +10점을 획득했어요!! 다음 월드: STAGE ${nextStageNum} (${nextTitle})`
          : `🏆 대박!! 보스 격파 보너스로 상금 게이지 +10점 상승! 다음 로블록스 오비 월드(STAGE ${nextStageNum} · ${nextTitle})로 승급했어요! (체력 +2 회복)`;
      }

      banner.classList.remove('hidden');
      if (_stageClearTimer) {
        window.clearTimeout(_stageClearTimer);
      }
      _stageClearTimer = window.setTimeout(function () {
        banner.classList.add('hidden');
      }, 3400);
    },

    hideStageClearBanner: function () {
      const banner = byId('stage-clear-banner');
      if (banner) {
        banner.classList.add('hidden');
      }
    },

    /**
     * Shows the Stage Retry / Checkpoint Modal when HP reaches 0.
     * Emphasizes that currentStage and cumulative stats are preserved!
     * @param {Object} saveState
     * @param {number} currentStage
     */
    showGameOverModal: function (saveState, currentStage) {
      const modal = byId('gameover-modal');
      if (!modal) return;

      const state = saveState || (window.SaveManager ? window.SaveManager.getState() : {});
      const stageNum = Math.max(1, parseInt(currentStage || state.currentStage, 10) || 1);
      const stageCfg = (window.GameConfig && window.GameConfig.getStageConfig)
        ? window.GameConfig.getStageConfig(stageNum)
        : { title: '' };

      const totalSolved = parseInt(state.totalSolved, 10) || 0;
      const totalCorrect = parseInt(state.totalCorrect, 10) || 0;
      const accuracy = totalSolved > 0 ? Math.round((totalCorrect / totalSolved) * 100) : 0;
      const wrongQueue = Array.isArray(state.wrongAnswerQueue) ? state.wrongAnswerQueue : [];

      const elLabel = byId('retry-stage-label');
      if (elLabel) {
        elLabel.textContent = `STAGE ${stageNum} (${stageCfg.title})`;
      }

      const elStatStage = byId('retry-stat-stage');
      if (elStatStage) {
        elStatStage.textContent = `STAGE ${stageNum}`;
      }

      const elStatScore = byId('retry-stat-score');
      if (elStatScore) {
        elStatScore.textContent = `🟢 R$ ${(state.totalScore || 0).toLocaleString()}`;
      }

      const elStatAcc = byId('retry-stat-acc');
      if (elStatAcc) {
        elStatAcc.textContent = `${accuracy}%`;
      }

      const elStatRev = byId('retry-stat-review');
      if (elStatRev) {
        elStatRev.textContent = `${wrongQueue.length} 문제`;
      }

      const btnRetry = byId('btn-retry-stage');
      if (btnRetry) {
        btnRetry.textContent = `⚡ STAGE ${stageNum} 즉시 재도전 (소윤이 누적 로벅스·오답 기록 유지)`;
      }

      modal.classList.remove('hidden');
    },

    hideGameOverModal: function () {
      const modal = byId('gameover-modal');
      if (modal) {
        modal.classList.add('hidden');
      }
    },

    /**
     * Renders and opens the Cumulative Wrong Answer Review Notebook Modal (#review-modal)
     * @param {Object} [saveState]
     */
    showReviewModal: function (saveState) {
      this.renderReviewModal(saveState);
      const modal = byId('review-modal');
      if (modal) {
        modal.classList.remove('hidden');
      }
    },

    hideReviewModal: function () {
      const modal = byId('review-modal');
      if (modal) {
        modal.classList.add('hidden');
      }
    },

    renderReviewModal: function (saveState) {
      const state = saveState || (window.SaveManager ? window.SaveManager.getState() : {});
      const queue = Array.isArray(state.wrongAnswerQueue) ? state.wrongAnswerQueue : [];
      const history = Array.isArray(state.reviewHistory) ? state.reviewHistory : [];

      const elPendingTotal = byId('review-pending-total');
      if (elPendingTotal) {
        elPendingTotal.textContent = `${queue.length} 문제`;
      }

      const elHistoryTotal = byId('review-history-total');
      if (elHistoryTotal) {
        elHistoryTotal.textContent = `${history.length} 건`;
      }

      const container = byId('review-list-container');
      if (!container) return;

      // Merge queue items and history items cleanly without duplicates
      const combined = [];
      const seenIds = new Set();

      queue.forEach(function (item) {
        if (!item) return;
        const key = item.id || item.prompt;
        seenIds.add(key);
        combined.push({
          prompt: item.prompt,
          category: item.category,
          answerText: item.answerText || item.correctAnswer,
          wrongChoice: item.wrongChoice || '오답',
          wrongCount: item.wrongCount || 1,
          inQueue: true,
          mastered: false
        });
      });

      history.forEach(function (item) {
        if (!item) return;
        const key = item.id || item.prompt;
        if (seenIds.has(key)) return;
        seenIds.add(key);
        combined.push({
          prompt: item.prompt,
          category: item.category,
          answerText: item.answerText || item.correctAnswer,
          wrongChoice: item.wrongChoice || '오답',
          wrongCount: item.wrongCount || 1,
          inQueue: false,
          mastered: Boolean(item.mastered)
        });
      });

      if (combined.length === 0) {
        container.innerHTML =
          '<div class="review-empty-state">✨ 아직 틀린 문제가 없습니다! 레이스를 달리며 틀린 문제가 생기면 이곳에 자동으로 기록되고 복습 문제로 다시 출제됩니다.</div>';
        return;
      }

      container.innerHTML = combined
        .map(function (entry) {
          const catBadge = entry.category === 'english' ? '🔤 영어' : '🧮 수학';
          const statusClass = entry.inQueue ? 'pending' : 'mastered';
          const cardClass = entry.inQueue ? 'is-pending' : 'is-mastered';
          const statusText = entry.inQueue
            ? `🔥 복습 재출제 대기중 (오답 ${entry.wrongCount}회)`
            : '✅ 복습 마스터 완료';

          return `
            <div class="review-item-card ${cardClass}">
              <div class="review-item-main">
                <div class="review-item-prompt">[${catBadge}] ${escapeHtml(entry.prompt)}</div>
                <div class="review-item-detail">
                  정답: <strong class="ans-correct">${escapeHtml(entry.answerText)}</strong>
                  &nbsp;|&nbsp; 내가 선택한 답: <strong class="ans-wrong">${escapeHtml(entry.wrongChoice)}</strong>
                </div>
              </div>
              <span class="review-status-tag ${statusClass}">${statusText}</span>
            </div>
          `;
        })
        .join('');
    },

    /**
     * Shows or hides In-Place Time-Freeze Pause Animation (No blocking modal popup! Question & 3D Gate stay 100% visible!)
     * @param {boolean} visible
     * @param {number} [remainingChances]
     * @param {number} [maxChances]
     */
    setPauseModalVisible: function (visible, remainingChances, maxChances) {
      const modal = byId('pause-modal');
      if (modal) {
        modal.classList.add('hidden');
      }

      const isPaused = Boolean(visible);
      document.body.classList.toggle('is-time-paused', isPaused);

      const inlineBanner = byId('pause-inline-banner');
      if (inlineBanner) {
        inlineBanner.classList.toggle('hidden', !isPaused);
      }

      const maxC = typeof maxChances === 'number' ? maxChances : 2;
      const remC = typeof remainingChances === 'number' ? Math.max(0, remainingChances) : maxC;

      const titleEl = byId('pause-inline-title');
      if (titleEl) {
        titleEl.textContent = `⏸️ TIME FREEZE! 화면 일시정지 작동 중 (남은 일시정지 기회: ${remC} / ${maxC})`;
      }

      this.updatePauseButton(isPaused, remC, maxC);
    },

    /**
     * Updates the Pause Button (#btn-pause) and 2-Chance Badge (#pause-chance-badge)
     * @param {boolean} isPaused
     * @param {number} remainingChances
     * @param {number} [maxChances=2]
     */
    updatePauseButton: function (isPaused, remainingChances, maxChances) {
      const btn = byId('btn-pause');
      const iconEl = byId('pause-icon');
      const labelEl = byId('pause-label');
      const badgeEl = byId('pause-chance-badge');

      const maxC = Math.max(1, typeof maxChances === 'number' ? maxChances : 2);
      const remC = Math.max(0, Math.min(maxC, typeof remainingChances === 'number' ? remainingChances : maxC));

      if (btn) {
        btn.classList.toggle('pause-active-resume', Boolean(isPaused));
        btn.classList.toggle('pause-exhausted', !isPaused && remC <= 0);
      }

      if (isPaused) {
        if (iconEl) iconEl.textContent = '▶️';
        if (labelEl) labelEl.textContent = '다시 출발';
        if (badgeEl) badgeEl.textContent = `남은기회 ${remC}/${maxC}`;
      } else {
        if (iconEl) iconEl.textContent = '⏸️';
        if (labelEl) labelEl.textContent = '일시정지';
        if (badgeEl) {
          let icons = '';
          for (let i = 0; i < maxC; i++) {
            icons += i < remC ? '⚡' : '🖤';
          }
          badgeEl.textContent = `${icons} ${remC}/${maxC}`;
        }
      }
    },

    /**
     * Updates the Sound Mute/Unmute button UI
     * @param {boolean} isMuted
     */
    updateSoundButton: function (isMuted) {
      const iconEl = byId('sound-icon');
      const labelEl = byId('sound-label');
      if (iconEl) {
        iconEl.textContent = isMuted ? '🔇' : '🔊';
      }
      if (labelEl) {
        labelEl.textContent = isMuted ? '음소거' : '사운드 ON';
      }
    },

    /**
     * Shows and updates the Roblox Obby 2x Speed Action Mini-Game HUD (#obby-minigame-hud)
     * @param {number} clearedWaves
     * @param {number} totalWaves
     */
    showObbyHUD: function (clearedWaves, totalWaves) {
      const obbyHud = byId('obby-minigame-hud');
      const qBanner = byId('question-banner');
      if (qBanner) {
        qBanner.classList.add('hidden');
      }
      if (obbyHud) {
        obbyHud.classList.remove('hidden');
      }
      document.body.classList.add('obby-mode-active');

      const total = Math.max(1, totalWaves || 7);
      const cleared = Math.max(0, Math.min(total, clearedWaves || 0));
      const pct = Math.round((cleared / total) * 100);

      const fillEl = byId('obby-progress-fill');
      if (fillEl) {
        fillEl.style.width = `${pct}%`;
      }
      const titleEl = byId('obby-hud-title');
      if (titleEl) {
        titleEl.textContent = `🧱 블록 벽은 차선 이동(◀▶) · 🔥 빨간 용암은 점프(⬆️)! (${cleared}/${total})`;
      }
    },

    /**
     * Hides the Roblox Obby Mini-Game HUD and restores the Question Banner
     */
    hideObbyHUD: function () {
      const obbyHud = byId('obby-minigame-hud');
      const qBanner = byId('question-banner');
      if (obbyHud) {
        obbyHud.classList.add('hidden');
      }
      if (qBanner) {
        qBanner.classList.remove('hidden');
      }
      document.body.classList.remove('obby-mode-active');
    },

    /**
     * Updates Orientation Mode UI ('auto' | 'portrait' | 'landscape') on body, Utility Bar, and Dashboard
     * @param {string} mode
     */
    updateOrientationUI: function (mode) {
      const m = (mode === 'portrait' || mode === 'landscape') ? mode : 'auto';
      document.body.classList.remove('view-mode-auto', 'view-mode-portrait', 'view-mode-landscape');
      document.body.classList.add('view-mode-' + m);

      const orientIcon = byId('orient-icon');
      const orientLabel = byId('orient-label');
      if (orientIcon) {
        orientIcon.textContent = m === 'portrait' ? '📱' : (m === 'landscape' ? '📺' : '🔄');
      }
      if (orientLabel) {
        orientLabel.textContent = m === 'portrait' ? '화면: 세로' : (m === 'landscape' ? '화면: 가로' : '화면: 자동');
      }

      const dashOrient = byId('dashboard-orientation-selector');
      if (dashOrient) {
        const btns = dashOrient.querySelectorAll('[data-orient]');
        btns.forEach(function (btn) {
          btn.classList.toggle('active', btn.getAttribute('data-orient') === m);
        });
      }
    },

    /**
     * Opens the Parent Control Modal (#parent-modal)
     * @param {Object} [saveState]
     * @param {boolean} [isUnlocked=false]
     */
    showParentModal: function (saveState, isUnlocked) {
      this.renderParentModal(saveState);
      const modal = byId('parent-modal');
      const pinView = byId('parent-pin-view');
      const settingsView = byId('parent-settings-view');
      const pinInput = byId('parent-pin-input');
      const pinError = byId('parent-pin-error');

      if (pinError) {
        pinError.classList.add('hidden');
      }
      if (pinInput) {
        pinInput.value = '';
      }

      const unlocked = Boolean(isUnlocked);
      if (pinView) {
        pinView.classList.toggle('hidden', unlocked);
      }
      if (settingsView) {
        settingsView.classList.toggle('hidden', !unlocked);
      }
      if (modal) {
        modal.classList.remove('hidden');
      }
      if (!unlocked && pinInput) {
        window.setTimeout(function () {
          try { pinInput.focus(); } catch (_e) {}
        }, 50);
      }
    },

    hideParentModal: function () {
      const modal = byId('parent-modal');
      if (modal) {
        modal.classList.add('hidden');
      }
    },

    /**
     * Renders the Parent Control Modal's Speed Controls and Bonus Payout / Deletion List
     * @param {Object} [saveState]
     */
    renderParentModal: function (saveState) {
      const state = saveState || (window.SaveManager ? window.SaveManager.getState() : {});
      const currentStage = Math.max(1, parseInt(state.currentStage, 10) || 1);
      const maxStageReached = Math.max(currentStage, parseInt(state.maxStageReached, 10) || 1);
      const totalCorrect = parseInt(state.totalCorrect, 10) || 0;
      const bossesDefeated = parseInt(state.bossesDefeated, 10) || 0;
      const currentMult = typeof state.speedMultiplier === 'number' ? state.speedMultiplier : 1.0;

      // 1. Speed Selector inside Parent Modal
      const elSpeedBadge = byId('parent-current-speed-badge');
      if (elSpeedBadge) {
        elSpeedBadge.textContent = `현재 설정: ${currentMult.toFixed(1)}x 배속`;
      }
      const speedContainer = byId('dashboard-speed-selector');
      if (speedContainer) {
        const speedBtns = speedContainer.querySelectorAll('.speed-preset-pill');
        speedBtns.forEach(function (btn) {
          const m = parseFloat(btn.getAttribute('data-mult'));
          btn.classList.toggle('active', Math.abs(m - currentMult) < 0.08);
        });
      }

      // 2. Bonus Payout & Deletion Manager
      const rewards = getRewardInfo(totalCorrect, bossesDefeated, maxStageReached);
      const pm = rewards.pocketMoney;
      const ash = rewards.ashley;
      const jp = rewards.bossJackpot;

      const unpaidPocket = typeof pm.unpaidCount === 'number' ? pm.unpaidCount : pm.earnedCount;
      const unpaidAshley = typeof ash.unpaidCount === 'number' ? ash.unpaidCount : ash.earnedCount;
      const unpaidJackpot = jp ? (typeof jp.unpaidCount === 'number' ? jp.unpaidCount : jp.earnedCount) : 0;
      const totalUnpaid = unpaidPocket + unpaidAshley + unpaidJackpot;

      const elUnpaidTotal = byId('parent-unpaid-total-badge');
      if (elUnpaidTotal) {
        elUnpaidTotal.textContent = `미지급 달성 보너스: ${totalUnpaid}개`;
      }

      const container = byId('parent-bonus-list-container');
      if (!container) return;

      const items = [
        {
          key: 'pocket',
          badgeLabel: '보너스 1',
          customName: pm.customName || state.bonusNamePocket || '용돈 5,000원',
          gaugeText: `게이지 ${pm.current}/${pm.target}점`,
          unpaid: unpaidPocket
        },
        {
          key: 'ashley',
          badgeLabel: '보너스 2',
          customName: ash.customName || state.bonusNameAshley || '애슐리 외식',
          gaugeText: `게이지 ${ash.current}/${ash.target.toLocaleString()}점`,
          unpaid: unpaidAshley
        },
        {
          key: 'jackpot',
          badgeLabel: '10단계 보스',
          customName: (jp && jp.customName) || state.bonusNameJackpot || '10판 보스 만원',
          gaugeText: `게이지 ${jp ? jp.current : 0}/${jp ? jp.target : 10}판`,
          unpaid: unpaidJackpot
        }
      ];

      container.innerHTML = items.map(function (item) {
        const hasUnpaid = item.unpaid > 0;
        const cardCls = 'parent-bonus-card compact-bonus-card' + (hasUnpaid ? ' has-unpaid-bonus' : '');

        return `
          <div class="${cardCls}" data-bonus-key="${item.key}">
            <div class="compact-bonus-row1">
              <span class="parent-bonus-type-tag">${escapeHtml(item.badgeLabel)}</span>
              <input
                type="text"
                class="parent-bonus-name-input"
                data-bonus-key="${item.key}"
                value="${escapeHtml(item.customName)}"
                maxlength="40"
                placeholder="보너스 이름"
              />
              <button
                type="button"
                class="btn-parent-save-field"
                data-action="save-bonus-name"
                data-bonus-key="${item.key}"
              >
                이름저장
              </button>
              <span class="compact-gauge-pill">${escapeHtml(item.gaugeText)}</span>
            </div>

            <div class="compact-bonus-row2">
              <div class="compact-count-group">
                <span class="compact-count-label">달성횟수:</span>
                <button
                  type="button"
                  class="btn-parent-step"
                  data-action="step-bonus-count"
                  data-step="-1"
                  data-bonus-key="${item.key}"
                >
                  ➖
                </button>
                <input
                  type="number"
                  min="0"
                  max="999"
                  class="parent-bonus-count-input"
                  data-bonus-key="${item.key}"
                  value="${item.unpaid}"
                />
                <button
                  type="button"
                  class="btn-parent-step"
                  data-action="step-bonus-count"
                  data-step="1"
                  data-bonus-key="${item.key}"
                >
                  ➕
                </button>
                <button
                  type="button"
                  class="btn-parent-save-field"
                  data-action="save-bonus-count"
                  data-bonus-key="${item.key}"
                >
                  횟수저장
                </button>
              </div>
              <button
                type="button"
                class="btn-parent-mark-paid"
                data-action="mark-paid"
                data-bonus-key="${item.key}"
                ${hasUnpaid ? '' : 'disabled'}
              >
                ✅ 지급완료(삭제)
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  };

  window.UIManager = UIManager;
  window.UI = UIManager;
})(window);
