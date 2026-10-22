/**
 * Run & Learn Racer 3D (런앤런 레이서 3D)
 * Cumulative Save & Learning Progress Manager (localStorage)
 *
 * CRITICAL DESIGN:
 * Game progress is cumulatively managed ("누적 관리").
 * Reloading the page or getting a Game Over NEVER resets the player back to Stage 1.
 * The player always resumes from their reached `currentStage` with all cumulative
 * scores, statistics, wrongAnswerQueue, and reviewHistory intact.
 */
(function (window) {
  'use strict';

  function getStorageKey() {
    return (window.GameConfig && window.GameConfig.STORAGE_KEY)
      ? window.GameConfig.STORAGE_KEY
      : 'run_and_learn_racer_save_v1';
  }

  function getBaseSpeedDefault() {
    return (window.GameConfig && window.GameConfig.BASE_SPEED)
      ? window.GameConfig.BASE_SPEED
      : 55;
  }

  function createDefaultState() {
    return {
      currentStage: 1,          // Current stage reached (NEVER resets to 1 on game over or page reload!)
      maxStageReached: 1,       // Highest stage unlocked/reached
      stageProgress: 0,         // Current normal questions cleared in currentStage
      totalScore: 0,            // Cumulative score across all sessions
      highScore: 0,             // Highest cumulative/session score record
      maxSpeed: getBaseSpeedDefault(), // Highest speed (km/h) ever reached
      speedMultiplier: 1.0,     // User-adjustable speed multiplier (0.5x ~ 2.0x)
      totalSolved: 0,           // Cumulative total questions attempted
      totalCorrect: 0,          // Cumulative total correct answers
      totalWrong: 0,            // Cumulative total wrong answers
      mathCorrect: 0,           // Cumulative math questions answered correctly
      englishCorrect: 0,        // Cumulative english questions answered correctly
      bossesDefeated: 0,        // Cumulative bosses defeated
      paidPocketCount: 0,       // Paid/deleted offset for Bonus 1
      paidAshleyCount: 0,       // Paid/deleted offset for Bonus 2
      paidJackpotCount: 0,      // Paid/deleted offset for 10th-boss Bonus 3
      bonusNamePocket: '용돈 5,000원',
      bonusNameAshley: '애슐리 외식',
      bonusNameJackpot: '10판 보스 만원 상금',
      parentPin: '1508',        // Parent PIN for parent control window (1508)
      subjectMode: 'mixed',     // 'mixed' | 'math' | 'english'
      wrongAnswerQueue: [],     // Persistent queue of wrong questions that MUST re-appear!
      reviewHistory: [],        // Persistent cumulative notebook of wrong questions
      lastPlayedAt: null
    };
  }

  let _state = null;
  let _cloudSyncTimer = null;
  let _cloudLoaded = false;

  const NEON_HTTP_SQL_URL = 'https://ep-tiny-cake-axmeyi99-pooler.c-4.us-east-2.aws.neon.tech/sql';
  const NEON_CONN_STR = 'postgresql://neondb_owner:npg_EQGY2xSohVX8@ep-tiny-cake-axmeyi99-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require';

  function mapNeonRowToState(row) {
    if (!row) return null;
    return {
      currentStage: Math.max(1, parseInt(row.current_stage, 10) || 1),
      maxStageReached: Math.max(1, parseInt(row.max_stage_reached, 10) || 1),
      stageProgress: Math.max(0, parseInt(row.stage_progress, 10) || 0),
      totalScore: Math.max(0, parseInt(row.total_score, 10) || 0),
      highScore: Math.max(0, parseInt(row.high_score, 10) || 0),
      maxSpeed: Math.max(36, parseInt(row.max_speed, 10) || 36),
      speedMultiplier: parseFloat(row.speed_multiplier) || 1.0,
      totalSolved: Math.max(0, parseInt(row.total_solved, 10) || 0),
      totalCorrect: Math.max(0, parseInt(row.total_correct, 10) || 0),
      totalWrong: Math.max(0, parseInt(row.total_wrong, 10) || 0),
      mathCorrect: Math.max(0, parseInt(row.math_correct, 10) || 0),
      englishCorrect: Math.max(0, parseInt(row.english_correct, 10) || 0),
      bossesDefeated: Math.max(0, parseInt(row.bosses_defeated, 10) || 0),
      paidPocketCount: parseInt(row.paid_pocket_count, 10) || 0,
      paidAshleyCount: parseInt(row.paid_ashley_count, 10) || 0,
      paidJackpotCount: parseInt(row.paid_jackpot_count, 10) || 0,
      bonusNamePocket: row.bonus_name_pocket || '용돈 5,000원',
      bonusNameAshley: row.bonus_name_ashley || '애슐리 외식',
      bonusNameJackpot: row.bonus_name_jackpot || '10판 보스 만원 상금',
      liveUrl: row.live_url || '',
      buildId: row.build_id || '',
      subjectMode: row.subject_mode || 'mixed',
      wrongAnswerQueue: Array.isArray(row.wrong_answer_queue) ? row.wrong_answer_queue : [],
      reviewHistory: Array.isArray(row.review_history) ? row.review_history : [],
      lastPlayedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
    };
  }

  function queryNeonDirect(query, params) {
    return window.fetch(NEON_HTTP_SQL_URL, {
      method: 'POST',
      headers: {
        'Neon-Connection-String': NEON_CONN_STR,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: query, params: params || [] })
    }).then(function (r) {
      if (!r.ok) throw new Error('Neon HTTP ' + r.status);
      return r.json();
    });
  }

  function updateCloudStatusBadge(text) {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('dash-save-status');
    if (el) {
      el.textContent = text;
    }
  }

  /**
   * Normalizes and migrates loaded state so no fields are ever missing or corrupt.
   */
  function sanitizeState(raw) {
    const defaults = createDefaultState();
    if (!raw || typeof raw !== 'object') {
      return defaults;
    }

    const currentStage = Math.max(1, parseInt(raw.currentStage, 10) || 1);
    const maxStageReached = Math.max(currentStage, parseInt(raw.maxStageReached, 10) || 1);
    const stageProgress = Math.max(0, parseInt(raw.stageProgress, 10) || 0);
    const totalScore = Math.max(0, parseInt(raw.totalScore, 10) || 0);
    const highScore = Math.max(totalScore, parseInt(raw.highScore, 10) || 0);
    const maxSpeed = Math.max(getBaseSpeedDefault(), parseInt(raw.maxSpeed, 10) || getBaseSpeedDefault());
    const totalSolved = Math.max(0, parseInt(raw.totalSolved, 10) || 0);
    const totalCorrect = Math.max(0, parseInt(raw.totalCorrect, 10) || 0);
    const totalWrong = Math.max(0, parseInt(raw.totalWrong, 10) || 0);
    const mathCorrect = Math.max(0, parseInt(raw.mathCorrect, 10) || 0);
    const englishCorrect = Math.max(0, parseInt(raw.englishCorrect, 10) || 0);
    const bossesDefeated = Math.max(0, parseInt(raw.bossesDefeated, 10) || 0);
    const paidPocketCount = parseInt(raw.paidPocketCount, 10) || 0;
    const paidAshleyCount = parseInt(raw.paidAshleyCount, 10) || 0;
    const paidJackpotCount = parseInt(raw.paidJackpotCount, 10) || 0;
    const bonusNamePocket = (typeof raw.bonusNamePocket === 'string' && raw.bonusNamePocket.trim())
      ? raw.bonusNamePocket.trim()
      : '용돈 5,000원';
    const bonusNameAshley = (typeof raw.bonusNameAshley === 'string' && raw.bonusNameAshley.trim())
      ? raw.bonusNameAshley.trim()
      : '애슐리 외식';
    const bonusNameJackpot = (typeof raw.bonusNameJackpot === 'string' && raw.bonusNameJackpot.trim())
      ? raw.bonusNameJackpot.trim()
      : '10판 보스 만원 상금';
    const rawPin = typeof raw.parentPin === 'string' ? raw.parentPin.trim() : '';
    const parentPin = (rawPin.length >= 4 && rawPin !== '1234')
      ? rawPin
      : '1508';

    const validModes = ['mixed', 'math', 'english'];
    const subjectMode = validModes.includes(raw.subjectMode) ? raw.subjectMode : 'mixed';
    const parsedMult = parseFloat(raw.speedMultiplier);
    const speedMultiplier = (!isNaN(parsedMult) && parsedMult >= 0.3 && parsedMult <= 2.5)
      ? Math.round(parsedMult * 100) / 100
      : 1.0;

    const wrongAnswerQueue = Array.isArray(raw.wrongAnswerQueue)
      ? raw.wrongAnswerQueue.filter(Boolean)
      : [];

    const reviewHistory = Array.isArray(raw.reviewHistory)
      ? raw.reviewHistory.filter(Boolean)
      : [];

    return {
      currentStage: currentStage,
      maxStageReached: maxStageReached,
      stageProgress: stageProgress,
      totalScore: totalScore,
      highScore: highScore,
      maxSpeed: maxSpeed,
      speedMultiplier: speedMultiplier,
      totalSolved: totalSolved,
      totalCorrect: totalCorrect,
      totalWrong: totalWrong,
      mathCorrect: mathCorrect,
      englishCorrect: englishCorrect,
      bossesDefeated: bossesDefeated,
      paidPocketCount: paidPocketCount,
      paidAshleyCount: paidAshleyCount,
      paidJackpotCount: paidJackpotCount,
      bonusNamePocket: bonusNamePocket,
      bonusNameAshley: bonusNameAshley,
      bonusNameJackpot: bonusNameJackpot,
      parentPin: parentPin,
      subjectMode: subjectMode,
      wrongAnswerQueue: wrongAnswerQueue,
      reviewHistory: reviewHistory,
      lastPlayedAt: raw.lastPlayedAt || null
    };
  }

  const SaveManager = {
    /**
     * Loads cumulative state from localStorage (with safe fallback/migration).
     * @returns {Object} Current state
     */
    load: function () {
      try {
        const rawStr = window.localStorage.getItem(getStorageKey());
        if (rawStr) {
          const parsed = JSON.parse(rawStr);
          _state = sanitizeState(parsed);
        } else {
          _state = createDefaultState();
          this.save();
        }
      } catch (err) {
        console.warn('[SaveManager] Failed to load state from localStorage, using defaults:', err);
        if (!_state) {
          _state = createDefaultState();
        }
      }
      return _state;
    },

    /**
     * Saves current cumulative state to localStorage immediately.
     * @returns {Object} Current state
     */
    save: function () {
      if (!_state) {
        _state = createDefaultState();
      }
      _state.lastPlayedAt = new Date().toISOString();
      if (_state.totalScore > _state.highScore) {
        _state.highScore = _state.totalScore;
      }
      if (_state.currentStage > (_state.maxStageReached || 1)) {
        _state.maxStageReached = _state.currentStage;
      }
      try {
        window.localStorage.setItem(getStorageKey(), JSON.stringify(_state));
      } catch (err) {
        console.warn('[SaveManager] Failed to write state to localStorage:', err);
      }
      this.scheduleCloudPush(false);
      return _state;
    },

    /**
     * Synchronizes cumulative progress from Neon PostgreSQL (/api/progress or direct Neon HTTP SQL) on startup
     */
    syncFromCloud: function () {
      if (typeof window.fetch !== 'function') return;
      if (window.location && window.location.protocol === 'file:') return;

      const self = this;
      const isStaticHost = window.location && (window.location.hostname.includes('github.io') || window.location.pathname.startsWith('/game'));

      const fetchStatePromise = isStaticHost
        ? queryNeonDirect(`SELECT * FROM soyun_roblox_racer_save WHERE player_id = 'soyun_vip' LIMIT 1`, [])
            .then(function (res) {
              const row = res && Array.isArray(res.rows) && res.rows[0] ? res.rows[0] : null;
              return { ok: Boolean(row), state: mapNeonRowToState(row) };
            })
        : window.fetch('/api/progress', { method: 'GET', headers: { 'Accept': 'application/json' } })
            .then(function (res) {
              if (!res.ok) throw new Error('HTTP ' + res.status);
              return res.json();
            })
            .catch(function () {
              return queryNeonDirect(`SELECT * FROM soyun_roblox_racer_save WHERE player_id = 'soyun_vip' LIMIT 1`, [])
                .then(function (res) {
                  const row = res && Array.isArray(res.rows) && res.rows[0] ? res.rows[0] : null;
                  return { ok: Boolean(row), state: mapNeonRowToState(row) };
                });
            });

      fetchStatePromise
        .then(function (data) {
          if (!data || !data.ok || !data.state) return;
          _cloudLoaded = true;

          // Auto-redirect if temporary Vercel URL renewed, or auto-reload if a new build was pushed
          if (data.state.liveUrl && window.location && window.location.hostname.endsWith('.tmp.now')) {
            try {
              const targetUrl = new URL(data.state.liveUrl);
              if (targetUrl.hostname && targetUrl.hostname !== window.location.hostname) {
                window.location.replace(data.state.liveUrl);
                return;
              }
            } catch (_e) {}
          }
          if (data.state.buildId) {
            if (!window.__SOYUN_BUILD_ID__) {
              window.__SOYUN_BUILD_ID__ = data.state.buildId;
            } else if (window.__SOYUN_BUILD_ID__ !== data.state.buildId) {
              window.__SOYUN_BUILD_ID__ = data.state.buildId;
              window.location.reload();
              return;
            }
          }

          const cloud = sanitizeState(data.state);
          const local = self.getState();

          if (cloud.totalSolved > local.totalSolved || cloud.totalScore > local.totalScore || cloud.maxStageReached > local.maxStageReached) {
            _state = sanitizeState({
              currentStage: cloud.totalSolved >= local.totalSolved ? cloud.currentStage : local.currentStage,
              maxStageReached: Math.max(local.maxStageReached, cloud.maxStageReached),
              stageProgress: cloud.totalSolved >= local.totalSolved ? cloud.stageProgress : local.stageProgress,
              totalScore: Math.max(local.totalScore, cloud.totalScore),
              highScore: Math.max(local.highScore, cloud.highScore),
              maxSpeed: Math.max(local.maxSpeed, cloud.maxSpeed),
              speedMultiplier: local.speedMultiplier || cloud.speedMultiplier || 1.0,
              totalSolved: Math.max(local.totalSolved, cloud.totalSolved),
              totalCorrect: Math.max(local.totalCorrect, cloud.totalCorrect),
              totalWrong: Math.max(local.totalWrong, cloud.totalWrong),
              mathCorrect: Math.max(local.mathCorrect, cloud.mathCorrect),
              englishCorrect: Math.max(local.englishCorrect, cloud.englishCorrect),
              bossesDefeated: Math.max(local.bossesDefeated, cloud.bossesDefeated),
              paidPocketCount: (typeof local.paidPocketCount === 'number' && local.paidPocketCount !== 0) ? local.paidPocketCount : (cloud.paidPocketCount || 0),
              paidAshleyCount: (typeof local.paidAshleyCount === 'number' && local.paidAshleyCount !== 0) ? local.paidAshleyCount : (cloud.paidAshleyCount || 0),
              paidJackpotCount: (typeof local.paidJackpotCount === 'number' && local.paidJackpotCount !== 0) ? local.paidJackpotCount : (cloud.paidJackpotCount || 0),
              bonusNamePocket: local.bonusNamePocket || cloud.bonusNamePocket || '용돈 5,000원',
              bonusNameAshley: local.bonusNameAshley || cloud.bonusNameAshley || '애슐리 외식',
              bonusNameJackpot: local.bonusNameJackpot || cloud.bonusNameJackpot || '10판 보스 만원 상금',
              parentPin: '1508',
              subjectMode: local.subjectMode || cloud.subjectMode || 'mixed',
              wrongAnswerQueue: cloud.totalSolved >= local.totalSolved ? cloud.wrongAnswerQueue : local.wrongAnswerQueue,
              reviewHistory: cloud.totalSolved >= local.totalSolved ? cloud.reviewHistory : local.reviewHistory,
              lastPlayedAt: cloud.lastPlayedAt || local.lastPlayedAt
            });
            try {
              window.localStorage.setItem(getStorageKey(), JSON.stringify(_state));
            } catch (_e) {}
            if (window.GameController && typeof window.GameController.syncFromCloud === 'function') {
              window.GameController.syncFromCloud(_state);
            }
          } else if (local.totalSolved > cloud.totalSolved || local.totalScore > cloud.totalScore) {
            self.scheduleCloudPush(false);
          }

          updateCloudStatusBadge('☁️ NEON DB 실시간 클라우드 연동중');
        })
        .catch(function () {
          // Offline or local-only fallback
        });
    },

    /**
     * Pushes current cumulative state to Neon PostgreSQL (/api/progress or direct Neon HTTP SQL)
     * @param {boolean} [forceReset=false]
     */
    scheduleCloudPush: function (forceReset) {
      if (typeof window.fetch !== 'function') return;
      if (window.location && window.location.protocol === 'file:') return;

      if (_cloudSyncTimer) {
        window.clearTimeout(_cloudSyncTimer);
        _cloudSyncTimer = null;
      }

      const pushViaNeonDirect = function (s, isReset) {
        if (isReset) {
          return queryNeonDirect(
            `UPDATE soyun_roblox_racer_save SET
               current_stage = 1, max_stage_reached = 1, stage_progress = 0,
               total_score = 0, high_score = 0, max_speed = 36, speed_multiplier = 1.0,
               total_solved = 0, total_correct = 0, total_wrong = 0, math_correct = 0, english_correct = 0,
               bosses_defeated = 0, pocket_money_count = 0, ashley_count = 0,
               paid_pocket_count = 0, paid_ashley_count = 0, paid_jackpot_count = 0,
               subject_mode = 'mixed', wrong_answer_queue = '[]'::jsonb, review_history = '[]'::jsonb,
               updated_at = CURRENT_TIMESTAMP
             WHERE player_id = 'soyun_vip'`,
            []
          ).then(function () { return { ok: true }; });
        }
        const currentStage = Math.max(1, parseInt(s.currentStage, 10) || 1);
        const maxStageReached = Math.max(currentStage, parseInt(s.maxStageReached, 10) || 1);
        const stageProgress = Math.max(0, parseInt(s.stageProgress, 10) || 0);
        const totalScore = Math.max(0, parseInt(s.totalScore, 10) || 0);
        const highScore = Math.max(totalScore, parseInt(s.highScore, 10) || 0);
        const maxSpeed = Math.max(36, parseInt(s.maxSpeed, 10) || 36);
        const speedMultiplier = Math.max(0.4, Math.min(2.0, parseFloat(s.speedMultiplier) || 1.0));
        const totalSolved = Math.max(0, parseInt(s.totalSolved, 10) || 0);
        const totalCorrect = Math.max(0, parseInt(s.totalCorrect, 10) || 0);
        const totalWrong = Math.max(0, parseInt(s.totalWrong, 10) || 0);
        const mathCorrect = Math.max(0, parseInt(s.mathCorrect, 10) || 0);
        const englishCorrect = Math.max(0, parseInt(s.englishCorrect, 10) || 0);
        const bossesDefeated = Math.max(0, parseInt(s.bossesDefeated, 10) || 0);
        const paidPocketCount = parseInt(s.paidPocketCount, 10) || 0;
        const paidAshleyCount = parseInt(s.paidAshleyCount, 10) || 0;
        const paidJackpotCount = parseInt(s.paidJackpotCount, 10) || 0;
        const bonusNamePocket = (typeof s.bonusNamePocket === 'string' && s.bonusNamePocket.trim()) ? s.bonusNamePocket.trim().slice(0, 100) : '용돈 5,000원';
        const bonusNameAshley = (typeof s.bonusNameAshley === 'string' && s.bonusNameAshley.trim()) ? s.bonusNameAshley.trim().slice(0, 100) : '애슐리 외식';
        const bonusNameJackpot = (typeof s.bonusNameJackpot === 'string' && s.bonusNameJackpot.trim()) ? s.bonusNameJackpot.trim().slice(0, 100) : '10판 보스 만원 상금';
        const subjectMode = ['mixed', 'math', 'english'].includes(s.subjectMode) ? s.subjectMode : 'mixed';
        const wrongQueueJson = JSON.stringify(Array.isArray(s.wrongAnswerQueue) ? s.wrongAnswerQueue.slice(0, 60) : []);
        const reviewHistoryJson = JSON.stringify(Array.isArray(s.reviewHistory) ? s.reviewHistory.slice(0, 120) : []);

        return queryNeonDirect(
          `UPDATE soyun_roblox_racer_save SET
             current_stage = $1, max_stage_reached = GREATEST(max_stage_reached, $2), stage_progress = $3,
             total_score = GREATEST(total_score, $4), high_score = GREATEST(high_score, $5),
             max_speed = GREATEST(max_speed, $6), speed_multiplier = $7,
             total_solved = GREATEST(total_solved, $8), total_correct = GREATEST(total_correct, $9),
             total_wrong = GREATEST(total_wrong, $10), math_correct = GREATEST(math_correct, $11),
             english_correct = GREATEST(english_correct, $12), bosses_defeated = GREATEST(bosses_defeated, $13),
             paid_pocket_count = $14, paid_ashley_count = $15, paid_jackpot_count = $16,
             bonus_name_pocket = $17, bonus_name_ashley = $18, bonus_name_jackpot = $19,
             subject_mode = $20, wrong_answer_queue = $21::jsonb, review_history = $22::jsonb,
             updated_at = CURRENT_TIMESTAMP
           WHERE player_id = 'soyun_vip'`,
          [
            currentStage, maxStageReached, stageProgress, totalScore, highScore,
            maxSpeed, speedMultiplier, totalSolved, totalCorrect, totalWrong,
            mathCorrect, englishCorrect, bossesDefeated, paidPocketCount, paidAshleyCount,
            paidJackpotCount, bonusNamePocket, bonusNameAshley, bonusNameJackpot,
            subjectMode, wrongQueueJson, reviewHistoryJson
          ]
        ).then(function () { return { ok: true }; });
      };

      const doPush = function () {
        const s = _state || createDefaultState();
        const isStaticHost = window.location && (window.location.hostname.includes('github.io') || window.location.pathname.startsWith('/game'));
        const payload = {
          state: s,
          forceReset: Boolean(forceReset)
        };
        const reqPromise = isStaticHost
          ? pushViaNeonDirect(s, Boolean(forceReset))
          : window.fetch('/api/progress', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            })
              .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
              })
              .catch(function () {
                return pushViaNeonDirect(s, Boolean(forceReset));
              });

        reqPromise
          .then(function (data) {
            if (data && data.ok) {
              updateCloudStatusBadge('☁️ NEON DB 실시간 클라우드 저장됨');
            }
          })
          .catch(function () {});
      };

      if (forceReset) {
        doPush();
      } else {
        _cloudSyncTimer = window.setTimeout(doPush, 300);
      }
    },

    /**
     * Returns the current cumulative state object.
     * @returns {Object}
     */
    getState: function () {
      if (!_state) {
        this.load();
      }
      return _state;
    },

    /**
     * Updates and saves subjectMode ('mixed' | 'math' | 'english').
     * @param {string} mode
     * @returns {string}
     */
    setSubjectMode: function (mode) {
      const state = this.getState();
      const validModes = ['mixed', 'math', 'english'];
      if (validModes.includes(mode)) {
        state.subjectMode = mode;
        this.save();
      }
      return state.subjectMode;
    },

    /**
     * Updates and saves user speedMultiplier (0.4x ~ 2.0x).
     * @param {number} mult
     * @returns {number}
     */
    setSpeedMultiplier: function (mult) {
      const state = this.getState();
      const parsed = parseFloat(mult);
      if (!isNaN(parsed)) {
        state.speedMultiplier = Math.max(0.4, Math.min(2.0, Math.round(parsed * 100) / 100));
        this.save();
      }
      return state.speedMultiplier;
    },

    /**
     * Advances to the next stage when a boss is defeated.
     * Increments currentStage by 1, increments bossesDefeated, resets stageProgress = 0, and saves immediately.
     * @returns {number} New currentStage
     */
    advanceStage: function () {
      const state = this.getState();
      state.currentStage = (parseInt(state.currentStage, 10) || 1) + 1;
      state.maxStageReached = Math.max(state.maxStageReached || 1, state.currentStage);
      state.bossesDefeated = (parseInt(state.bossesDefeated, 10) || 0) + 1;
      state.stageProgress = 0;
      this.save();
      return state.currentStage;
    },

    /**
     * Sets currentStage to a specific stage (>= 1), resets stageProgress = 0 if changing stages, and saves immediately.
     * @param {number} stageNum
     * @returns {number} Updated currentStage
     */
    setStage: function (stageNum) {
      const state = this.getState();
      const target = Math.max(1, parseInt(stageNum, 10) || 1);
      if (state.currentStage !== target) {
        state.stageProgress = 0;
      }
      state.currentStage = target;
      state.maxStageReached = Math.max(state.maxStageReached || 1, target);
      this.save();
      return state.currentStage;
    },

    /**
     * Updates stageProgress within the current stage and saves.
     * @param {number} progress
     */
    setStageProgress: function (progress) {
      const state = this.getState();
      state.stageProgress = Math.max(0, parseInt(progress, 10) || 0);
      this.save();
      return state.stageProgress;
    },

    /**
     * Adds points to cumulative totalScore, updates highScore and maxSpeed, and saves immediately.
     * @param {number} points
     * @param {number} [currentSpeed]
     * @returns {Object} Updated state
     */
    addScore: function (points, currentSpeed) {
      const state = this.getState();
      const pts = Math.max(0, Math.round(Number(points) || 0));
      state.totalScore += pts;
      if (state.totalScore > state.highScore) {
        state.highScore = state.totalScore;
      }
      if (typeof currentSpeed === 'number' && !isNaN(currentSpeed)) {
        const roundedSpeed = Math.round(currentSpeed);
        if (roundedSpeed > state.maxSpeed) {
          state.maxSpeed = roundedSpeed;
        }
      }
      this.save();
      return state;
    },

    /**
     * Updates maxSpeed if the provided speed is higher.
     * @param {number} currentSpeed
     */
    updateMaxSpeed: function (currentSpeed) {
      const state = this.getState();
      if (typeof currentSpeed === 'number' && !isNaN(currentSpeed)) {
        const rounded = Math.round(currentSpeed);
        if (rounded > state.maxSpeed) {
          state.maxSpeed = rounded;
          this.save();
        }
      }
      return state.maxSpeed;
    },

    /**
     * Records a question result, updating cumulative statistics, wrongAnswerQueue, and reviewHistory.
     * @param {Object} question
     * @param {string|number} selectedChoice
     * @param {boolean} isCorrect
     * @returns {Object} Updated state
     */
    recordAnswer: function (question, selectedChoice, isCorrect) {
      const state = this.getState();
      if (!question || typeof question !== 'object') {
        return state;
      }

      state.totalSolved += 1;

      const qId = question.id || `${question.category || 'quiz'}_${question.prompt}`;
      const qCategory = (question.category === 'english' || String(question.category).toLowerCase().includes('eng'))
        ? 'english'
        : 'math';
      const answerText = String(
        question.answerText !== undefined
          ? question.answerText
          : (question.correctAnswer !== undefined ? question.correctAnswer : '')
      );

      let chosenText = '';
      if (typeof selectedChoice === 'number' && Array.isArray(question.choices)) {
        chosenText = (selectedChoice >= 0 && selectedChoice < question.choices.length)
          ? String(question.choices[selectedChoice])
          : '미선택';
      } else if (selectedChoice !== undefined && selectedChoice !== null) {
        chosenText = String(selectedChoice);
      } else {
        chosenText = isCorrect ? answerText : '오답';
      }

      if (isCorrect) {
        state.totalCorrect += 1;
        if (qCategory === 'math') {
          state.mathCorrect += 1;
        } else {
          state.englishCorrect += 1;
        }

        // Remove from wrongAnswerQueue if it was queued for review
        const queueIdx = state.wrongAnswerQueue.findIndex(function (item) {
          return item && (item.id === qId || item.prompt === question.prompt);
        });
        if (queueIdx !== -1) {
          state.wrongAnswerQueue.splice(queueIdx, 1);
        }

        // Mark as mastered in reviewHistory if present
        const histItem = state.reviewHistory.find(function (item) {
          return item && (item.id === qId || item.prompt === question.prompt);
        });
        if (histItem) {
          histItem.mastered = true;
          histItem.lastReviewedAt = new Date().toISOString();
        }
      } else {
        state.totalWrong += 1;
        this.enqueueWrongQuestion(question, chosenText, false);
      }

      this.save();
      return state;
    },

    /**
     * Adds or updates a question in wrongAnswerQueue and reviewHistory so it will re-appear.
     * @param {Object} question
     * @param {string} [wrongChoiceText]
     * @param {boolean} [shouldSave=true]
     */
    enqueueWrongQuestion: function (question, wrongChoiceText, shouldSave) {
      if (!question || typeof question !== 'object') return;
      const state = this.getState();

      const qId = question.id || `${question.category || 'quiz'}_${question.prompt}`;
      const qCategory = (question.category === 'english' || String(question.category).toLowerCase().includes('eng'))
        ? 'english'
        : 'math';
      const answerText = String(
        question.answerText !== undefined
          ? question.answerText
          : (question.correctAnswer !== undefined ? question.correctAnswer : '')
      );
      const choices = Array.isArray(question.choices) && question.choices.length === 3
        ? question.choices.map(String)
        : [answerText, '오답 1', '오답 2'];
      const wrongChoice = wrongChoiceText ? String(wrongChoiceText) : '오답 선택';
      const nowIso = new Date().toISOString();

      // 1. Update or add in wrongAnswerQueue
      const existingQueueIdx = state.wrongAnswerQueue.findIndex(function (item) {
        return item && (item.id === qId || item.prompt === question.prompt);
      });

      if (existingQueueIdx !== -1) {
        const existing = state.wrongAnswerQueue[existingQueueIdx];
        existing.wrongCount = (existing.wrongCount || 1) + 1;
        existing.wrongChoice = wrongChoice;
        existing.timestamp = nowIso;
      } else {
        state.wrongAnswerQueue.push({
          id: qId,
          category: qCategory,
          subType: question.subType || qCategory,
          prompt: question.prompt,
          subPrompt: question.subPrompt || '오답 복습 문제입니다! 정확한 정답 레인으로 달리세요!',
          answerText: answerText,
          correctAnswer: answerText,
          choices: choices,
          correctLane: typeof question.correctLane === 'number' ? question.correctLane : 0,
          wrongChoice: wrongChoice,
          wrongCount: (question.wrongCount || 0) + 1,
          timestamp: nowIso
        });
      }

      // 2. Update or add in reviewHistory
      const existingHistIdx = state.reviewHistory.findIndex(function (item) {
        return item && (item.id === qId || item.prompt === question.prompt);
      });

      if (existingHistIdx !== -1) {
        const hist = state.reviewHistory[existingHistIdx];
        hist.wrongCount = (hist.wrongCount || 1) + 1;
        hist.wrongChoice = wrongChoice;
        hist.mastered = false;
        hist.timestamp = nowIso;
        // Move updated item to top of review history
        state.reviewHistory.splice(existingHistIdx, 1);
        state.reviewHistory.unshift(hist);
      } else {
        state.reviewHistory.unshift({
          id: qId,
          category: qCategory,
          subType: question.subType || qCategory,
          prompt: question.prompt,
          subPrompt: question.subPrompt || '',
          answerText: answerText,
          correctAnswer: answerText,
          choices: choices,
          wrongChoice: wrongChoice,
          timestamp: nowIso,
          wrongCount: 1,
          mastered: false
        });
      }

      // Cap reviewHistory length to prevent unbounded localStorage growth
      if (state.reviewHistory.length > 150) {
        state.reviewHistory.length = 150;
      }

      if (shouldSave !== false) {
        this.save();
      }
    },

    /**
     * Calculates cumulative accuracy percentage (0 - 100).
     * @returns {number}
     */
    getAccuracy: function () {
      const state = this.getState();
      if (!state.totalSolved || state.totalSolved <= 0) return 0;
      return Math.round((state.totalCorrect / state.totalSolved) * 100);
    },

    /**
     * Marks 1 achieved bonus of the given type ('pocket' | 'ashley' | 'jackpot') as paid/completed,
     * removing it from the active unpaid bonus count!
     * @param {string} bonusKey
     * @returns {Object} Updated state
     */
    markBonusPaid: function (bonusKey) {
      const state = this.getState();
      const rewards = (window.GameConfig && typeof window.GameConfig.getRewardStatus === 'function')
        ? window.GameConfig.getRewardStatus(state.totalCorrect, state.bossesDefeated, state.maxStageReached)
        : null;

      if (bonusKey === 'pocket') {
        const curUnpaid = rewards ? rewards.pocketMoney.unpaidCount : 0;
        if (curUnpaid > 0) {
          state.paidPocketCount = (parseInt(state.paidPocketCount, 10) || 0) + 1;
        }
      } else if (bonusKey === 'ashley') {
        const curUnpaid = rewards ? rewards.ashley.unpaidCount : 0;
        if (curUnpaid > 0) {
          state.paidAshleyCount = (parseInt(state.paidAshleyCount, 10) || 0) + 1;
        }
      } else if (bonusKey === 'jackpot') {
        const curUnpaid = rewards ? rewards.bossJackpot.unpaidCount : 0;
        if (curUnpaid > 0) {
          state.paidJackpotCount = (parseInt(state.paidJackpotCount, 10) || 0) + 1;
        }
      }
      this.save();
      return state;
    },

    /**
     * Restores 1 paid bonus back to unpaid status if the parent wants to undo (+1 achieved count).
     * @param {string} bonusKey
     * @returns {Object} Updated state
     */
    undoBonusPaid: function (bonusKey) {
      const state = this.getState();
      if (bonusKey === 'pocket') {
        state.paidPocketCount = (parseInt(state.paidPocketCount, 10) || 0) - 1;
      } else if (bonusKey === 'ashley') {
        state.paidAshleyCount = (parseInt(state.paidAshleyCount, 10) || 0) - 1;
      } else if (bonusKey === 'jackpot') {
        state.paidJackpotCount = (parseInt(state.paidJackpotCount, 10) || 0) - 1;
      }
      this.save();
      return state;
    },

    /**
     * Directly sets the active (unpaid) achieved bonus count for 'pocket' | 'ashley' | 'jackpot'.
     * @param {string} bonusKey
     * @param {number} desiredCount
     * @returns {Object} Updated state
     */
    setBonusAchievedCount: function (bonusKey, desiredCount) {
      const state = this.getState();
      const target = Math.max(0, Math.min(999, parseInt(desiredCount, 10) || 0));
      const rewards = (window.GameConfig && typeof window.GameConfig.getRewardStatus === 'function')
        ? window.GameConfig.getRewardStatus(state.totalCorrect, state.bossesDefeated, state.maxStageReached)
        : null;

      if (bonusKey === 'pocket') {
        const earned = rewards ? rewards.pocketMoney.earnedCount : 0;
        state.paidPocketCount = earned - target;
      } else if (bonusKey === 'ashley') {
        const earned = rewards ? rewards.ashley.earnedCount : 0;
        state.paidAshleyCount = earned - target;
      } else if (bonusKey === 'jackpot') {
        const earned = rewards ? rewards.bossJackpot.earnedCount : 0;
        state.paidJackpotCount = earned - target;
      }
      this.save();
      return state;
    },

    /**
     * Updates the custom bonus name for 'pocket' | 'ashley' | 'jackpot'.
     * @param {string} bonusKey
     * @param {string} newName
     * @returns {Object} Updated state
     */
    setBonusName: function (bonusKey, newName) {
      const state = this.getState();
      const cleaned = String(newName || '').trim();
      if (!cleaned) return state;
      if (bonusKey === 'pocket') {
        state.bonusNamePocket = cleaned;
      } else if (bonusKey === 'ashley') {
        state.bonusNameAshley = cleaned;
      } else if (bonusKey === 'jackpot') {
        state.bonusNameJackpot = cleaned;
      }
      this.save();
      return state;
    },

    verifyParentPin: function (inputPin) {
      const state = this.getState();
      const pin = state.parentPin || '1508';
      const cleaned = String(inputPin || '').trim();
      return cleaned === '1508' || cleaned === String(pin).trim();
    },

    setParentPin: function (newPin) {
      const state = this.getState();
      const cleaned = String(newPin || '').trim();
      if (cleaned.length >= 4) {
        state.parentPin = cleaned;
        this.save();
        return true;
      }
      return false;
    },

    /**
     * Explicit full reset ONLY when the user clicks "기록 완전 초기화" and confirms.
     * Resets back to Stage 1 and clears all cumulative stats.
     * @returns {Object} Fresh default state
     */
    resetAllProgress: function () {
      _state = createDefaultState();
      try {
        window.localStorage.setItem(getStorageKey(), JSON.stringify(_state));
      } catch (_e) {}
      this.scheduleCloudPush(true);
      return _state;
    }
  };

  // Initialize state immediately on script load & sync with Neon PostgreSQL Cloud DB
  SaveManager.load();
  SaveManager.syncFromCloud();

  // Poll every 6 seconds for new auto-pushed builds or URL renewals so the user's phone updates automatically
  if (typeof window.setInterval === 'function' && window.location && window.location.protocol !== 'file:') {
    window.setInterval(function () {
      SaveManager.syncFromCloud();
    }, 6000);
  }

  window.SaveManager = SaveManager;
})(window);
