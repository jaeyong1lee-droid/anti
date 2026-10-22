/**
 * 👑 이소윤의 로블록스 오비 레이서 3D (Soyun's Roblox Obby Racer 3D)
 * Main Game Controller & State Machine
 * Coordinates SaveManager, QuestionEngine, Engine3D, SoundEngine, and UIManager.
 * Exposes `window.GameController`
 */
(function (window) {
  'use strict';

  const state = {
    initialized: false,
    isPlaying: false,
    isPaused: false,
    isGameOver: false,
    wasPlayingBeforeModal: false,

    stage: 1,
    selectedDashboardStage: 1,
    stageConfig: null,
    stageProgress: 0,

    hp: 5,
    maxHp: 5,
    speed: 36,
    speedMultiplier: 1.0,
    combo: 0,
    currentLane: 1,
    currentQuestion: null,

    isBossPhase: false,
    bossCurrentHp: 9,
    bossMaxHp: 9,

    pauseChancesRemaining: 2,
    maxPauseChances: 2,

    isObbyMode: false,
    obbyWavesTotal: 7,
    obbyWavesCleared: 0,
    orientationMode: 'auto'
  };

  let _speechRec = null;
  let _speechRestartTimer = null;
  let _speechPermissionDenied = false;

  function stopSpeechListening() {
    if (_speechRestartTimer) {
      window.clearTimeout(_speechRestartTimer);
      _speechRestartTimer = null;
    }
    if (_speechRec) {
      try {
        _speechRec.onresult = null;
        _speechRec.onerror = null;
        _speechRec.onend = null;
        _speechRec.abort();
      } catch (_e) {}
      _speechRec = null;
    }
  }

  function speakTargetWordTTS(word) {
    if (!word || typeof window.speechSynthesis === 'undefined') return;
    try {
      window.speechSynthesis.cancel();
      const utter = new window.SpeechSynthesisUtterance(String(word));
      utter.lang = 'en-US';
      utter.rate = 0.86;
      utter.pitch = 1.08;
      window.speechSynthesis.speak(utter);
    } catch (_e) {}
  }

  function startSpeechListening(question) {
    stopSpeechListening();
    if (!question || !question.isSpeech || question.speechPassed) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (window.UIManager && typeof window.UIManager.updateSpeechStatus === 'function') {
        window.UIManager.updateSpeechStatus(
          '🎤 음성 버튼 모드',
          `큰 소리로 "${(question.targetWord || '').toUpperCase()}" [${question.targetPron || ''}] 읽고 오른쪽 버튼을 눌러주세요!`,
          false,
          false
        );
      }
      return;
    }

    _speechPermissionDenied = false;
    try {
      const rec = new SpeechRecognition();
      _speechRec = rec;
      rec.lang = 'en-US';
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 5;

      rec.onstart = function () {
        if (window.UIManager && typeof window.UIManager.updateSpeechStatus === 'function') {
          window.UIManager.updateSpeechStatus(
            '🎙️ 마이크 켜짐',
            `영어로 "${(question.targetWord || '').toUpperCase()}" [${question.targetPron || ''}] 라고 말해보세요!`,
            true,
            false
          );
        }
      };

      rec.onresult = function (event) {
        if (!state.isPlaying || state.isPaused || !state.currentQuestion || !state.currentQuestion.isSpeech) return;
        const curQ = state.currentQuestion;
        if (curQ.speechPassed) return;

        let latestTranscript = '';
        let matchedTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (!res) continue;
          for (let a = 0; a < res.length; a++) {
            const alt = res[a];
            if (!alt || !alt.transcript) continue;
            const text = String(alt.transcript).trim();
            if (!latestTranscript) latestTranscript = text;
            if (window.QuestionEngine && typeof window.QuestionEngine.checkSpeechMatch === 'function') {
              if (window.QuestionEngine.checkSpeechMatch(text, curQ)) {
                matchedTranscript = text;
                break;
              }
            }
          }
          if (matchedTranscript) break;
        }

        if (matchedTranscript) {
          curQ.speechPassed = true;
          curQ.spokenText = matchedTranscript;
          stopSpeechListening();
          if (window.UIManager && typeof window.UIManager.updateSpeechStatus === 'function') {
            window.UIManager.updateSpeechStatus(
              '✅ 발음 성공!',
              `🎉 "${(curQ.targetWord || '').toUpperCase()}" 정확한 발음! 관문 통과!!`,
              false,
              true
            );
          }
          if (window.Engine3D && typeof window.Engine3D.resolveSpeechGatePass === 'function') {
            window.Engine3D.resolveSpeechGatePass(matchedTranscript);
          }
        } else if (latestTranscript && window.UIManager && typeof window.UIManager.updateSpeechStatus === 'function') {
          window.UIManager.updateSpeechStatus(
            '🎙️ 듣는 중...',
            `🗣️ 들린 소리: "${latestTranscript}" ➔ "${(curQ.targetWord || '').toUpperCase()}" [${curQ.targetPron || ''}] 라고 말해보세요!`,
            true,
            false
          );
        }
      };

      rec.onerror = function (ev) {
        const errCode = ev && ev.error ? String(ev.error) : '';
        if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
          _speechPermissionDenied = true;
          if (window.UIManager && typeof window.UIManager.updateSpeechStatus === 'function') {
            window.UIManager.updateSpeechStatus(
              '🎤 마이크 권한 필요',
              '브라우저 마이크 허용 후 [🎤 마이크 다시 켜기]를 눌러주세요!',
              false,
              false
            );
          }
        }
      };

      rec.onend = function () {
        if (
          !_speechPermissionDenied &&
          state.isPlaying &&
          !state.isPaused &&
          !state.isGameOver &&
          state.currentQuestion &&
          state.currentQuestion.isSpeech &&
          !state.currentQuestion.speechPassed
        ) {
          _speechRestartTimer = window.setTimeout(function () {
            if (state.isPlaying && !state.isPaused && state.currentQuestion && state.currentQuestion.isSpeech && !state.currentQuestion.speechPassed) {
              startSpeechListening(state.currentQuestion);
            }
          }, 220);
        }
      };

      rec.start();
    } catch (_err) {}
  }

  function getEffectiveSpeed() {
    const obbyFactor = state.isObbyMode ? 2.0 : 1.0;
    const bossFactor = (!state.isObbyMode && state.isBossPhase)
      ? ((window.GameConfig && window.GameConfig.BOSS_SPEED_MULTIPLIER) ? window.GameConfig.BOSS_SPEED_MULTIPLIER : 1.5)
      : 1.0;
    const cap = state.isObbyMode ? 240 : (state.isBossPhase ? 160 : 120);
    return Math.max(14, Math.min(cap, Math.round((state.speed || 36) * (state.speedMultiplier || 1.0) * obbyFactor * bossFactor)));
  }

  function getMaxHp() {
    return (window.GameConfig && window.GameConfig.MAX_HP) ? window.GameConfig.MAX_HP : 5;
  }

  function getStageCfg(stageNum) {
    if (window.GameConfig && typeof window.GameConfig.getStageConfig === 'function') {
      return window.GameConfig.getStageConfig(stageNum);
    }
    return {
      stage: stageNum || 1,
      title: '🌈 레인보우 스타터 오비 (Rainbow Obby)',
      questionsToBoss: 15,
      bossName: '블록 골렘 렉스 (Blocky Rex)',
      bossTitle: '1단계 로블록스 연산 수문장',
      bossHp: 9,
      baseSpeed: 36,
      themeColor: '#00f2fe',
      roadColor: '#1a103c',
      bossColor: 0xff3366
    };
  }

  function getActivePet() {
    const saveState = window.SaveManager ? window.SaveManager.getState() : {};
    if (window.GameConfig && typeof window.GameConfig.getCurrentPet === 'function') {
      const info = window.GameConfig.getCurrentPet(
        saveState.totalScore || 0,
        Math.max(state.stage || 1, saveState.maxStageReached || 1)
      );
      return info.current;
    }
    return {
      level: 1,
      icon: '🐣',
      name: '🐣 블록 병아리 펫 (Blocky Chick)',
      shortName: '🐣 블록 병아리 펫',
      cheerTag: '병아리펫'
    };
  }

  function syncHUD() {
    const saveState = window.SaveManager ? window.SaveManager.getState() : {};
    const wrongQueue = Array.isArray(saveState.wrongAnswerQueue) ? saveState.wrongAnswerQueue : [];

    if (window.UIManager) {
      window.UIManager.updateHUD({
        hp: state.hp,
        maxHp: state.maxHp,
        stage: state.stage,
        maxStageReached: Math.max(state.stage, saveState.maxStageReached || 1),
        stageConfig: state.stageConfig,
        stageProgress: state.stageProgress,
        isBossPhase: state.isBossPhase,
        speed: getEffectiveSpeed(),
        speedMultiplier: state.speedMultiplier,
        totalScore: saveState.totalScore || 0,
        totalCorrect: saveState.totalCorrect || 0,
        bossesDefeated: saveState.bossesDefeated || 0,
        combo: state.combo,
        reviewCount: wrongQueue.length,
        isPaused: state.isPaused,
        pauseChancesRemaining: state.pauseChancesRemaining,
        maxPauseChances: state.maxPauseChances
      });
    }
  }

  const GameController = {
    /**
     * Initializes all subsystems, loads cumulative save state, binds DOM & keyboard events,
     * and renders the Cumulative Progress Dashboard.
     */
    init: function () {
      if (state.initialized) return this;
      state.initialized = true;

      // 1. Load Cumulative Save State (Never resets to Stage 1 on reload!)
      const saveState = window.SaveManager ? window.SaveManager.load() : { currentStage: 1, stageProgress: 0 };
      state.maxHp = getMaxHp();
      state.hp = state.maxHp;
      state.stage = Math.max(1, parseInt(saveState.currentStage, 10) || 1);
      state.selectedDashboardStage = state.stage;
      state.stageConfig = getStageCfg(state.stage);
      state.stageProgress = Math.max(0, parseInt(saveState.stageProgress, 10) || 0);
      state.speedMultiplier = typeof saveState.speedMultiplier === 'number' ? saveState.speedMultiplier : 1.0;
      state.speed = state.stageConfig.baseSpeed || 36;
      state.currentLane = 1;
      try {
        const savedOrient = window.localStorage.getItem('soyun_view_orientation_mode');
        if (savedOrient === 'portrait' || savedOrient === 'landscape' || savedOrient === 'auto') {
          state.orientationMode = savedOrient;
        }
      } catch (e) {}

      // 2. Initialize 3D Engine inside #game-canvas-container
      const container = document.getElementById('game-canvas-container');
      if (window.Engine3D && typeof window.Engine3D.init === 'function') {
        window.Engine3D.init(container, {
          onGatePass: function (selectedLane, questionData, isCorrect) {
            GameController.handleGatePass(selectedLane, questionData, isCorrect);
          },
          onGateProgress: function (progress0to1) {
            if (window.UIManager) {
              window.UIManager.updateGateProgress(progress0to1);
            }
          },
          onObbyWavePass: function (res) {
            GameController.handleObbyWavePass(res);
          }
        });
        if (typeof window.Engine3D.setViewOrientationMode === 'function') {
          window.Engine3D.setViewOrientationMode(state.orientationMode);
        }
        window.Engine3D.setStageTheme(state.stageConfig);
        window.Engine3D.setSpeed(getEffectiveSpeed());
        window.Engine3D.setLane(1);
        window.Engine3D.start();
        if (typeof window.Engine3D.setDemoMode === 'function') {
          window.Engine3D.setDemoMode(true);
        }
        window.Engine3D.setPaused(false);
      }

      // 3. Bind UI & Keyboard Controls
      this._bindEvents();

      // 4. Render Initial Cumulative Dashboard & HUD
      if (window.UIManager) {
        if (typeof window.UIManager.updateOrientationUI === 'function') {
          window.UIManager.updateOrientationUI(state.orientationMode);
        }
        window.UIManager.renderDashboard(saveState, state.selectedDashboardStage);
        window.UIManager.setStartScreenVisible(true);
        syncHUD();
      }

      return this;
    },

    /**
     * Starts or continues the race at the selected/current stage while preserving all cumulative records.
     * @param {number} [stageOverride]
     */
    startGame: function (stageOverride) {
      if (!state.initialized) {
        this.init();
      }

      if (window.SoundEngine) {
        window.SoundEngine.init();
        window.SoundEngine.playClick();
      }

      const saveState = window.SaveManager ? window.SaveManager.getState() : { currentStage: 1 };
      const targetStage = Math.max(
        1,
        parseInt(stageOverride !== undefined ? stageOverride : (state.selectedDashboardStage || saveState.currentStage), 10) || 1
      );

      const prevStage = parseInt(saveState.currentStage, 10) || 1;
      const savedStageProgress = parseInt(saveState.stageProgress, 10) || 0;

      // Preserve maxStageReached while setting active currentStage
      if (window.SaveManager && typeof window.SaveManager.setStage === 'function') {
        const prevMax = Math.max(saveState.maxStageReached || 1, saveState.currentStage || 1);
        window.SaveManager.setStage(targetStage);
        const updated = window.SaveManager.getState();
        if (updated.maxStageReached < prevMax) {
          updated.maxStageReached = prevMax;
          window.SaveManager.save();
        }
      }

      state.stage = targetStage;
      state.selectedDashboardStage = targetStage;
      state.stageConfig = getStageCfg(targetStage);
      const qToBoss = state.stageConfig.questionsToBoss || 15;
      state.stageProgress = (targetStage === prevStage && savedStageProgress > 0 && savedStageProgress < qToBoss)
        ? savedStageProgress
        : 0;
      if (window.SaveManager && typeof window.SaveManager.setStageProgress === 'function') {
        window.SaveManager.setStageProgress(state.stageProgress);
      }
      state.isBossPhase = false;
      state.bossMaxHp = state.stageConfig.bossHp || 9;
      state.bossCurrentHp = state.bossMaxHp;

      state.maxHp = getMaxHp();
      state.hp = state.maxHp;
      state.maxPauseChances = (window.GameConfig && window.GameConfig.MAX_PAUSE_CHANCES) ? window.GameConfig.MAX_PAUSE_CHANCES : 2;
      state.pauseChancesRemaining = state.maxPauseChances;
      state.combo = 0;
      state.speedMultiplier = typeof saveState.speedMultiplier === 'number' ? saveState.speedMultiplier : 1.0;
      state.speed = state.stageConfig.baseSpeed || 36;
      state.currentLane = 1;
      state.isPlaying = true;
      state.isPaused = false;
      state.isGameOver = false;
      state.isObbyMode = false;
      state.obbyWavesCleared = 0;

      if (window.UIManager) {
        window.UIManager.setStartScreenVisible(false);
        window.UIManager.hideGameOverModal();
        window.UIManager.hideReviewModal();
        window.UIManager.setPauseModalVisible(false, state.pauseChancesRemaining, state.maxPauseChances);
        window.UIManager.hideBossHUD();
        if (typeof window.UIManager.hideObbyHUD === 'function') {
          window.UIManager.hideObbyHUD();
        }
        window.UIManager.hideStageClearBanner();
        window.UIManager.updateActiveLane(1);
        if (typeof window.UIManager.pushRobloxChat === 'function') {
          window.UIManager.pushRobloxChat(
            '시스템',
            `👑 VIP 이소윤 님이 [${state.stageConfig.title}] 월드에 접속했습니다!`,
            'system'
          );
        }
      }

      if (window.Engine3D) {
        if (typeof window.Engine3D.setDemoMode === 'function') {
          window.Engine3D.setDemoMode(false);
        }
        window.Engine3D.clearActiveGates();
        if (typeof window.Engine3D.clearObbyObstacles === 'function') {
          window.Engine3D.clearObbyObstacles();
        }
        window.Engine3D.hideBoss();
        window.Engine3D.setStageTheme(state.stageConfig);
        window.Engine3D.setSpeed(getEffectiveSpeed());
        window.Engine3D.setLane(1);
        window.Engine3D.start();
        window.Engine3D.setPaused(false);
      }

      if (window.SoundEngine) {
        window.SoundEngine.setSpeedTempo(getEffectiveSpeed());
        window.SoundEngine.startBGM(state.stage, false);
      }

      this.spawnNextQuestion();
      syncHUD();
      return this;
    },

    /**
     * Retries the current stage immediately after HP depletion without resetting stage or cumulative stats!
     */
    retryCurrentStage: function () {
      const saveState = window.SaveManager ? window.SaveManager.getState() : { currentStage: state.stage };
      const retryStage = Math.max(1, parseInt(state.stage || saveState.currentStage, 10) || 1);
      return this.startGame(retryStage);
    },

    /**
     * Generates the next question from QuestionEngine and spawns its 3-lane gate in Engine3D.
     */
    spawnNextQuestion: function () {
      const saveState = window.SaveManager ? window.SaveManager.getState() : { subjectMode: 'mixed' };
      const mode = saveState.subjectMode || 'mixed';

      const question = (window.QuestionEngine && typeof window.QuestionEngine.nextQuestion === 'function')
        ? window.QuestionEngine.nextQuestion(state.stage, mode)
        : {
            id: 'fallback_math_25_17',
            category: 'math',
            categoryLabel: '초등 수학 · 두 자리 덧셈',
            prompt: '🧮 25 + 17 = ?',
            subPrompt: '두 자리 연산의 정답 게이트로 차선을 변경하세요!',
            choices: ['32', '42', '52'],
            correctLane: 1,
            answerText: '42',
            isReview: false
          };

      state.currentQuestion = question;

      if (window.Engine3D && typeof window.Engine3D.spawnQuestionGate === 'function') {
        window.Engine3D.clearActiveGates();
        window.Engine3D.spawnQuestionGate(question);
      }

      if (window.UIManager) {
        window.UIManager.showQuestion(question, state.isBossPhase, state.currentLane);
        if (typeof window.UIManager.pushRobloxChat === 'function') {
          const pet = getActivePet();
          if (question.isSpeech) {
            window.UIManager.pushRobloxChat(
              pet.cheerTag || '유니콘펫',
              `🎙️ 소윤아! 마이크가 켜졌어! 레인 상관없이 영어로 "${(question.targetWord || '').toUpperCase()}" [${question.targetPron || ''}] 라고 크게 말하면 바로 통과야!`,
              'pet'
            );
          } else if (question.isReview) {
            window.UIManager.pushRobloxChat(
              pet.cheerTag || '유니콘펫',
              '🔥 소윤아! 아까 아쉽게 틀렸던 복습 문제야! 이번엔 꼭 부숴버리자!',
              'pet'
            );
          } else {
            window.UIManager.pushRobloxChat(
              pet.cheerTag || '유니콘펫',
              '소윤아 이번 문제 정답은 어디일까?! 블록 게이트로 돌진하자!',
              'pet'
            );
          }
        }
      }

      if (question && question.isSpeech) {
        startSpeechListening(question);
      } else {
        stopSpeechListening();
      }

      syncHUD();
      return question;
    },

    /**
     * Transitions the current stage into Boss Battle Phase when questionsToBoss is reached.
     * Boosts speed by 1.5x and activates dynamic Boss Battle mode!
     */
    enterBossPhase: function () {
      state.isBossPhase = true;
      state.bossMaxHp = (state.stageConfig && state.stageConfig.bossHp) ? state.stageConfig.bossHp : 9;
      state.bossCurrentHp = state.bossMaxHp;

      // Grant +1 bonus HP on reaching the Boss!
      state.hp = Math.min(state.maxHp, state.hp + 1);

      const isJackpotBoss = (state.stage % 10 === 0);

      if (window.SoundEngine) {
        window.SoundEngine.playBossWarning();
        window.SoundEngine.setSpeedTempo(getEffectiveSpeed());
        window.SoundEngine.startBGM(state.stage, true);
      }

      if (window.Engine3D) {
        window.Engine3D.setSpeed(getEffectiveSpeed());
        if (typeof window.Engine3D.spawnBoss === 'function') {
          window.Engine3D.spawnBoss(state.stageConfig);
        }
      }

      if (window.UIManager) {
        window.UIManager.showBossHUD(state.stageConfig, state.bossCurrentHp, state.bossMaxHp);
        const toastMsg = isJackpotBoss
          ? `💴🚨 [만원 상금 보스 출현!] 속도 1.5배 폭주! ${state.stage}판 보스를 물리치면 [상금 10,000원] + 상금 게이지 +10 획득!!`
          : `👾 경고! ${state.stageConfig.bossName} 출현! (속도 1.5배 다이나믹 배틀!) 문제를 풀어 초대형 폭탄(💣)을 보스에게 발사하자!`;
        window.UIManager.showFeedbackToast(true, toastMsg);
        if (typeof window.UIManager.pushRobloxChat === 'function') {
          window.UIManager.pushRobloxChat(
            '로블록스TV',
            isJackpotBoss
              ? `💴 대박 찬스!! ${state.stage}판째 [만원(10,000원) 상금 보스] 출현! 폭탄을 명중시켜 만원을 획득하세요!!`
              : `🚨 긴급속보! 보스 [${state.stageConfig.bossName}] 출현! 속도 1.5배 부스트 가동!!`,
            'tv'
          );
        }
      }

      syncHUD();
      this.spawnNextQuestion();
    },

    /**
     * Handles the player car passing through a 3-lane answer gate.
     * @param {number} selectedLane
     * @param {Object} questionData
     * @param {boolean} [isCorrectOverride]
     */
    handleGatePass: function (selectedLane, questionData, isCorrectOverride) {
      if (!state.isPlaying || state.isGameOver) return;
      stopSpeechListening();

      const lane = typeof selectedLane === 'number'
        ? selectedLane
        : (window.Engine3D ? window.Engine3D.getCurrentLane() : state.currentLane);

      const q = questionData || state.currentQuestion || (window.QuestionEngine ? window.QuestionEngine.getCurrentQuestion() : null);
      if (!q) return;

      const isCorrect = typeof isCorrectOverride === 'boolean'
        ? isCorrectOverride
        : (q.isSpeech ? Boolean(q.speechPassed) : (lane === q.correctLane));

      // Record answer & update cumulative SaveManager + wrongAnswerQueue
      const beforeSolved = (window.SaveManager && window.SaveManager.getState())
        ? window.SaveManager.getState().totalSolved
        : 0;
      const beforeCorrect = (window.SaveManager && window.SaveManager.getState())
        ? (window.SaveManager.getState().totalCorrect || 0)
        : 0;
      const beforeBosses = (window.SaveManager && window.SaveManager.getState())
        ? (window.SaveManager.getState().bossesDefeated || 0)
        : 0;

      if (window.QuestionEngine && typeof window.QuestionEngine.recordResult === 'function') {
        window.QuestionEngine.recordResult(q, lane);
      }

      const afterSolved = (window.SaveManager && window.SaveManager.getState())
        ? window.SaveManager.getState().totalSolved
        : 0;

      if (afterSolved === beforeSolved && window.SaveManager && typeof window.SaveManager.recordAnswer === 'function') {
        const chosenText = (Array.isArray(q.choices) && q.choices[lane] !== undefined)
          ? q.choices[lane]
          : lane;
        window.SaveManager.recordAnswer(q, chosenText, isCorrect);
      }

      const afterCorrect = (window.SaveManager && window.SaveManager.getState())
        ? (window.SaveManager.getState().totalCorrect || 0)
        : beforeCorrect;

      if (isCorrect) {
        state.combo += 1;

        // Increase speed gently, strictly capped so solving time never drops below 6.47s (2x old time)
        const speedInc = (window.GameConfig && window.GameConfig.SPEED_INCREMENT_PER_CORRECT)
          ? window.GameConfig.SPEED_INCREMENT_PER_CORRECT
          : 0.5;
        const maxSpeedCap = (window.GameConfig && window.GameConfig.MAX_SPEED_CAP)
          ? window.GameConfig.MAX_SPEED_CAP
          : 53;
        state.speed = Math.min(maxSpeedCap, state.speed + speedInc);

        if (window.Engine3D) {
          window.Engine3D.setSpeed(getEffectiveSpeed());
        }
        if (window.SoundEngine) {
          window.SoundEngine.setSpeedTempo(getEffectiveSpeed());
        }

        // Calculate score earned
        const basePts = (window.GameConfig && window.GameConfig.SCORE_PER_CORRECT) ? window.GameConfig.SCORE_PER_CORRECT : 100;
        const comboBonus = Math.min(10, state.combo - 1) * ((window.GameConfig && window.GameConfig.SCORE_COMBO_BONUS) ? window.GameConfig.SCORE_COMBO_BONUS : 25);
        const reviewBonus = q.isReview ? ((window.GameConfig && window.GameConfig.SCORE_REVIEW_BONUS) ? window.GameConfig.SCORE_REVIEW_BONUS : 60) : 0;
        const bossHitBonus = state.isBossPhase ? 50 : 0;
        const pointsEarned = basePts + comboBonus + reviewBonus + bossHitBonus;

        const prevPet = getActivePet();
        if (window.SaveManager) {
          window.SaveManager.addScore(pointsEarned, state.speed);
        }
        const newPet = getActivePet();

        // Check if Soyun unlocked a new Roblox Pet!
        if (newPet && prevPet && newPet.level > prevPet.level && window.UIManager && typeof window.UIManager.pushRobloxChat === 'function') {
          window.UIManager.pushRobloxChat(
            '시스템',
            `🎉 축하합니다 이소윤 님! 새로운 펫 [${newPet.name}] 진화 완료!!`,
            'system'
          );
        }

        // Check if Soyun achieved a Real-Life Reward Gauge Milestone (용돈 5,000원 or 애슐리)!
        if (window.GameConfig && typeof window.GameConfig.getRewardStatus === 'function') {
          const prevRew = window.GameConfig.getRewardStatus(beforeCorrect, beforeBosses);
          const nextRew = window.GameConfig.getRewardStatus(afterCorrect, beforeBosses);
          if (nextRew.pocketMoney.earnedCount > prevRew.pocketMoney.earnedCount) {
            if (window.SoundEngine) window.SoundEngine.playStageClear();
            if (window.UIManager) {
              window.UIManager.triggerImpactEffect('stageClear', { points: 5000, combo: state.combo });
              window.UIManager.showFeedbackToast(
                true,
                `💵🎊 대박!! 이소윤 선수 [용돈 5,000원] 게이지 100% 달성!! (${nextRew.pocketMoney.earnedCount}회째 달성!)`
              );
              if (typeof window.UIManager.pushRobloxChat === 'function') {
                window.UIManager.pushRobloxChat(
                  '시스템',
                  `💵🎊 축하합니다!! 이소윤 선수 [용돈 5,000원] 상품 게이지 100% 달성!!`,
                  'system'
                );
              }
            }
          }
          if (nextRew.ashley.earnedCount > prevRew.ashley.earnedCount) {
            if (window.SoundEngine) window.SoundEngine.playStageClear();
            if (window.UIManager) {
              window.UIManager.triggerImpactEffect('stageClear', { points: 10000, combo: state.combo });
              window.UIManager.showFeedbackToast(
                true,
                `🍓🏆 전설 달성!! 이소윤 선수 누적 1,000점 돌파! [애슐리 외식 상품] 100% 달성!!`
              );
              if (typeof window.UIManager.pushRobloxChat === 'function') {
                window.UIManager.pushRobloxChat(
                  '시스템',
                  `🍓🏆 대박!! 이소윤 선수 [애슐리 외식 상품] 게이지 100% 달성!!`,
                  'system'
                );
              }
            }
          }
        }

        if (state.isBossPhase) {
          // Boss Battle Phase: Launch 3D Super Bomb at Boss & reduce Boss HP
          state.bossCurrentHp = Math.max(0, state.bossCurrentHp - 1);
          const hpRatio = state.bossCurrentHp / Math.max(1, state.bossMaxHp);

          if (window.SoundEngine) {
            window.SoundEngine.playLaserShot();
            window.SoundEngine.playBossHit();
          }
          if (window.Engine3D) {
            window.Engine3D.damageBoss(hpRatio);
          }
          if (window.UIManager) {
            window.UIManager.updateBossHUD(state.bossCurrentHp, state.bossMaxHp);
            if (typeof window.UIManager.triggerImpactEffect === 'function') {
              window.UIManager.triggerImpactEffect('boss', { points: pointsEarned, combo: state.combo });
            }
          }

          if (state.bossCurrentHp <= 0) {
            this.handleBossDefeated(pointsEarned);
            return;
          } else {
            if (window.UIManager) {
              window.UIManager.showFeedbackToast(
                true,
                `💣🚀 초대형 폭탄 발사 & 보스 명중!! BOOM!! (+${pointsEarned} R$ · 보스 HP ${state.bossCurrentHp}/${state.bossMaxHp})`
              );
              if (typeof window.UIManager.pushRobloxChat === 'function') {
                window.UIManager.pushRobloxChat(
                  '로블록스TV',
                  `💣 BOOM!! 이소윤 선수의 특대형 폭탄이 날아가 보스에게 정확히 박혔습니다!!`,
                  'tv'
                );
              }
            }
            syncHUD();
            this.spawnNextQuestion();
          }
        } else {
          // Normal Stage Question Phase
          if (window.SoundEngine) {
            window.SoundEngine.playCorrect(state.combo);
          }

          state.stageProgress += 1;
          if (window.SaveManager && typeof window.SaveManager.setStageProgress === 'function') {
            window.SaveManager.setStageProgress(state.stageProgress);
          }

          const reviewTag = q.isReview ? ' [복습 마스터 완료!]' : '';
          const correctCheers = [
            `💥 우와! 이소윤 천재!! 블록 격파 성공! (+${pointsEarned} R$ 획득!)${reviewTag}`,
            `⚡ 소윤이 나이스!! 연속 ${state.combo}콤보 폭주 중! (+${pointsEarned} R$)${reviewTag}`,
            `🦄 소윤이와 큐브펫의 합동 필살기 발사!! (+${pointsEarned} R$)${reviewTag}`
          ];
          const chosenCheer = state.combo >= 2
            ? correctCheers[state.combo % correctCheers.length]
            : correctCheers[0];

          if (window.UIManager) {
            if (typeof window.UIManager.triggerImpactEffect === 'function') {
              window.UIManager.triggerImpactEffect('correct', { points: pointsEarned, combo: state.combo });
            }
            window.UIManager.showFeedbackToast(true, chosenCheer);
            if (typeof window.UIManager.pushRobloxChat === 'function') {
              window.UIManager.pushRobloxChat(
                '로블록스TV',
                `대박! 이소윤 선수 연속 정답으로 블럭 게이트 박살!! (+${pointsEarned} R$)`,
                'tv'
              );
            }
          }

          const questionsToBoss = (state.stageConfig && state.stageConfig.questionsToBoss)
            ? state.stageConfig.questionsToBoss
            : 15;

          if (state.stageProgress >= questionsToBoss) {
            this.enterBossPhase();
          } else if (state.stageProgress > 0 && state.stageProgress % 3 === 0) {
            // Every 3 normal solved questions, launch the 2x Speed Roblox Obby Action Mini-Game!
            syncHUD();
            this.startObbyMinigame();
          } else {
            syncHUD();
            this.spawnNextQuestion();
          }
        }
      } else {
        // WRONG Answer
        state.combo = 0;
        state.hp = Math.max(0, state.hp - 1);

        if (window.SoundEngine) {
          window.SoundEngine.playWrong();
        }
        if (window.UIManager) {
          window.UIManager.triggerDamageFlash();
          if (typeof window.UIManager.triggerImpactEffect === 'function') {
            window.UIManager.triggerImpactEffect('wrong', { combo: 0 });
          }
          window.UIManager.showFeedbackToast(
            false,
            `💪 아차! 괜찮아 소윤아! 정답은 [ ${q.answerText} ] 이었어! 잠시 후 복습할 때 꼭 부숴버리자!`
          );
          if (typeof window.UIManager.pushRobloxChat === 'function') {
            const pet = getActivePet();
            window.UIManager.pushRobloxChat(
              pet.cheerTag || '유니콘펫',
              `괜찮아 소윤아! 정답은 [${q.answerText}] 이었어! 이따 복습 게이트에서 꼭 격파하자!`,
              'pet'
            );
          }
        }

        syncHUD();

        if (state.hp <= 0) {
          this.handleGameOver();
        } else {
          this.spawnNextQuestion();
        }
      }
    },

    /**
     * Handles Boss defeat:
     * - Advances cumulative stage in SaveManager (+1 bossesDefeated = +10 Reward Gauge Bonus!)
     * - Awards 10,000원 (만원) Jackpot Prize on every 10th Stage Boss!
     * - Recovers +2 HP up to MAX_HP (3), restores normal stage speed, and transitions to next stage.
     * @param {number} [lastShotPoints]
     */
    handleBossDefeated: function (lastShotPoints) {
      const clearedStage = state.stage;
      const isTenStageJackpot = (clearedStage % 10 === 0);
      const bossClearBonus = (window.GameConfig && window.GameConfig.SCORE_BOSS_CLEAR)
        ? window.GameConfig.SCORE_BOSS_CLEAR
        : 500;

      const beforeSave = window.SaveManager ? window.SaveManager.getState() : {};
      const beforeCorrect = beforeSave.totalCorrect || 0;
      const beforeBosses = beforeSave.bossesDefeated || 0;
      const beforeMaxStg = beforeSave.maxStageReached || 1;

      if (window.SaveManager) {
        window.SaveManager.addScore(bossClearBonus, state.speed);
      }

      // Immediately advance and persist currentStage + 1 & bossesDefeated + 1 in SaveManager!
      const nextStage = (window.SaveManager && typeof window.SaveManager.advanceStage === 'function')
        ? window.SaveManager.advanceStage()
        : (clearedStage + 1);

      const afterSave = window.SaveManager ? window.SaveManager.getState() : {};
      const afterBosses = afterSave.bossesDefeated || (beforeBosses + 1);
      const afterMaxStg = afterSave.maxStageReached || nextStage;

      // Check if the +10 Boss Defeat Gauge Bonus triggered a Reward Milestone (5,000원 / 애슐리 / 10판 보스 만원)!
      if (window.GameConfig && typeof window.GameConfig.getRewardStatus === 'function') {
        const prevRew = window.GameConfig.getRewardStatus(beforeCorrect, beforeBosses, beforeMaxStg);
        const nextRew = window.GameConfig.getRewardStatus(beforeCorrect, afterBosses, afterMaxStg);

        if (nextRew.pocketMoney.earnedCount > prevRew.pocketMoney.earnedCount && window.UIManager) {
          window.UIManager.pushRobloxChat(
            '시스템',
            `💵🎊 보스 격파 +10 게이지 보너스로 [용돈 5,000원] 상품 게이지 100% 달성!! (${nextRew.pocketMoney.earnedCount}회째!)`,
            'system'
          );
        }
        if (nextRew.ashley.earnedCount > prevRew.ashley.earnedCount && window.UIManager) {
          window.UIManager.pushRobloxChat(
            '시스템',
            `🍓🏆 보스 격파 +10 게이지 보너스로 [애슐리 외식권] 게이지 100% 달성!!`,
            'system'
          );
        }
      }

      const nextStageCfg = getStageCfg(nextStage);

      // Recover +2 HP up to MAX_HP (5) & recharge 2 pause chances for the new stage!
      state.hp = Math.min(state.maxHp, state.hp + 2);
      state.pauseChancesRemaining = state.maxPauseChances || 2;

      // Transition state to next stage immediately so state & HUD reflect the new stage
      state.stage = nextStage;
      state.selectedDashboardStage = nextStage;
      state.stageConfig = nextStageCfg;
      state.stageProgress = 0;
      state.isBossPhase = false;
      state.bossMaxHp = nextStageCfg.bossHp || 12;
      state.bossCurrentHp = state.bossMaxHp;

      const stageSpeedBonus = (window.GameConfig && window.GameConfig.SPEED_STAGE_BONUS)
        ? window.GameConfig.SPEED_STAGE_BONUS
        : 2;
      const maxSpeedCap = (window.GameConfig && window.GameConfig.MAX_SPEED_CAP)
        ? window.GameConfig.MAX_SPEED_CAP
        : 53;
      state.speed = Math.min(maxSpeedCap, Math.max(state.speed + stageSpeedBonus, nextStageCfg.baseSpeed || 38));

      if (window.SoundEngine) {
        window.SoundEngine.playBossDefeat();
        window.SoundEngine.playStageClear();
        window.SoundEngine.setSpeedTempo(getEffectiveSpeed());
        window.SoundEngine.startBGM(nextStage, false);
      }

      if (window.Engine3D) {
        window.Engine3D.triggerStageClearEffect();
        window.Engine3D.defeatBoss();
        window.Engine3D.setStageTheme(nextStageCfg);
        window.Engine3D.setSpeed(getEffectiveSpeed());
      }

      if (window.UIManager) {
        window.UIManager.hideBossHUD();
        if (typeof window.UIManager.triggerImpactEffect === 'function') {
          window.UIManager.triggerImpactEffect('stageClear', {
            points: isTenStageJackpot ? 10000 : bossClearBonus,
            combo: state.combo,
            isJackpot: isTenStageJackpot
          });
        }
        window.UIManager.showStageClearBanner(clearedStage, nextStageCfg);
        const jpName = (window.SaveManager && window.SaveManager.getState().bonusNameJackpot) || '10판 보스 만원 상금';
        const clearToast = isTenStageJackpot
          ? `💴🎊 대박!! ${clearedStage}판째 보스 격파!! [${jpName}] 보너스 달성 + 상금 게이지 +10 상승!!`
          : `🏆 보스 격파 성공!! 상금 게이지 +10 대폭 상승! STAGE ${nextStage} 월드로 승급! (+${bossClearBonus} R$)`;
        window.UIManager.showFeedbackToast(true, clearToast);
        if (typeof window.UIManager.pushRobloxChat === 'function') {
          window.UIManager.pushRobloxChat(
            '시스템',
            isTenStageJackpot
              ? `💴🎊 축하합니다!! 이소윤 선수 ${clearedStage}판째 보스 클리어! [${jpName}] 보너스 달성 및 상금 게이지 +10 상승!!`
              : `🏆 대박!! 보스 격파 보상으로 [상금 게이지 +10] 상승! 다음 월드(STAGE ${nextStage})로 승급했어요!`,
            'system'
          );
        }
      }

      syncHUD();
      this.spawnNextQuestion();
    },

    /**
     * Handles HP reaching 0.
     * NEVER resets currentStage to 1! Preserves all cumulative records and offers instant stage retry.
     */
    handleGameOver: function () {
      state.isPlaying = false;
      state.isGameOver = true;

      if (window.Engine3D) {
        window.Engine3D.setPaused(true);
        window.Engine3D.clearActiveGates();
      }

      if (window.SoundEngine) {
        window.SoundEngine.stopBGM();
        window.SoundEngine.playGameOver();
      }

      // Ensure currentStage in SaveManager remains at state.stage (never reset to 1!)
      const saveState = window.SaveManager ? window.SaveManager.getState() : { currentStage: state.stage };
      if (window.SaveManager && saveState.currentStage < state.stage) {
        window.SaveManager.setStage(state.stage);
      }

      if (window.UIManager) {
        window.UIManager.showGameOverModal(window.SaveManager ? window.SaveManager.getState() : saveState, state.stage);
      }
    },

    /**
     * Selects a lane (0 = Left, 1 = Center, 2 = Right)
     * @param {number} laneIndex
     */
    selectLane: function (laneIndex) {
      const clamped = Math.max(0, Math.min(2, Math.round(Number(laneIndex) || 0)));
      if (clamped !== state.currentLane && window.SoundEngine) {
        window.SoundEngine.playLaneSwitch();
      }
      state.currentLane = clamped;
      if (window.Engine3D) {
        window.Engine3D.setLane(clamped);
      }
      if (window.UIManager) {
        window.UIManager.updateActiveLane(clamped);
      }
      return state.currentLane;
    },

    moveLeft: function () {
      return this.selectLane(state.currentLane - 1);
    },

    moveRight: function () {
      return this.selectLane(state.currentLane + 1);
    },

    /**
     * Triggers 3D Roblox Obby Jump (`Engine3D.jump()`) over low red lava hurdles!
     */
    triggerJump: function () {
      if (!state.isPlaying || state.isGameOver || state.isPaused) return false;
      if (window.Engine3D && typeof window.Engine3D.jump === 'function') {
        const jumped = window.Engine3D.jump();
        if (jumped && window.SoundEngine) {
          if (typeof window.SoundEngine.playJump === 'function') {
            window.SoundEngine.playJump();
          } else {
            window.SoundEngine.playLaneSwitch();
          }
        }
        return jumped;
      }
      return false;
    },

    /**
     * Starts the 2x Speed Roblox Obby Action Mini-Game between quiz sets!
     * Spawns 7 waves of 3-lane obstacles (tall spike blocks to dodge left/right, low red lava hurdles to JUMP over, and Robux boost rings).
     */
    startObbyMinigame: function () {
      if (!state.isPlaying || state.isGameOver) return false;
      if (state.isObbyMode) return true;

      state.isObbyMode = true;
      state.obbyWavesTotal = 7;
      state.obbyWavesCleared = 0;

      if (window.Engine3D) {
        if (typeof window.Engine3D.setDemoMode === 'function') {
          window.Engine3D.setDemoMode(false);
        }
        window.Engine3D.clearActiveGates();
        if (typeof window.Engine3D.clearObbyObstacles === 'function') {
          window.Engine3D.clearObbyObstacles();
        }
        window.Engine3D.setSpeed(getEffectiveSpeed());

        // Spawn 7 dynamic Roblox Obby obstacle waves across Lanes 1, 2, 3
        const patterns = [
          ['block', 'hurdle', 'coin'],
          ['hurdle', 'block', 'coin'],
          ['coin', 'hurdle', 'block'],
          ['block', 'coin', 'hurdle'],
          ['hurdle', 'coin', 'block'],
          ['coin', 'block', 'hurdle'],
          ['hurdle', 'hurdle', 'coin']
        ];

        for (let w = 0; w < state.obbyWavesTotal; w++) {
          const basePat = patterns[(w + state.stage) % patterns.length].slice();
          // Lightly shuffle while keeping at least 1 hurdle and 1 coin/safe path
          if ((w + state.stageProgress) % 2 === 1) {
            basePat.reverse();
          }
          if (typeof window.Engine3D.spawnObbyObstacleWave === 'function') {
            window.Engine3D.spawnObbyObstacleWave({
              z: -56 - w * 28,
              lanes: basePat
            });
          }
        }
      }

      if (window.SoundEngine) {
        window.SoundEngine.setSpeedTempo(getEffectiveSpeed());
        window.SoundEngine.playStageClear();
      }

      if (window.UIManager) {
        if (typeof window.UIManager.showObbyHUD === 'function') {
          window.UIManager.showObbyHUD(0, state.obbyWavesTotal);
        }
        window.UIManager.showFeedbackToast(
          true,
          '⚡ 로블록스 오비 2배속 액션 미니게임 시작!! 🧱가시벽은 좌우 피하기(◀▶), 🔥빨간 용암은 점프(⬆️ / 스페이스바)!'
        );
        if (typeof window.UIManager.pushRobloxChat === 'function') {
          window.UIManager.pushRobloxChat(
            '시스템',
            '🎮 [미니게임] 2배속 로블록스 오비 액션 코스 진입! 점프와 차선 이동으로 돌파하세요!',
            'system'
          );
        }
      }

      syncHUD();
      return true;
    },

    /**
     * Handles passing a single 3-lane obstacle wave during the Roblox Obby Mini-Game.
     * @param {Object} res { lane, laneType, isAirborne, outcome }
     */
    handleObbyWavePass: function (res) {
      if (!state.isPlaying || !state.isObbyMode) return;

      state.obbyWavesCleared += 1;
      const outcome = res ? res.outcome : 'coin';

      if (outcome === 'jump_clear' || outcome === 'coin') {
        const bonusPts = outcome === 'jump_clear' ? 80 : 60;
        if (window.SoundEngine) {
          window.SoundEngine.playCorrect(state.combo + 1);
        }
        if (window.SaveManager) {
          window.SaveManager.addScore(bonusPts, getEffectiveSpeed());
        }
        if (outcome === 'jump_clear' && window.UIManager) {
          window.UIManager.showFeedbackToast(
            true,
            `⬆️ 나이스 점프!! 용암 허들 돌파 & 공중 로벅스 링 획득! (+${bonusPts} R$)`
          );
        }
      } else {
        if (window.SoundEngine) {
          window.SoundEngine.playWrong();
        }
        if (window.UIManager) {
          window.UIManager.triggerDamageFlash();
          const msg = outcome === 'hit_hurdle'
            ? '🔥 앗! 빨간 용암 허들은 [⬆️ 점프!] 버튼이나 스페이스바로 뛰어넘으세요!'
            : '🧱 앗! 높은 가시 블록 벽은 옆 차선(◀ 1·2·3 ▶)으로 피하세요!';
          window.UIManager.showFeedbackToast(false, msg);
        }
      }

      if (window.UIManager && typeof window.UIManager.showObbyHUD === 'function') {
        window.UIManager.showObbyHUD(state.obbyWavesCleared, state.obbyWavesTotal);
      }
      syncHUD();

      if (state.obbyWavesCleared >= state.obbyWavesTotal) {
        this.endObbyMinigame();
      }
    },

    /**
     * Ends the 2x Speed Roblox Obby Mini-Game, restores 1x quiz speed, awards bonus Robux,
     * and seamlessly resumes quiz mode (`spawnNextQuestion()`).
     */
    endObbyMinigame: function () {
      if (!state.isObbyMode) return;
      state.isObbyMode = false;
      state.obbyWavesCleared = 0;

      const clearBonus = 200;
      if (window.SaveManager) {
        window.SaveManager.addScore(clearBonus, getEffectiveSpeed());
      }

      if (window.Engine3D) {
        if (typeof window.Engine3D.clearObbyObstacles === 'function') {
          window.Engine3D.clearObbyObstacles();
        }
        window.Engine3D.setSpeed(getEffectiveSpeed());
      }

      if (window.SoundEngine) {
        window.SoundEngine.setSpeedTempo(getEffectiveSpeed());
        window.SoundEngine.playStageClear();
      }

      if (window.UIManager) {
        if (typeof window.UIManager.hideObbyHUD === 'function') {
          window.UIManager.hideObbyHUD();
        }
        if (typeof window.UIManager.triggerImpactEffect === 'function') {
          window.UIManager.triggerImpactEffect('correct', { points: clearBonus, combo: state.combo });
        }
        window.UIManager.showFeedbackToast(
          true,
          `🏁 오비 미니게임 완주 성공!! 보너스 +${clearBonus} R$ 획득! 다시 문제 풀기로 돌아갑니다!`
        );
        if (typeof window.UIManager.pushRobloxChat === 'function') {
          window.UIManager.pushRobloxChat(
            '로블록스TV',
            `🎉 이소윤 선수 2배속 오비 액션 코스 완벽 돌파!! (+${clearBonus} R$)`,
            'tv'
          );
        }
      }

      syncHUD();
      if (state.isPlaying && !state.isGameOver) {
        this.spawnNextQuestion();
      }
    },

    /**
     * Sets mobile/screen orientation optimization mode ('auto' | 'portrait' | 'landscape').
     * @param {string} mode
     */
    setOrientationMode: function (mode) {
      const m = (mode === 'portrait' || mode === 'landscape') ? mode : 'auto';
      state.orientationMode = m;
      try {
        window.localStorage.setItem('soyun_view_orientation_mode', m);
      } catch (e) {}

      if (window.Engine3D && typeof window.Engine3D.setViewOrientationMode === 'function') {
        window.Engine3D.setViewOrientationMode(m);
      }
      if (window.UIManager && typeof window.UIManager.updateOrientationUI === 'function') {
        window.UIManager.updateOrientationUI(m);
        const label = m === 'portrait' ? '📱 세로보기 최적화' : (m === 'landscape' ? '📺 가로보기 최적화' : '🔄 자동 화면 감지');
        window.UIManager.showFeedbackToast(true, `화면 보기 모드 변경: ${label}`);
      }
      return m;
    },

    /**
     * Cycles through orientation modes: 'auto' -> 'portrait' -> 'landscape' -> 'auto'
     */
    cycleOrientationMode: function () {
      if (window.SoundEngine) {
        window.SoundEngine.playClick();
      }
      const order = ['auto', 'portrait', 'landscape'];
      const idx = order.indexOf(state.orientationMode);
      const next = order[(idx + 1) % order.length];
      return this.setOrientationMode(next);
    },

    /**
     * Changes the subject mode ('mixed' | 'math' | 'english') and saves it.
     * @param {string} mode
     */
    setSubjectMode: function (mode) {
      if (window.SaveManager) {
        window.SaveManager.setSubjectMode(mode);
        if (window.UIManager) {
          window.UIManager.renderDashboard(window.SaveManager.getState(), state.selectedDashboardStage);
        }
      }
    },

    /**
     * Sets user speed multiplier (0.4x ~ 2.0x) and updates 3D engine & HUD immediately.
     * @param {number} mult
     */
    setSpeedMultiplier: function (mult) {
      const clamped = Math.max(0.4, Math.min(2.0, Math.round((Number(mult) || 1.0) * 100) / 100));
      state.speedMultiplier = clamped;
      if (window.SaveManager && typeof window.SaveManager.setSpeedMultiplier === 'function') {
        window.SaveManager.setSpeedMultiplier(clamped);
      }
      if (window.Engine3D) {
        window.Engine3D.setSpeed(getEffectiveSpeed());
      }
      if (window.SoundEngine) {
        window.SoundEngine.setSpeedTempo(getEffectiveSpeed());
      }
      if (window.UIManager) {
        if (window.SaveManager) {
          window.UIManager.renderDashboard(window.SaveManager.getState(), state.selectedDashboardStage);
        }
        window.UIManager.showFeedbackToast(
          true,
          `⚡ 소윤이 카트 속도 조절: ${clamped.toFixed(1)}x 배속 (${getEffectiveSpeed()} KM/H)`
        );
      }
      syncHUD();
      return state.speedMultiplier;
    },

    /**
     * Adjusts speed multiplier up or down by delta (e.g. -0.2 or +0.2)
     * @param {number} delta
     */
    adjustSpeed: function (delta) {
      if (window.SoundEngine) {
        window.SoundEngine.playClick();
      }
      const nextMult = Math.round(((state.speedMultiplier || 1.0) + (Number(delta) || 0)) * 10) / 10;
      return this.setSpeedMultiplier(nextMult);
    },

    /**
     * Opens the Cumulative Wrong Answer Review Notebook Modal.
     */
    openReviewModal: function () {
      if (window.SoundEngine) {
        window.SoundEngine.playClick();
      }
      state.wasPlayingBeforeModal = Boolean(state.isPlaying && !state.isPaused);
      if (state.wasPlayingBeforeModal && window.Engine3D) {
        window.Engine3D.setPaused(true);
      }
      if (window.UIManager) {
        const saveState = window.SaveManager ? window.SaveManager.getState() : {};
        window.UIManager.showReviewModal(saveState);
      }
    },

    /**
     * Closes the Cumulative Wrong Answer Review Notebook Modal.
     */
    closeReviewModal: function () {
      if (window.SoundEngine) {
        window.SoundEngine.playClick();
      }
      if (window.UIManager) {
        window.UIManager.hideReviewModal();
      }
      if (state.wasPlayingBeforeModal && state.isPlaying && !state.isPaused && window.Engine3D) {
        window.Engine3D.setPaused(false);
      }
      state.wasPlayingBeforeModal = false;
    },

    /**
     * Opens the Parent Control Modal (#parent-modal) for Speed & Bonus Payout management.
     */
    openParentModal: function () {
      if (window.SoundEngine) {
        window.SoundEngine.playClick();
      }
      state.parentUnlocked = false;
      if (window.UIManager && typeof window.UIManager.showParentModal === 'function') {
        const saveState = window.SaveManager ? window.SaveManager.getState() : {};
        window.UIManager.showParentModal(saveState, false);
      }
    },

    closeParentModal: function () {
      if (window.SoundEngine) {
        window.SoundEngine.playClick();
      }
      if (window.UIManager && typeof window.UIManager.hideParentModal === 'function') {
        window.UIManager.hideParentModal();
      }
      if (window.UIManager && window.SaveManager) {
        window.UIManager.renderDashboard(window.SaveManager.getState(), state.selectedDashboardStage);
      }
      syncHUD();
    },

    /**
     * Marks 1 achieved bonus ('pocket' | 'ashley' | 'jackpot') as paid/completed and deletes it from unpaid count.
     * @param {string} bonusKey
     */
    markBonusPaid: function (bonusKey) {
      if (!window.SaveManager || typeof window.SaveManager.markBonusPaid !== 'function') return;
      if (window.SoundEngine) {
        window.SoundEngine.playStageClear();
      }
      const updated = window.SaveManager.markBonusPaid(bonusKey);
      if (window.UIManager) {
        window.UIManager.renderParentModal(updated);
        window.UIManager.renderDashboard(updated, state.selectedDashboardStage);
        window.UIManager.showFeedbackToast(
          true,
          '✅ [지급 완료 처리됨] 보너스가 지급 완료되어 달성 개수에서 삭제되었습니다!'
        );
      }
      syncHUD();
    },

    undoBonusPaid: function (bonusKey) {
      if (!window.SaveManager || typeof window.SaveManager.undoBonusPaid !== 'function') return;
      if (window.SoundEngine) {
        window.SoundEngine.playClick();
      }
      const updated = window.SaveManager.undoBonusPaid(bonusKey);
      if (window.UIManager) {
        window.UIManager.renderParentModal(updated);
        window.UIManager.renderDashboard(updated, state.selectedDashboardStage);
        window.UIManager.showFeedbackToast(
          true,
          '↩️ [지급 취소] 보너스 달성 개수가 다시 1개 복구되었습니다.'
        );
      }
      syncHUD();
    },

    setBonusName: function (bonusKey, newName) {
      if (!window.SaveManager || typeof window.SaveManager.setBonusName !== 'function') return;
      const cleaned = String(newName || '').trim();
      if (!cleaned) {
        window.alert('보너스 이름을 입력해 주세요.');
        return;
      }
      if (window.SoundEngine) {
        window.SoundEngine.playCorrect(1);
      }
      const updated = window.SaveManager.setBonusName(bonusKey, cleaned);
      if (window.UIManager) {
        window.UIManager.renderParentModal(updated);
        window.UIManager.renderDashboard(updated, state.selectedDashboardStage);
        window.UIManager.showFeedbackToast(true, `✏️ 보너스 명이 [${cleaned}](으)로 변경되었습니다!`);
      }
      syncHUD();
    },

    setBonusAchievedCount: function (bonusKey, targetCount) {
      if (!window.SaveManager || typeof window.SaveManager.setBonusAchievedCount !== 'function') return;
      const num = Math.max(0, Math.min(999, parseInt(targetCount, 10) || 0));
      if (window.SoundEngine) {
        window.SoundEngine.playCorrect(1);
      }
      const updated = window.SaveManager.setBonusAchievedCount(bonusKey, num);
      if (window.UIManager) {
        window.UIManager.renderParentModal(updated);
        window.UIManager.renderDashboard(updated, state.selectedDashboardStage);
        window.UIManager.showFeedbackToast(true, `🔢 보너스 달성횟수가 [${num}회]로 수정되었습니다!`);
      }
      syncHUD();
    },

    stepBonusAchievedCount: function (bonusKey, delta) {
      if (!window.SaveManager || !window.GameConfig) return;
      const s = window.SaveManager.getState();
      const rewards = window.GameConfig.getRewardStatus(s.totalCorrect, s.bossesDefeated, s.maxStageReached);
      let cur = 0;
      if (bonusKey === 'pocket') cur = rewards.pocketMoney.unpaidCount || 0;
      else if (bonusKey === 'ashley') cur = rewards.ashley.unpaidCount || 0;
      else if (bonusKey === 'jackpot') cur = rewards.bossJackpot.unpaidCount || 0;
      const next = Math.max(0, Math.min(999, cur + (parseInt(delta, 10) || 0)));
      this.setBonusAchievedCount(bonusKey, next);
    },

    /**
     * Toggles game pause state.
     */
    togglePause: function () {
      if (!state.isPlaying || state.isGameOver) return;
      if (state.isPaused) {
        this.resumeGame();
      } else {
        this.pauseGame();
      }
    },

    pauseGame: function () {
      if (!state.isPlaying || state.isGameOver) return false;
      if (state.isPaused) return true;

      // Enforce 2 pause chances limit ("일시정지 기회는 2번이야, 그걸 표현해줘야 해")
      if (state.pauseChancesRemaining <= 0) {
        if (window.SoundEngine) {
          window.SoundEngine.playClick();
        }
        if (window.UIManager) {
          window.UIManager.showFeedbackToast(
            false,
            '⚠️ 일시정지 기회(2번)를 모두 사용했어요! 다음 스테이지에서 다시 충전됩니다!'
          );
        }
        return false;
      }

      state.pauseChancesRemaining = Math.max(0, state.pauseChancesRemaining - 1);
      state.isPaused = true;
      stopSpeechListening();

      if (window.SoundEngine) {
        window.SoundEngine.playClick();
      }
      if (window.Engine3D) {
        window.Engine3D.setPaused(true);
        if (typeof window.Engine3D.renderSingleFrame === 'function') {
          window.Engine3D.renderSingleFrame();
        }
      }
      if (window.UIManager) {
        window.UIManager.setPauseModalVisible(true, state.pauseChancesRemaining, state.maxPauseChances);
        window.UIManager.showFeedbackToast(
          true,
          `⏸️ TIME FREEZE! 화면이 멈췄어요! 문제를 보고 천천히 풀어보세요 (남은 기회: ${state.pauseChancesRemaining}/${state.maxPauseChances})`
        );
      }
      syncHUD();
      return true;
    },

    resumeGame: function () {
      if (!state.isPlaying || state.isGameOver) return false;
      state.isPaused = false;
      if (window.SoundEngine) {
        window.SoundEngine.playClick();
      }
      if (window.UIManager) {
        window.UIManager.setPauseModalVisible(false, state.pauseChancesRemaining, state.maxPauseChances);
        window.UIManager.showFeedbackToast(
          true,
          '▶️ 다시 출발!! 정답 차선으로 멋지게 돌파하세요!'
        );
      }
      if (window.Engine3D) {
        window.Engine3D.setPaused(false);
      }
      if (state.currentQuestion && state.currentQuestion.isSpeech && !state.currentQuestion.speechPassed) {
        startSpeechListening(state.currentQuestion);
      }
      syncHUD();
      return true;
    },

    /**
     * Synchronizes runtime UI when SaveManager receives updated cumulative state from Neon PostgreSQL Cloud DB.
     */
    syncFromCloud: function (cloudState) {
      const s = cloudState || (window.SaveManager ? window.SaveManager.getState() : {});
      if (!state.isPlaying) {
        state.stage = Math.max(1, parseInt(s.currentStage, 10) || 1);
        state.selectedDashboardStage = state.stage;
        state.stageConfig = getStageCfg(state.stage);
        state.stageProgress = Math.max(0, parseInt(s.stageProgress, 10) || 0);
        if (window.UIManager) {
          window.UIManager.renderDashboard(s, state.selectedDashboardStage);
        }
      }
      syncHUD();
    },

    /**
     * Returns to the Title / Cumulative Progress Dashboard while preserving all progress.
     */
    returnToDashboard: function () {
      stopSpeechListening();
      state.isPlaying = false;
      state.isPaused = false;
      state.isGameOver = false;
      state.isObbyMode = false;
      state.obbyWavesCleared = 0;

      if (window.Engine3D) {
        window.Engine3D.clearActiveGates();
        if (typeof window.Engine3D.clearObbyObstacles === 'function') {
          window.Engine3D.clearObbyObstacles();
        }
        window.Engine3D.hideBoss();
        if (typeof window.Engine3D.setDemoMode === 'function') {
          window.Engine3D.setDemoMode(true);
        }
        window.Engine3D.setPaused(false);
      }

      if (window.SoundEngine) {
        window.SoundEngine.stopBGM();
      }

      const saveState = window.SaveManager ? window.SaveManager.getState() : { currentStage: 1 };
      state.selectedDashboardStage = Math.max(1, parseInt(saveState.currentStage, 10) || 1);

      if (window.UIManager) {
        window.UIManager.hideGameOverModal();
        window.UIManager.hideReviewModal();
        window.UIManager.setPauseModalVisible(false);
        window.UIManager.hideBossHUD();
        if (typeof window.UIManager.hideObbyHUD === 'function') {
          window.UIManager.hideObbyHUD();
        }
        window.UIManager.renderDashboard(saveState, state.selectedDashboardStage);
        window.UIManager.setStartScreenVisible(true);
      }
      syncHUD();
    },

    /**
     * Toggles sound mute/unmute state.
     */
    toggleSound: function () {
      if (!window.SoundEngine) return false;
      const isMuted = window.SoundEngine.toggleMute();
      if (window.UIManager) {
        window.UIManager.updateSoundButton(isMuted);
      }
      return isMuted;
    },

    /**
     * Explicitly resets all cumulative progress when confirmed by user.
     */
    resetAllProgress: function (skipConfirm) {
      if (!skipConfirm) {
        const ok = window.confirm('정말 모든 누적 점수, 스테이지 기록, 오답 노트를 초기화하시겠습니까?');
        if (!ok) return;
      }
      if (window.SaveManager) {
        const fresh = window.SaveManager.resetAllProgress();
        state.stage = 1;
        state.selectedDashboardStage = 1;
        state.stageConfig = getStageCfg(1);
        state.stageProgress = 0;
        if (window.UIManager) {
          window.UIManager.renderDashboard(fresh, 1);
        }
        syncHUD();
      }
    },

    /**
     * Helper method for automated testing & quick simulation:
     * Immediately resolves the active question gate on the specified lane (or correct/wrong lane).
     * @param {number|boolean} [laneOrCorrect]
     */
    passCurrentGate: function (laneOrCorrect) {
      if (!state.currentQuestion) return false;
      let targetLane = state.currentLane;
      if (typeof laneOrCorrect === 'number') {
        targetLane = Math.max(0, Math.min(2, laneOrCorrect));
      } else if (laneOrCorrect === true) {
        targetLane = state.currentQuestion.correctLane;
      } else if (laneOrCorrect === false) {
        targetLane = (state.currentQuestion.correctLane + 1) % 3;
      }

      this.selectLane(targetLane);
      if (window.Engine3D && typeof window.Engine3D.forcePassActiveGate === 'function') {
        const passed = window.Engine3D.forcePassActiveGate(targetLane);
        if (passed) return true;
      }
      this.handleGatePass(targetLane, state.currentQuestion, targetLane === state.currentQuestion.correctLane);
      return true;
    },

    /**
     * Returns complete runtime & cumulative state for inspection and automated tests.
     */
    getState: function () {
      const saveState = window.SaveManager ? window.SaveManager.getState() : {};
      const activePet = getActivePet();
      return {
        playerName: '이소윤',
        isPlaying: state.isPlaying,
        isPaused: state.isPaused,
        pauseChancesRemaining: state.pauseChancesRemaining,
        maxPauseChances: state.maxPauseChances,
        isGameOver: state.isGameOver,
        isBossPhase: state.isBossPhase,
        isObbyMode: state.isObbyMode,
        obbyWavesCleared: state.obbyWavesCleared,
        obbyWavesTotal: state.obbyWavesTotal,
        orientationMode: state.orientationMode,
        stage: state.stage,
        selectedDashboardStage: state.selectedDashboardStage,
        stageTitle: state.stageConfig ? state.stageConfig.title : '',
        stageProgress: state.stageProgress,
        questionsToBoss: state.stageConfig ? state.stageConfig.questionsToBoss : 15,
        hp: state.hp,
        maxHp: state.maxHp,
        speed: Math.round(state.speed),
        effectiveSpeed: getEffectiveSpeed(),
        combo: state.combo,
        currentLane: state.currentLane,
        currentQuestion: state.currentQuestion,
        bossHp: state.bossCurrentHp,
        bossCurrentHp: state.bossCurrentHp,
        bossMaxHp: state.bossMaxHp,
        bossName: state.stageConfig ? state.stageConfig.bossName : '',
        currentPet: activePet ? activePet.name : '',
        currentPetLevel: activePet ? activePet.level : 1,
        totalScore: saveState.totalScore || 0,
        totalSolved: saveState.totalSolved || 0,
        totalCorrect: saveState.totalCorrect || 0,
        totalWrong: saveState.totalWrong || 0,
        wrongAnswerQueueLength: Array.isArray(saveState.wrongAnswerQueue) ? saveState.wrongAnswerQueue.length : 0,
        subjectMode: saveState.subjectMode || 'mixed'
      };
    },

    /**
     * Binds keyboard shortcuts and DOM button click listeners.
     */
    _bindEvents: function () {
      const self = this;

      // Keyboard Controls
      window.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          const revModal = document.getElementById('review-modal');
          if (revModal && !revModal.classList.contains('hidden')) {
            self.closeReviewModal();
            return;
          }
          self.togglePause();
          return;
        }

        if (!state.isPlaying || state.isGameOver) return;

        switch (e.code) {
          case 'ArrowLeft':
          case 'KeyA':
            e.preventDefault();
            self.moveLeft();
            break;
          case 'ArrowRight':
          case 'KeyD':
            e.preventDefault();
            self.moveRight();
            break;
          case 'Digit1':
          case 'Numpad1':
            e.preventDefault();
            self.selectLane(0);
            break;
          case 'Digit2':
          case 'Numpad2':
          case 'KeyS':
          case 'ArrowDown':
            e.preventDefault();
            self.selectLane(1);
            break;
          case 'Space':
          case 'ArrowUp':
          case 'KeyW':
            e.preventDefault();
            self.triggerJump();
            break;
          case 'Digit3':
          case 'Numpad3':
            e.preventDefault();
            self.selectLane(2);
            break;
          default:
            break;
        }
      });

      // Click / Touch / Swipe directly on the 3D Viewport:
      // 1) Instant 3-Zone Tap (Left 1/3 = Lane 0, Center 1/3 = Lane 1, Right 1/3 = Lane 2)
      // 2) Horizontal Swipe Gesture (Swipe Left = moveLeft(), Swipe Right = moveRight())
      // 3) Upward Swipe Gesture (Swipe Up = triggerJump() over Roblox Obby lava hurdles!)
      const canvasContainer = document.getElementById('game-canvas-container');
      if (canvasContainer) {
        let touchStartX = null;
        let touchStartY = null;
        let touchSwiped = false;

        canvasContainer.addEventListener('pointerdown', function (e) {
          if (!state.isPlaying || state.isGameOver) return;
          touchStartX = e.clientX;
          touchStartY = e.clientY;
          touchSwiped = false;

          const width = window.innerWidth || 1280;
          const x = e.clientX;
          if (x < width / 3) {
            self.selectLane(0);
          } else if (x > (width * 2) / 3) {
            self.selectLane(2);
          } else {
            self.selectLane(1);
          }
        });

        canvasContainer.addEventListener('pointermove', function (e) {
          if (!state.isPlaying || state.isGameOver) return;
          if (touchStartX === null || touchSwiped) return;
          const dx = e.clientX - touchStartX;
          const dy = e.clientY - touchStartY;
          if (dy <= -28 && Math.abs(dy) > Math.abs(dx) * 1.1) {
            touchSwiped = true;
            self.triggerJump();
          } else if (Math.abs(dx) >= 32 && Math.abs(dx) > Math.abs(dy) * 1.2) {
            touchSwiped = true;
            if (dx < 0) {
              self.moveLeft();
            } else {
              self.moveRight();
            }
          }
        });

        const clearTouch = function () {
          touchStartX = null;
          touchStartY = null;
          touchSwiped = false;
        };
        canvasContainer.addEventListener('pointerup', clearTouch);
        canvasContainer.addEventListener('pointercancel', clearTouch);
      }

      // Roblox Obby Jump Button (#btn-jump-action)
      const btnJump = document.getElementById('btn-jump-action');
      if (btnJump) {
        btnJump.addEventListener('pointerdown', function (e) {
          e.preventDefault();
          e.stopPropagation();
          self.triggerJump();
        });
        btnJump.addEventListener('click', function (e) {
          e.preventDefault();
          self.triggerJump();
        });
      }

      // Quick Trigger Button for 2x Speed Roblox Obby Mini-Game (#btn-trigger-obby)
      const btnTriggerObby = document.getElementById('btn-trigger-obby');
      if (btnTriggerObby) {
        btnTriggerObby.addEventListener('click', function () {
          if (window.SoundEngine) window.SoundEngine.playClick();
          if (!state.isPlaying || state.isGameOver) {
            self.startGame(state.selectedDashboardStage);
          }
          if (state.isObbyMode) {
            self.endObbyMinigame();
          } else {
            self.startObbyMinigame();
          }
        });
      }

      // Orientation Mode Button in Utility Bar (#btn-orientation-mode)
      const btnOrient = document.getElementById('btn-orientation-mode');
      if (btnOrient) {
        btnOrient.addEventListener('click', function () {
          self.cycleOrientationMode();
        });
      }

      // Orientation Mode Selector on Start Dashboard (#dashboard-orientation-selector)
      const dashOrientContainer = document.getElementById('dashboard-orientation-selector');
      if (dashOrientContainer) {
        dashOrientContainer.addEventListener('click', function (e) {
          const btn = e.target.closest('[data-orient]');
          if (!btn) return;
          const orient = btn.getAttribute('data-orient');
          if (orient) {
            if (window.SoundEngine) window.SoundEngine.playClick();
            self.setOrientationMode(orient);
          }
        });
      }

      // Fullscreen Toggle Button for Mobile / Tablet / PC
      const btnFullscreen = document.getElementById('btn-fullscreen');
      if (btnFullscreen) {
        btnFullscreen.addEventListener('click', function () {
          if (window.SoundEngine) window.SoundEngine.playClick();
          const docEl = document.documentElement;
          if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            if (docEl.requestFullscreen) {
              docEl.requestFullscreen().catch(function () {});
            } else if (docEl.webkitRequestFullscreen) {
              docEl.webkitRequestFullscreen();
            }
          } else {
            if (document.exitFullscreen) {
              document.exitFullscreen().catch(function () {});
            } else if (document.webkitExitFullscreen) {
              document.webkitExitFullscreen();
            }
          }
        });
      }

      // Parent Modal Speed Multiplier Preset Selector (#dashboard-speed-selector inside #parent-modal)
      const dashSpeedContainer = document.getElementById('dashboard-speed-selector');
      if (dashSpeedContainer) {
        dashSpeedContainer.addEventListener('click', function (e) {
          const btn = e.target.closest('.speed-preset-pill');
          if (!btn) return;
          const mult = parseFloat(btn.getAttribute('data-mult'));
          if (!isNaN(mult)) {
            if (window.SoundEngine) window.SoundEngine.playClick();
            self.setSpeedMultiplier(mult);
            if (window.UIManager && window.SaveManager) {
              window.UIManager.renderParentModal(window.SaveManager.getState());
            }
          }
        });
      }

      // Parent Modal Open / Close / PIN / Bonus Payout Events
      const btnOpenParent = document.getElementById('btn-open-parent-modal');
      if (btnOpenParent) {
        btnOpenParent.addEventListener('click', function () {
          self.openParentModal();
        });
      }
      const btnDashParentShortcut = document.getElementById('btn-dash-parent-shortcut');
      if (btnDashParentShortcut) {
        btnDashParentShortcut.addEventListener('click', function () {
          self.openParentModal();
        });
      }
      const btnDashParentSecondary = document.getElementById('btn-dashboard-parent');
      if (btnDashParentSecondary) {
        btnDashParentSecondary.addEventListener('click', function () {
          self.openParentModal();
        });
      }
      const btnCloseParent = document.getElementById('btn-close-parent');
      if (btnCloseParent) {
        btnCloseParent.addEventListener('click', function () {
          self.closeParentModal();
        });
      }
      const btnCloseParentBottom = document.getElementById('btn-close-parent-bottom');
      if (btnCloseParentBottom) {
        btnCloseParentBottom.addEventListener('click', function () {
          self.closeParentModal();
        });
      }

      const verifyPinAction = function () {
        const pinInput = document.getElementById('parent-pin-input');
        const pinErr = document.getElementById('parent-pin-error');
        const val = pinInput ? pinInput.value : '';
        const isOk = window.SaveManager && typeof window.SaveManager.verifyParentPin === 'function'
          ? window.SaveManager.verifyParentPin(val)
          : (String(val).trim() === '1508');

        if (isOk) {
          state.parentUnlocked = true;
          if (window.SoundEngine) window.SoundEngine.playCorrect(1);
          if (pinErr) pinErr.classList.add('hidden');
          if (window.UIManager && window.SaveManager) {
            window.UIManager.showParentModal(window.SaveManager.getState(), true);
          }
        } else {
          if (window.SoundEngine) window.SoundEngine.playWrong();
          if (pinErr) pinErr.classList.remove('hidden');
        }
      };

      const btnVerifyPin = document.getElementById('btn-verify-parent-pin');
      if (btnVerifyPin) {
        btnVerifyPin.addEventListener('click', verifyPinAction);
      }
      const parentPinInput = document.getElementById('parent-pin-input');
      if (parentPinInput) {
        parentPinInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            verifyPinAction();
          }
        });
      }

      const btnSaveParentPin = document.getElementById('btn-save-parent-pin');
      if (btnSaveParentPin) {
        btnSaveParentPin.addEventListener('click', function () {
          const newPinInput = document.getElementById('parent-new-pin-input');
          const newVal = newPinInput ? newPinInput.value.trim() : '';
          if (newVal.length < 4) {
            window.alert('새 비밀번호는 4자리 이상 입력해 주세요.');
            return;
          }
          if (window.SaveManager && typeof window.SaveManager.setParentPin === 'function') {
            window.SaveManager.setParentPin(newVal);
            if (newPinInput) newPinInput.value = '';
            if (window.UIManager) {
              window.UIManager.showFeedbackToast(true, '🔑 보호자 비밀번호가 변경되었습니다!');
            }
          }
        });
      }

      const parentTabNav = document.getElementById('parent-tab-nav');
      if (parentTabNav) {
        parentTabNav.addEventListener('click', function (e) {
          const tabBtn = e.target.closest('[data-parent-tab]');
          if (!tabBtn) return;
          if (window.SoundEngine) window.SoundEngine.playClick();
          const targetTab = tabBtn.getAttribute('data-parent-tab');
          parentTabNav.querySelectorAll('[data-parent-tab]').forEach(function (b) {
            const isAct = b.getAttribute('data-parent-tab') === targetTab;
            b.classList.toggle('active', isAct);
            b.setAttribute('aria-selected', isAct ? 'true' : 'false');
          });
          ['bonus', 'settings', 'reset'].forEach(function (tabName) {
            const pane = document.getElementById('parent-tab-' + tabName);
            if (pane) {
              pane.classList.toggle('hidden', tabName !== targetTab);
              pane.classList.toggle('active', tabName === targetTab);
            }
          });
        });
      }

      const parentBonusContainer = document.getElementById('parent-bonus-list-container');
      if (parentBonusContainer) {
        parentBonusContainer.addEventListener('click', function (e) {
          const saveNameBtn = e.target.closest('[data-action="save-bonus-name"]');
          if (saveNameBtn) {
            const key = saveNameBtn.getAttribute('data-bonus-key');
            const card = saveNameBtn.closest('.parent-bonus-card');
            const input = card ? card.querySelector('.parent-bonus-name-input') : null;
            if (key && input) {
              self.setBonusName(key, input.value);
            }
            return;
          }

          const stepBtn = e.target.closest('[data-action="step-bonus-count"]');
          if (stepBtn) {
            const key = stepBtn.getAttribute('data-bonus-key');
            const step = parseInt(stepBtn.getAttribute('data-step'), 10) || 0;
            if (key && step !== 0) {
              self.stepBonusAchievedCount(key, step);
            }
            return;
          }

          const saveCountBtn = e.target.closest('[data-action="save-bonus-count"]');
          if (saveCountBtn) {
            const key = saveCountBtn.getAttribute('data-bonus-key');
            const card = saveCountBtn.closest('.parent-bonus-card');
            const input = card ? card.querySelector('.parent-bonus-count-input') : null;
            if (key && input) {
              self.setBonusAchievedCount(key, input.value);
            }
            return;
          }

          const markBtn = e.target.closest('[data-action="mark-paid"]');
          if (markBtn && !markBtn.disabled) {
            const key = markBtn.getAttribute('data-bonus-key');
            if (key) self.markBonusPaid(key);
            return;
          }

          const undoBtn = e.target.closest('[data-action="undo-paid"]');
          if (undoBtn) {
            const key = undoBtn.getAttribute('data-bonus-key');
            if (key) self.undoBonusPaid(key);
          }
        });

        parentBonusContainer.addEventListener('keydown', function (e) {
          if (e.key !== 'Enter') return;
          const nameInput = e.target.closest('.parent-bonus-name-input');
          if (nameInput) {
            e.preventDefault();
            const key = nameInput.getAttribute('data-bonus-key');
            if (key) self.setBonusName(key, nameInput.value);
            return;
          }
          const countInput = e.target.closest('.parent-bonus-count-input');
          if (countInput) {
            e.preventDefault();
            const key = countInput.getAttribute('data-bonus-key');
            if (key) self.setBonusAchievedCount(key, countInput.value);
          }
        });

        parentBonusContainer.addEventListener('change', function (e) {
          const sel = e.target.closest('.parent-payout-select');
          if (!sel) return;
          const key = sel.getAttribute('data-bonus-key');
          if (!key) return;
          if (sel.value === 'paid') {
            self.markBonusPaid(key);
          } else if (sel.value === 'paid_all') {
            self.setBonusAchievedCount(key, 0);
          }
        });
      }

      // Bottom 3-Lane Buttons, Mobile Touch Steering Pad & Top Choice Preview Pills
      [0, 1, 2].forEach(function (laneIdx) {
        const laneBtn = document.getElementById(`btn-lane-${laneIdx}`);
        if (laneBtn) {
          laneBtn.addEventListener('click', function () {
            self.selectLane(laneIdx);
          });
        }
        const steerBtn = document.getElementById(`touch-steer-${laneIdx}`);
        if (steerBtn) {
          steerBtn.addEventListener('pointerdown', function (e) {
            e.preventDefault();
            e.stopPropagation();
            self.selectLane(laneIdx);
          });
          steerBtn.addEventListener('click', function (e) {
            e.preventDefault();
            self.selectLane(laneIdx);
          });
        }
        const choicePill = document.getElementById(`choice-pill-${laneIdx}`);
        if (choicePill) {
          choicePill.addEventListener('click', function () {
            self.selectLane(laneIdx);
          });
        }
      });

      // Start Dashboard Primary CTA
      const btnStart = document.getElementById('btn-start-game');
      if (btnStart) {
        btnStart.addEventListener('click', function () {
          self.startGame(state.selectedDashboardStage);
        });
      }

      // Subject Mode Selector
      const modeContainer = document.getElementById('subject-mode-selector');
      if (modeContainer) {
        modeContainer.addEventListener('click', function (e) {
          const btn = e.target.closest('.mode-pill');
          if (!btn) return;
          const mode = btn.getAttribute('data-mode');
          if (mode) {
            if (window.SoundEngine) window.SoundEngine.playClick();
            self.setSubjectMode(mode);
          }
        });
      }

      // Stage Selector Pill Bar
      const stageBar = document.getElementById('stage-selector-bar');
      if (stageBar) {
        stageBar.addEventListener('click', function (e) {
          const btn = e.target.closest('.stage-pill');
          if (!btn || btn.disabled) return;
          const stg = parseInt(btn.getAttribute('data-stage'), 10);
          if (!isNaN(stg) && stg >= 1) {
            if (window.SoundEngine) window.SoundEngine.playClick();
            state.selectedDashboardStage = stg;
            if (window.UIManager && window.SaveManager) {
              window.UIManager.renderDashboard(window.SaveManager.getState(), state.selectedDashboardStage);
            }
          }
        });
      }

      // Reset Progress Button
      const btnReset = document.getElementById('btn-reset-progress');
      if (btnReset) {
        btnReset.addEventListener('click', function () {
          self.resetAllProgress(false);
        });
      }

      // Utility Bar Buttons
      const btnOpenReview = document.getElementById('btn-open-review');
      if (btnOpenReview) {
        btnOpenReview.addEventListener('click', function () {
          self.openReviewModal();
        });
      }

      const btnDashReview = document.getElementById('btn-dashboard-review');
      if (btnDashReview) {
        btnDashReview.addEventListener('click', function () {
          self.openReviewModal();
        });
      }

      const btnGameoverReview = document.getElementById('btn-gameover-review');
      if (btnGameoverReview) {
        btnGameoverReview.addEventListener('click', function () {
          self.openReviewModal();
        });
      }

      const btnPauseReview = document.getElementById('btn-pause-review');
      if (btnPauseReview) {
        btnPauseReview.addEventListener('click', function () {
          self.openReviewModal();
        });
      }

      const btnCloseReview = document.getElementById('btn-close-review');
      if (btnCloseReview) {
        btnCloseReview.addEventListener('click', function () {
          self.closeReviewModal();
        });
      }

      const btnCloseReviewBottom = document.getElementById('btn-close-review-bottom');
      if (btnCloseReviewBottom) {
        btnCloseReviewBottom.addEventListener('click', function () {
          self.closeReviewModal();
        });
      }

      const btnToggleSound = document.getElementById('btn-toggle-sound');
      if (btnToggleSound) {
        btnToggleSound.addEventListener('click', function () {
          self.toggleSound();
        });
      }

      const btnPause = document.getElementById('btn-pause');
      if (btnPause) {
        btnPause.addEventListener('click', function () {
          self.togglePause();
        });
      }

      const pauseInlineBanner = document.getElementById('pause-inline-banner');
      if (pauseInlineBanner) {
        pauseInlineBanner.addEventListener('click', function () {
          if (state.isPaused) {
            self.resumeGame();
          }
        });
      }

      const btnGoDash = document.getElementById('btn-go-dashboard');
      if (btnGoDash) {
        btnGoDash.addEventListener('click', function () {
          if (window.SoundEngine) window.SoundEngine.playClick();
          self.returnToDashboard();
        });
      }

      // Pause Modal Buttons
      const btnResume = document.getElementById('btn-resume-game');
      if (btnResume) {
        btnResume.addEventListener('click', function () {
          self.resumeGame();
        });
      }

      const btnPauseDash = document.getElementById('btn-pause-dashboard');
      if (btnPauseDash) {
        btnPauseDash.addEventListener('click', function () {
          self.returnToDashboard();
        });
      }

      // Game Over / Stage Retry Modal Buttons
      const btnRetryStage = document.getElementById('btn-retry-stage');
      if (btnRetryStage) {
        btnRetryStage.addEventListener('click', function () {
          self.retryCurrentStage();
        });
      }

      const btnGameoverDash = document.getElementById('btn-gameover-dashboard');
      if (btnGameoverDash) {
        btnGameoverDash.addEventListener('click', function () {
          self.returnToDashboard();
        });
      }

      // Speech / Pronunciation HUD Buttons (Stage 3+ Speaking Quiz)
      const btnSpeechTts = document.getElementById('btn-speech-listen-tts');
      if (btnSpeechTts) {
        btnSpeechTts.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (state.currentQuestion && state.currentQuestion.targetWord) {
            speakTargetWordTTS(state.currentQuestion.targetWord);
          }
        });
      }

      const btnSpeechMic = document.getElementById('btn-speech-retry-mic');
      if (btnSpeechMic) {
        btnSpeechMic.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (!state.currentQuestion || !state.currentQuestion.isSpeech) return;
          const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
          if (!SpeechRecognition) {
            state.currentQuestion.speechPassed = true;
            state.currentQuestion.spokenText = state.currentQuestion.targetWord;
            if (window.Engine3D && typeof window.Engine3D.resolveSpeechGatePass === 'function') {
              window.Engine3D.resolveSpeechGatePass(state.currentQuestion.targetWord);
            }
            return;
          }
          startSpeechListening(state.currentQuestion);
        });
      }
    }
  };

  window.GameController = GameController;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      GameController.init();
    });
  } else {
    GameController.init();
  }
})(window);
