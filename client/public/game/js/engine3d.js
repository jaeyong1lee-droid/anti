/**
 * Run & Learn Racer 3D (런앤런 레이서 3D - 소윤이의 로블록스 오비 에디션)
 * 3D Roblox Obby + Synthwave Arcade Racing & Physics Engine (Three.js)
 * Features:
 *  - "소윤이의 로블록스 오비 슈퍼카트" + 3D Blocky Avatar "👑 [VIP] 이소윤" + Floating 3D Cube Pet
 *  - Roblox Obby Studded Rainbow Platforms & Jump Pads along the highway
 *  - Giant 3D Blocky Roblox Mecha Boss with swinging Ban-Hammer at BOSS_Z = -38, y = 2.8
 *  - Explosive 40+ 3D Roblox Brick Shatter + Robux (R$) Coin Bursts + Camera FOV Zoom Punch
 *  - Twin Kart + Pet Mega Laser & Golden Rocket Strike with Boss Knockback Recoil
 * Exposes `window.Engine3D`
 */
(function (global) {
  'use strict';

  const DEFAULT_CONFIG = {
    LANES: [-4.5, 0, 4.5],
    GATE_SPAWN_Z: -74,
    GATE_PASS_Z: 8,
    GATE_DESPAWN_Z: 24,
    BOSS_Z: -38,
    BASE_SPEED: 36,
    MAX_SPEED: 120,
    MIN_SPEED: 14
  };

  const STAGE_THEMES = [
    {
      id: 1,
      name: 'ROBLOX NEON OBBY',
      primary: 0x00f3ff,
      secondary: 0xff2a85,
      accent: 0xffe600,
      fog: 0x090418,
      skyTop: '#050214',
      skyBottom: '#2d083a',
      road: 0x0d0820,
      grid: 0xff007f,
      curbA: 0x00f3ff,
      curbB: 0xff2a85,
      mountain: 0x1e0936,
      mountainEdge: 0x00f3ff
    },
    {
      id: 2,
      name: 'SUNSET BLOCK PARTY',
      primary: 0xffbe0b,
      secondary: 0xfb5607,
      accent: 0xff006e,
      fog: 0x160514,
      skyTop: '#0b0316',
      skyBottom: '#421024',
      road: 0x140718,
      grid: 0xfb5607,
      curbA: 0xffbe0b,
      curbB: 0xff006e,
      mountain: 0x2b0c22,
      mountainEdge: 0xffbe0b
    },
    {
      id: 3,
      name: 'EMERALD SLIME OBBY',
      primary: 0x00ff9d,
      secondary: 0x00b4d8,
      accent: 0xb5179e,
      fog: 0x041418,
      skyTop: '#020b12',
      skyBottom: '#072a30',
      road: 0x07151b,
      grid: 0x00ff9d,
      curbA: 0x00ff9d,
      curbB: 0x00b4d8,
      mountain: 0x08242c,
      mountainEdge: 0x00ff9d
    },
    {
      id: 4,
      name: 'LAVA TOWER OVERDRIVE',
      primary: 0xff2a6d,
      secondary: 0x7b2cbf,
      accent: 0x05d9e8,
      fog: 0x170312,
      skyTop: '#0c010a',
      skyBottom: '#3c0626',
      road: 0x150516,
      grid: 0xff2a6d,
      curbA: 0xff2a6d,
      curbB: 0x05d9e8,
      mountain: 0x2c0721,
      mountainEdge: 0xff2a6d
    },
    {
      id: 5,
      name: 'RAINBOW VIP FINALE',
      primary: 0x72efdd,
      secondary: 0x7400b8,
      accent: 0xffd166,
      fog: 0x08031c,
      skyTop: '#040112',
      skyBottom: '#290648',
      road: 0x0b0622,
      grid: 0x80ffdb,
      curbA: 0xffd166,
      curbB: 0x72efdd,
      mountain: 0x190934,
      mountainEdge: 0xffd166
    }
  ];

  const ROBLOX_BRICK_COLORS = [
    0xff2a55, // Bright Red
    0x00b4ff, // Obby Cyan Blue
    0x00ff88, // Slime Green
    0xffe600, // Bright Yellow
    0xff4da6, // Soyun Pink
    0x9b5de5, // Royal Purple
    0xff7b00, // Neon Orange
    0x00f5d4  // Mint Aqua
  ];

  function getCfg() {
    const gc = global.GameConfig || {};
    return {
      LANES: Array.isArray(gc.LANES) && gc.LANES.length === 3 ? gc.LANES : DEFAULT_CONFIG.LANES,
      GATE_SPAWN_Z: typeof gc.GATE_SPAWN_Z === 'number' ? gc.GATE_SPAWN_Z : DEFAULT_CONFIG.GATE_SPAWN_Z,
      GATE_PASS_Z: typeof gc.GATE_PASS_Z === 'number' ? gc.GATE_PASS_Z : DEFAULT_CONFIG.GATE_PASS_Z,
      GATE_DESPAWN_Z: typeof gc.GATE_DESPAWN_Z === 'number' ? gc.GATE_DESPAWN_Z : DEFAULT_CONFIG.GATE_DESPAWN_Z,
      BOSS_Z: DEFAULT_CONFIG.BOSS_Z
    };
  }

  function hexToCss(hex) {
    if (typeof hex === 'string') return hex;
    return '#' + ('000000' + (hex >>> 0).toString(16)).slice(-6);
  }

  function parseColorHex(val, fallback) {
    if (typeof val === 'number') return val;
    if (typeof val === 'string' && val.startsWith('#')) {
      const parsed = parseInt(val.slice(1), 16);
      if (!isNaN(parsed)) return parsed;
    }
    return fallback;
  }

  /**
   * CORS-safe Texture Helper:
   * Immediately creates a vibrant procedural CanvasTexture so WebGL NEVER renders black
   * (even when index.html is opened directly over file://), and swaps in the PNG image
   * only if it passes an offscreen canvas taint test without throwing a SecurityError.
   */
  function createSafeTexture(url, width, height, drawProceduralFn, onImageLoadedFn) {
    const THREE = global.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (typeof drawProceduralFn === 'function') {
      drawProceduralFn(ctx, width, height);
    }

    if (!THREE) return null;
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    if (url) {
      const resolvedUrl = (global.NanoBananaAssets && global.NanoBananaAssets[url]) ? global.NanoBananaAssets[url] : url;
      const img = new Image();
      if (!resolvedUrl.startsWith('data:') && global.location && global.location.protocol !== 'file:') {
        img.crossOrigin = 'anonymous';
      }
      img.onload = function () {
        try {
          const testCanvas = document.createElement('canvas');
          testCanvas.width = 4;
          testCanvas.height = 4;
          const testCtx = testCanvas.getContext('2d');
          testCtx.drawImage(img, 0, 0, 4, 4);
          testCtx.getImageData(0, 0, 1, 1);

          if (typeof onImageLoadedFn === 'function') {
            onImageLoadedFn(ctx, img, width, height, drawProceduralFn);
          } else {
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
          }
          texture.needsUpdate = true;
        } catch (_err) {
          // Keep procedural fallback on file:// CORS restriction
        }
      };
      img.onerror = function () {
        // Keep procedural fallback if image is missing
      };
      img.src = resolvedUrl;
    }

    return { texture, canvas, ctx, drawProceduralFn };
  }

  /**
   * Draws a rounded rectangle path on a 2D canvas context
   */
  function roundRectPath(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  const Engine3D = {
    container: null,
    scene: null,
    camera: null,
    renderer: null,
    clock: null,
    rafId: null,

    isInitialized: false,
    isRunning: false,
    isPaused: false,
    isDemoMode: false,
    demoTimer: 0,

    // Callbacks
    onGatePass: null,
    onGateProgress: null,
    onObbyWavePass: null,

    // Player & Physics State
    currentLane: 1,
    targetLane: 1,
    currentSpeed: 130,
    targetSpeed: 130,
    elapsedTime: 0,
    roadScrollOffset: 0,
    carJumpY: 0,
    carJumpVel: 0,
    isJumping: false,
    viewOrientationMode: 'auto', // 'auto' | 'portrait' | 'landscape'

    // Camera Shake, Zoom Punch & Flash State
    shakeIntensity: 0,
    shakeTimer: 0,
    cameraZoomPunch: 0,
    damageFlashTimer: 0,
    boostEffectTimer: 0,
    stageClearTimer: 0,

    // Theme State
    currentTheme: STAGE_THEMES[0],

    // 3D Scene Groups & Collections
    carGroup: null,
    carWheels: [],
    carFlames: [],
    carBodyMaterials: [],
    carUnderGlow: null,
    steeringWheelMesh: null,

    // Soyun 3D Roblox Avatar & Floating Cube Pet State
    soyunAvatarGroup: null,
    soyunHeadMesh: null,
    soyunCrownGroup: null,
    soyunLeftArm: null,
    soyunRightArm: null,
    soyunLeftPigtail: null,
    soyunRightPigtail: null,
    soyunNameSprite: null,
    avatarCheerTimer: 0,

    petGroup: null,
    petLeftWing: null,
    petRightWing: null,
    petSpinTimer: 0,

    roadGroup: null,
    laneDashMeshes: [],
    curbMeshes: [],
    sceneryItems: [],
    obbyPlatforms: [],
    speedLineParticles: null,
    starField: null,
    skyBackdropMesh: null,
    retroSunMesh: null,
    skyTextureObj: null,

    // Lights
    ambientLight: null,
    dirLight: null,
    carPointLight: null,

    // Gates & Obstacles
    activeGates: [],
    activeObbyWaves: [],
    hazardBarriers: [],

    // Particles, 3D Shatter Bricks & Laser Beams
    particleBursts: [],
    activeBricks: [],
    activeLasers: [],
    activeProjectiles: [],
    sharedBrickGeo: null,
    sharedStudGeo: null,
    sharedRobuxGeo: null,
    sharedBrickMaterials: [],
    sharedRobuxMaterial: null,

    // Boss State
    isBossActive: false,
    bossGroup: null,
    bossCoreMesh: null,
    bossBillboardMesh: null,
    bossHpFillMesh: null,
    bossLeftArm: null,
    bossRightArm: null,
    bossHammerGroup: null,
    bossRing1: null,
    bossRing2: null,
    bossHpRatio: 1.0,
    bossHitTimer: 0,
    bossRecoilZ: 0,
    bossRecoilPitch: 0,
    bossDefeating: false,
    bossDefeatTimer: 0,
    bossDefeatCallback: null,
    lastAutoLaserTime: 0,

    // Shared Textures
    textures: {
      skybox: null,
      playerCar: null,
      obstacleBarrier: null,
      bossMecha: null,
      soyunFace: null,
      petFace: null,
      soyunNameplate: null
    },

    /**
     * Initialize the Three.js 3D Engine inside containerElement
     */
    init: function (containerElement, callbacks) {
      if (containerElement && typeof containerElement === 'object' && !(containerElement instanceof HTMLElement) && !callbacks) {
        callbacks = containerElement;
        containerElement = null;
      }
      if (typeof containerElement === 'string') {
        containerElement = document.querySelector(containerElement) || document.getElementById(containerElement);
      }
      if (!containerElement) {
        containerElement =
          document.getElementById('canvas-container') ||
          document.getElementById('game-canvas-container') ||
          document.getElementById('three-container') ||
          document.getElementById('game-container') ||
          document.body;
      }

      this.container = containerElement;

      if (callbacks) {
        if (typeof callbacks.onGatePass === 'function') this.onGatePass = callbacks.onGatePass;
        if (typeof callbacks.onGateProgress === 'function') this.onGateProgress = callbacks.onGateProgress;
        if (typeof callbacks.onObbyWavePass === 'function') this.onObbyWavePass = callbacks.onObbyWavePass;
      }

      if (this.isInitialized) {
        this.resize();
        return this;
      }

      const THREE = global.THREE;
      if (!THREE) {
        console.error('Engine3D: THREE.js is not loaded.');
        return this;
      }

      const width = this.container.clientWidth || global.innerWidth || 1280;
      const height = this.container.clientHeight || global.innerHeight || 720;

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(this.currentTheme.fog);
      this.scene.fog = new THREE.FogExp2(this.currentTheme.fog, 0.0058);

      this.camera = new THREE.PerspectiveCamera(62, width / height, 0.1, 320);
      this.camera.position.set(0, 4.4, 16.5);
      this.camera.lookAt(0, 1.8, -30);

      try {
        this.renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance'
        });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));

        const oldCanvas = this.container.querySelector('canvas');
        if (oldCanvas && oldCanvas.parentNode === this.container) {
          this.container.removeChild(oldCanvas);
        }
        this.renderer.domElement.style.display = 'block';
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';
        this.container.appendChild(this.renderer.domElement);
      } catch (e) {
        console.warn('Engine3D: WebGLRenderer fallback mode activated:', e);
        this.renderer = null;
      }

      this.clock = new THREE.Clock();

      this._initSharedBrickAssets();
      this._initTextures();
      this._buildLighting();
      this._buildSkyAndHorizon();
      this._buildHighwayAndScenery();
      this._buildPlayerCar();
      this._buildSpeedLines();
      this._buildBossModel();

      this._boundResize = () => this.resize();
      global.addEventListener('resize', this._boundResize);
      global.addEventListener('orientationchange', () => {
        setTimeout(() => this.resize(), 120);
      });
      if (global.visualViewport) {
        global.visualViewport.addEventListener('resize', this._boundResize);
      }

      this.isInitialized = true;
      this.resize();
      this.renderSingleFrame();
      return this;
    },

    /**
     * Initialize shared geometries & materials for 3D Roblox Brick Shatter & Studs
     */
    _initSharedBrickAssets: function () {
      const THREE = global.THREE;
      if (!THREE) return;

      this.sharedBrickGeo = new THREE.BoxGeometry(0.62, 0.36, 0.92);
      this.sharedStudGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.09, 10);
      this.sharedRobuxGeo = new THREE.TorusGeometry(0.32, 0.1, 8, 16);

      this.sharedBrickMaterials = ROBLOX_BRICK_COLORS.map((hex) =>
        new THREE.MeshStandardMaterial({
          color: hex,
          emissive: hex,
          emissiveIntensity: 0.32,
          roughness: 0.25,
          metalness: 0.2
        })
      );

      this.sharedRobuxMaterial = new THREE.MeshBasicMaterial({
        color: 0xffea00
      });
    },

    /**
     * Initialize CORS-safe textures with vibrant procedural Canvas fallbacks
     */
    _initTextures: function () {
      const THREE = global.THREE;

      // 1. Skybox Horizon Banner Texture
      this.skyTextureObj = createSafeTexture(
        'assets/bg_skybox.png',
        1024,
        512,
        (ctx, w, h) => {
          const grad = ctx.createLinearGradient(0, 0, 0, h);
          grad.addColorStop(0, '#040112');
          grad.addColorStop(0.45, '#190535');
          grad.addColorStop(0.8, '#5a0b4d');
          grad.addColorStop(1, '#ff007f');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);

          // Stars & floating blocky clouds
          ctx.fillStyle = '#ffffff';
          for (let i = 0; i < 140; i++) {
            const sx = (i * 97) % w;
            const sy = (i * 53) % Math.floor(h * 0.65);
            const r = (i % 3 === 0) ? 2.2 : 1.2;
            ctx.globalAlpha = 0.4 + (i % 5) * 0.12;
            ctx.beginPath();
            ctx.arc(sx, sy, r, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;

          // Retro Outrun Segmented Sun
          const sunGrad = ctx.createLinearGradient(0, h * 0.25, 0, h * 0.88);
          sunGrad.addColorStop(0, '#fff75e');
          sunGrad.addColorStop(0.5, '#ff5400');
          sunGrad.addColorStop(1, '#ff006e');
          ctx.fillStyle = sunGrad;
          ctx.beginPath();
          ctx.arc(w / 2, h * 0.62, 130, 0, Math.PI * 2);
          ctx.fill();

          // Horizontal scanline cutouts across the lower sun
          ctx.fillStyle = '#260634';
          for (let s = 0; s < 7; s++) {
            const sy = h * 0.58 + s * 18;
            const sh = 3 + s * 1.8;
            ctx.fillRect(w / 2 - 140, sy, 280, sh);
          }

          // Distant Blocky Roblox Towers Silhouette
          ctx.fillStyle = '#090218';
          for (let x = 0; x < w; x += 28) {
            const bh = 25 + ((x * 19) % 75);
            ctx.fillRect(x, h - bh, 26, bh);
            ctx.fillStyle = (x % 56 === 0) ? '#00f3ff' : '#ff007f';
            for (let wy = h - bh + 6; wy < h - 8; wy += 10) {
              ctx.fillRect(x + 5, wy, 6, 4);
              ctx.fillRect(x + 15, wy, 6, 4);
            }
            ctx.fillStyle = '#090218';
          }
        },
        (ctx, img, w, h) => {
          ctx.drawImage(img, 0, 0, w, h);
        }
      );
      this.textures.skybox = this.skyTextureObj ? this.skyTextureObj.texture : null;

      // 2. Player Kart Rear VIP License Plate Texture ("👑 SOYUN VIP")
      const carTexObj = createSafeTexture(
        'assets/player_car.png',
        256,
        128,
        (ctx, w, h) => {
          ctx.fillStyle = '#140826';
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = '#ffe600';
          ctx.lineWidth = 8;
          ctx.strokeRect(6, 6, w - 12, h - 12);

          const barGrad = ctx.createLinearGradient(0, 0, w, 0);
          barGrad.addColorStop(0, '#ff2a85');
          barGrad.addColorStop(0.5, '#00f3ff');
          barGrad.addColorStop(1, '#ff2a85');
          ctx.fillStyle = barGrad;
          ctx.fillRect(16, 16, w - 32, 24);

          ctx.fillStyle = '#ffe600';
          ctx.font = '900 30px "Malgun Gothic", "Orbitron", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('👑 이소윤 VIP', w / 2, h * 0.68);
        },
        (ctx, img, w, h, fallback) => {
          fallback(ctx, w, h);
        }
      );
      this.textures.playerCar = carTexObj ? carTexObj.texture : null;

      // 3. Obstacle Hazard Barrier Texture (Roblox Kill-Brick Style)
      const barrierTexObj = createSafeTexture(
        'assets/obstacle_barrier.png',
        512,
        256,
        (ctx, w, h) => {
          ctx.fillStyle = '#24030c';
          roundRectPath(ctx, 8, 8, w - 16, h - 16, 18);
          ctx.fill();

          ctx.save();
          roundRectPath(ctx, 16, 16, w - 32, h - 32, 12);
          ctx.clip();
          for (let x = -h; x < w + h; x += 48) {
            ctx.fillStyle = (Math.floor(x / 48) % 2 === 0) ? '#ff0044' : '#ffbe0b';
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x + 28, 0);
            ctx.lineTo(x - 28 + h, h);
            ctx.lineTo(x - 56 + h, h);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();

          ctx.fillStyle = 'rgba(12, 4, 20, 0.9)';
          ctx.fillRect(24, h / 2 - 42, w - 48, 84);
          ctx.strokeStyle = '#ff0044';
          ctx.lineWidth = 6;
          ctx.strokeRect(24, h / 2 - 42, w - 48, 84);

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 38px "Malgun Gothic", "Orbitron", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('⚠ 오답 블럭! 조심! ⚠', w / 2, h / 2);
        },
        (ctx, img, w, h) => {
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          ctx.strokeStyle = '#ff0044';
          ctx.lineWidth = 8;
          ctx.strokeRect(4, 4, w - 8, h - 8);
        }
      );
      this.textures.obstacleBarrier = barrierTexObj ? barrierTexObj.texture : null;

      // 4. Boss Mecha Texture (Blocky Roblox Boss Face & Emblem)
      const bossTexObj = createSafeTexture(
        'assets/boss_mecha.png',
        512,
        512,
        (ctx, w, h) => {
          ctx.clearRect(0, 0, w, h);
          const radGrad = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, 240);
          radGrad.addColorStop(0, 'rgba(255, 0, 128, 0.95)');
          radGrad.addColorStop(0.55, 'rgba(114, 9, 183, 0.8)');
          radGrad.addColorStop(1, 'rgba(0, 243, 255, 0.0)');
          ctx.fillStyle = radGrad;
          ctx.beginPath();
          ctx.arc(w / 2, h / 2, 240, 0, Math.PI * 2);
          ctx.fill();

          // Blocky Roblox Mecha Head Frame
          ctx.fillStyle = '#18092c';
          ctx.strokeStyle = '#00f3ff';
          ctx.lineWidth = 12;
          roundRectPath(ctx, 84, 76, w - 168, h - 152, 28);
          ctx.fill();
          ctx.stroke();

          // Angry Glowing Blocky Eyes
          ctx.fillStyle = '#ff0055';
          ctx.fillRect(130, 165, 95, 52);
          ctx.fillRect(w - 225, 165, 95, 52);
          ctx.fillStyle = '#ffe600';
          ctx.fillRect(158, 180, 38, 26);
          ctx.fillRect(w - 196, 180, 38, 26);

          // Blocky Mecha Grin Teeth
          ctx.fillStyle = '#00f3ff';
          ctx.fillRect(145, 295, w - 290, 62);
          ctx.strokeStyle = '#18092c';
          ctx.lineWidth = 8;
          for (let tx = 185; tx < w - 150; tx += 45) {
            ctx.beginPath();
            ctx.moveTo(tx, 295);
            ctx.lineTo(tx, 357);
            ctx.stroke();
          }
        },
        (ctx, img, w, h, fallback) => {
          fallback(ctx, w, h);
          ctx.save();
          roundRectPath(ctx, 76, 76, w - 152, h - 152, 32);
          ctx.clip();
          ctx.drawImage(img, 64, 64, w - 128, h - 128);
          ctx.restore();
          ctx.strokeStyle = '#00f3ff';
          ctx.lineWidth = 10;
          roundRectPath(ctx, 76, 76, w - 152, h - 152, 32);
          ctx.stroke();
        }
      );
      this.textures.bossMecha = bossTexObj ? bossTexObj.texture : null;

      // 5. Soyun 3D Blocky Roblox Avatar Face Texture
      if (THREE) {
        const faceCanvas = document.createElement('canvas');
        faceCanvas.width = 256;
        faceCanvas.height = 256;
        const fctx = faceCanvas.getContext('2d');
        fctx.fillStyle = '#ffdfb8';
        fctx.fillRect(0, 0, 256, 256);

        // Cute bangs across forehead
        fctx.fillStyle = '#1b112c';
        fctx.fillRect(0, 0, 256, 62);
        for (let bx = 0; bx < 256; bx += 32) {
          fctx.beginPath();
          fctx.moveTo(bx, 62);
          fctx.lineTo(bx + 16, 84);
          fctx.lineTo(bx + 32, 62);
          fctx.fill();
        }

        // Sparkling Roblox anime eyes
        fctx.fillStyle = '#1b112c';
        roundRectPath(fctx, 48, 98, 44, 52, 12);
        fctx.fill();
        roundRectPath(fctx, 164, 98, 44, 52, 12);
        fctx.fill();

        // White eye highlights
        fctx.fillStyle = '#ffffff';
        fctx.beginPath();
        fctx.arc(62, 114, 10, 0, Math.PI * 2);
        fctx.arc(178, 114, 10, 0, Math.PI * 2);
        fctx.fill();
        fctx.beginPath();
        fctx.arc(78, 134, 5, 0, Math.PI * 2);
        fctx.arc(194, 134, 5, 0, Math.PI * 2);
        fctx.fill();

        // Pink blush cheeks
        fctx.fillStyle = '#ff65a3';
        fctx.globalAlpha = 0.65;
        fctx.beginPath();
        fctx.ellipse(42, 164, 20, 11, 0, 0, Math.PI * 2);
        fctx.ellipse(214, 164, 20, 11, 0, 0, Math.PI * 2);
        fctx.fill();
        fctx.globalAlpha = 1;

        // Happy Roblox smile
        fctx.strokeStyle = '#1b112c';
        fctx.lineWidth = 8;
        fctx.lineCap = 'round';
        fctx.beginPath();
        fctx.arc(128, 162, 34, 0.15 * Math.PI, 0.85 * Math.PI);
        fctx.stroke();

        this.textures.soyunFace = new THREE.CanvasTexture(faceCanvas);
        this.textures.soyunFace.needsUpdate = true;

        // 6. Floating 3D Cube Pet Kawaii Face Texture
        const petCanvas = document.createElement('canvas');
        petCanvas.width = 256;
        petCanvas.height = 256;
        const pctx = petCanvas.getContext('2d');
        const petGrad = pctx.createLinearGradient(0, 0, 0, 256);
        petGrad.addColorStop(0, '#72efdd');
        petGrad.addColorStop(1, '#ff5ec4');
        pctx.fillStyle = petGrad;
        pctx.fillRect(0, 0, 256, 256);

        pctx.strokeStyle = '#ffffff';
        pctx.lineWidth = 10;
        pctx.strokeRect(8, 8, 240, 240);

        // Big pixel eyes
        pctx.fillStyle = '#120824';
        pctx.fillRect(46, 86, 48, 56);
        pctx.fillRect(162, 86, 48, 56);
        pctx.fillStyle = '#ffffff';
        pctx.fillRect(54, 94, 18, 18);
        pctx.fillRect(170, 94, 18, 18);
        pctx.fillStyle = '#00f3ff';
        pctx.fillRect(72, 120, 14, 14);
        pctx.fillRect(188, 120, 14, 14);

        // Cute cat/dragon mouth "w"
        pctx.strokeStyle = '#120824';
        pctx.lineWidth = 8;
        pctx.beginPath();
        pctx.moveTo(98, 166);
        pctx.lineTo(114, 182);
        pctx.lineTo(128, 168);
        pctx.lineTo(142, 182);
        pctx.lineTo(158, 166);
        pctx.stroke();

        this.textures.petFace = new THREE.CanvasTexture(petCanvas);
        this.textures.petFace.needsUpdate = true;

        // 7. Overhead Roblox VIP Nameplate Texture ("👑 [VIP] 이소윤")
        const nameCanvas = document.createElement('canvas');
        nameCanvas.width = 512;
        nameCanvas.height = 128;
        const nctx = nameCanvas.getContext('2d');
        nctx.clearRect(0, 0, 512, 128);

        // Pill background
        const pillGrad = nctx.createLinearGradient(0, 14, 0, 114);
        pillGrad.addColorStop(0, 'rgba(20, 8, 44, 0.92)');
        pillGrad.addColorStop(1, 'rgba(68, 10, 82, 0.92)');
        nctx.fillStyle = pillGrad;
        roundRectPath(nctx, 18, 16, 476, 96, 48);
        nctx.fill();

        // Glowing gold + cyan border
        nctx.strokeStyle = '#ffd700';
        nctx.lineWidth = 7;
        roundRectPath(nctx, 18, 16, 476, 96, 48);
        nctx.stroke();

        // VIP Tag Text
        nctx.font = '900 44px "Malgun Gothic", "Apple SD Gothic Neo", "Orbitron", sans-serif';
        nctx.textAlign = 'center';
        nctx.textBaseline = 'middle';
        nctx.shadowColor = '#ff007f';
        nctx.shadowBlur = 12;
        nctx.fillStyle = '#ffe600';
        nctx.fillText('👑 [VIP] 이소윤', 256, 66);
        nctx.shadowBlur = 0;

        this.textures.soyunNameplate = new THREE.CanvasTexture(nameCanvas);
        this.textures.soyunNameplate.needsUpdate = true;
      }
    },

    /**
     * Build Scene Lighting
     */
    _buildLighting: function () {
      const THREE = global.THREE;
      this.ambientLight = new THREE.AmbientLight(0xffffff, 0.86);
      this.scene.add(this.ambientLight);

      this.dirLight = new THREE.DirectionalLight(0xffe6ff, 1.25);
      this.dirLight.position.set(12, 28, 20);
      this.scene.add(this.dirLight);

      this.carPointLight = new THREE.PointLight(this.currentTheme.primary, 2.1, 22);
      this.carPointLight.position.set(0, 2.5, 8);
      this.scene.add(this.carPointLight);
    },

    /**
     * Build Horizon Skybox Banner, Giant Retro Sun, and 3D Starfield
     */
    _buildSkyAndHorizon: function () {
      const THREE = global.THREE;

      const skyGeo = new THREE.PlaneGeometry(340, 150);
      const skyMat = new THREE.MeshBasicMaterial({
        map: this.textures.skybox,
        fog: false,
        depthWrite: false
      });
      this.skyBackdropMesh = new THREE.Mesh(skyGeo, skyMat);
      this.skyBackdropMesh.position.set(0, 46, -195);
      this.scene.add(this.skyBackdropMesh);

      const sunGeo = new THREE.CircleGeometry(28, 48);
      const sunMat = new THREE.MeshBasicMaterial({
        color: 0xff2a85,
        transparent: true,
        opacity: 0.45,
        fog: false
      });
      this.retroSunMesh = new THREE.Mesh(sunGeo, sunMat);
      this.retroSunMesh.position.set(0, 24, -180);
      this.scene.add(this.retroSunMesh);

      const starCount = 260;
      const starPositions = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount; i++) {
        starPositions[i * 3] = (Math.random() - 0.5) * 260;
        starPositions[i * 3 + 1] = 12 + Math.random() * 75;
        starPositions[i * 3 + 2] = -20 - Math.random() * 170;
      }
      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
      const starMat = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.75,
        transparent: true,
        opacity: 0.85,
        fog: false
      });
      this.starField = new THREE.Points(starGeo, starMat);
      this.scene.add(this.starField);
    },

    /**
     * Build 3-Lane Highway, Scrolling Neon Grid, Studded Side Curbs, and Roblox Obby Rainbow Platforms
     */
    _buildHighwayAndScenery: function () {
      const THREE = global.THREE;
      this.roadGroup = new THREE.Group();
      this.scene.add(this.roadGroup);

      // 1. Wide Outer Ground Plane
      const groundGeo = new THREE.PlaneGeometry(280, 260, 28, 28);
      const groundMat = new THREE.MeshBasicMaterial({
        color: this.currentTheme.fog,
        side: THREE.DoubleSide
      });
      const groundMesh = new THREE.Mesh(groundGeo, groundMat);
      groundMesh.rotation.x = -Math.PI / 2;
      groundMesh.position.set(0, -0.12, -85);
      this.roadGroup.add(groundMesh);
      this.outerGroundMat = groundMat;

      // 2. Synthwave Wireframe Grid Floor
      const gridHelper = new THREE.GridHelper(260, 52, this.currentTheme.primary, this.currentTheme.grid);
      gridHelper.position.set(0, -0.05, -85);
      if (gridHelper.material) {
        gridHelper.material.transparent = true;
        gridHelper.material.opacity = 0.35;
      }
      this.roadGroup.add(gridHelper);
      this.synthGridHelper = gridHelper;

      // 3. Main 3-Lane Asphalt Highway Surface (Widened in distance so road narrows much less!)
      const roadGeo = new THREE.PlaneGeometry(14.4, 260, 1, 48);
      const roadPos = roadGeo.attributes.position;
      for (let v = 0; v < roadPos.count; v++) {
        const vx = roadPos.getX(v);
        const vy = roadPos.getY(v);
        // After rotation.x = -PI/2 and position.z = -85, worldZ = -85 - vy
        const worldZ = -85 - vy;
        const wf = 1 + Math.max(0, (8 - worldZ) * 0.0175);
        roadPos.setX(v, vx * wf);
      }
      roadPos.needsUpdate = true;
      roadGeo.computeVertexNormals();

      const roadMat = new THREE.MeshStandardMaterial({
        color: this.currentTheme.road,
        roughness: 0.4,
        metalness: 0.35
      });
      const roadMesh = new THREE.Mesh(roadGeo, roadMat);
      roadMesh.rotation.x = -Math.PI / 2;
      roadMesh.position.set(0, 0, -85);
      this.roadGroup.add(roadMesh);
      this.roadSurfaceMat = roadMat;

      // 4. Continuous Neon Edge Rails following the less-narrowing road edges
      const railGeo = new THREE.BoxGeometry(0.24, 0.18, 265);
      this.edgeRailMat = new THREE.MeshBasicMaterial({ color: this.currentTheme.primary });
      const midWf = 1 + Math.max(0, (8 - (-85)) * 0.0175);
      const railAngle = Math.atan(7.2 * 0.0175);
      const leftRail = new THREE.Mesh(railGeo, this.edgeRailMat);
      leftRail.position.set(-7.2 * midWf, 0.09, -85);
      leftRail.rotation.y = railAngle;
      const rightRail = new THREE.Mesh(railGeo, this.edgeRailMat);
      rightRail.position.set(7.2 * midWf, 0.09, -85);
      rightRail.rotation.y = -railAngle;
      this.roadGroup.add(leftRail, rightRail);

      // 5. Scrolling Lane Divider Dashes
      this.laneDashMeshes = [];
      const dashGeo = new THREE.PlaneGeometry(0.28, 4.2);
      this.dashMaterial = new THREE.MeshBasicMaterial({
        color: this.currentTheme.primary,
        side: THREE.DoubleSide
      });

      const numRows = 24;
      const spacing = 10;
      for (let i = 0; i < numRows; i++) {
        const zPos = 24 - i * spacing;
        const wf = 1 + Math.max(0, (8 - zPos) * 0.0175);
        [-2.25, 2.25].forEach((xPos) => {
          const dash = new THREE.Mesh(dashGeo, this.dashMaterial);
          dash.rotation.x = -Math.PI / 2;
          dash.rotation.z = -Math.atan(xPos * 0.0175);
          dash.position.set(xPos * wf, 0.02, zPos);
          dash.userData = { baseX: xPos };
          this.roadGroup.add(dash);
          this.laneDashMeshes.push(dash);
        });
      }

      // 6. Alternating Glowing Roblox Studded Side Curb Bricks
      this.curbMeshes = [];
      const curbGeo = new THREE.BoxGeometry(0.65, 0.32, 3.6);
      this.curbMatA = new THREE.MeshBasicMaterial({ color: this.currentTheme.curbA });
      this.curbMatB = new THREE.MeshBasicMaterial({ color: this.currentTheme.curbB });

      for (let i = 0; i < 32; i++) {
        const zPos = 24 - i * 7.5;
        const wf = 1 + Math.max(0, (8 - zPos) * 0.0175);
        const mat = (i % 2 === 0) ? this.curbMatA : this.curbMatB;
        [-7.55, 7.55].forEach((cx) => {
          const curbGroup = new THREE.Group();
          curbGroup.position.set(cx * wf, 0.16, zPos);
          curbGroup.rotation.y = -Math.atan(cx * 0.0175);
          curbGroup.userData = { baseX: cx };
          const brick = new THREE.Mesh(curbGeo, mat);
          curbGroup.add(brick);

          // Add 3 Roblox cylindrical studs along each curb brick
          if (this.sharedStudGeo) {
            [-1.1, 0, 1.1].forEach((sz) => {
              const stud = new THREE.Mesh(this.sharedStudGeo, mat);
              stud.position.set(0, 0.2, sz);
              curbGroup.add(stud);
            });
          }

          this.roadGroup.add(curbGroup);
          this.curbMeshes.push(curbGroup);
        });
      }

      // 7. Roadside Scrolling Scenery + Floating Roblox Obby Rainbow Platforms with Studs!
      this.sceneryItems = [];
      this.obbyPlatforms = [];
      this.mountainMat = new THREE.MeshStandardMaterial({
        color: this.currentTheme.mountain,
        roughness: 0.7,
        metalness: 0.2,
        flatShading: true
      });
      this.mountainWireMat = new THREE.MeshBasicMaterial({
        color: this.currentTheme.mountainEdge,
        wireframe: true,
        transparent: true,
        opacity: 0.55
      });

      for (let i = 0; i < 18; i++) {
        const zPos = 20 - i * 12;
        [-1, 1].forEach((side) => {
          // Floating Roblox Obby Rainbow Brick Platform right beside the highway!
          const obbyPlat = this._createObbyPlatform(i, side);
          obbyPlat.position.set(
            side * (10.2 + (i % 3) * 1.9),
            1.4 + (i % 4) * 0.85,
            zPos
          );
          obbyPlat.userData = {
            baseY: obbyPlat.position.y,
            phase: i * 0.7 + (side > 0 ? 1.5 : 0)
          };
          this.roadGroup.add(obbyPlat);
          this.sceneryItems.push(obbyPlat);
          this.obbyPlatforms.push(obbyPlat);

          // Cyber Palm / Neon Pylon further out
          const prop = (i % 2 === 0) ? this._createCyberPalm() : this._createNeonPylon(i);
          prop.position.set(side * (16.5 + (i % 3) * 2.2), 0, zPos - 4);
          this.roadGroup.add(prop);
          this.sceneryItems.push(prop);

          // Low-poly synthwave mountain peaks
          if (i % 2 === 0) {
            const mtn = this._createLowPolyMountain(i, side);
            mtn.position.set(side * (30 + (i % 4) * 7), 0, zPos - 3);
            this.roadGroup.add(mtn);
            this.sceneryItems.push(mtn);
          }
        });
      }
    },

    /**
     * Create a colorful floating Roblox Obby Rainbow Platform with cylindrical Studs
     */
    _createObbyPlatform: function (idx, side) {
      const THREE = global.THREE;
      const group = new THREE.Group();
      const colorIdx = (idx + (side > 0 ? 3 : 0)) % ROBLOX_BRICK_COLORS.length;
      const mat =
        (this.sharedBrickMaterials && this.sharedBrickMaterials[colorIdx]) ||
        new THREE.MeshBasicMaterial({ color: ROBLOX_BRICK_COLORS[colorIdx] });

      const plateGeo = new THREE.BoxGeometry(3.4, 0.55, 4.8);
      const plate = new THREE.Mesh(plateGeo, mat);
      group.add(plate);

      // 6 Roblox cylindrical studs on top of the Obby brick
      const studGeo = this.sharedStudGeo || new THREE.CylinderGeometry(0.18, 0.18, 0.1, 10);
      [-0.85, 0.85].forEach((sx) => {
        [-1.4, 0, 1.4].forEach((sz) => {
          const stud = new THREE.Mesh(studGeo, mat);
          stud.position.set(sx, 0.33, sz);
          group.add(stud);
        });
      });

      // Every 3rd platform has a spinning Golden Robux Coin / Obby Star floating above it
      if (idx % 3 === 0 && this.sharedRobuxGeo && this.sharedRobuxMaterial) {
        const coin = new THREE.Mesh(this.sharedRobuxGeo, this.sharedRobuxMaterial);
        coin.position.set(0, 1.25, 0);
        group.add(coin);
      }

      return group;
    },

    _createCyberPalm: function () {
      const THREE = global.THREE;
      const group = new THREE.Group();

      const trunkGeo = new THREE.CylinderGeometry(0.16, 0.35, 6.2, 6);
      const trunkMat = new THREE.MeshStandardMaterial({
        color: 0x240b36,
        emissive: 0xff007f,
        emissiveIntensity: 0.4,
        flatShading: true
      });
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 3.1;
      group.add(trunk);

      const ringGeo = new THREE.TorusGeometry(0.28, 0.05, 6, 12);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xff007f });
      for (let r = 1; r <= 4; r++) {
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = r * 1.3;
        group.add(ring);
      }

      const frondGeo = new THREE.ConeGeometry(0.65, 3.2, 4);
      const frondMat = new THREE.MeshBasicMaterial({
        color: 0x00f3ff,
        wireframe: false
      });
      for (let f = 0; f < 6; f++) {
        const angle = (f / 6) * Math.PI * 2;
        const frond = new THREE.Mesh(frondGeo, frondMat);
        frond.position.set(Math.cos(angle) * 1.1, 6.1, Math.sin(angle) * 1.1);
        frond.rotation.z = -Math.cos(angle) * 1.1;
        frond.rotation.x = Math.sin(angle) * 1.1;
        group.add(frond);
      }

      return group;
    },

    _createNeonPylon: function (idx) {
      const THREE = global.THREE;
      const group = new THREE.Group();
      const h = 6 + (idx % 3) * 2.5;
      const pylonGeo = new THREE.OctahedronGeometry(1.1, 0);
      const color = (idx % 2 === 0) ? 0x00f3ff : 0xff007f;
      const pylonMat = new THREE.MeshBasicMaterial({
        color: color,
        wireframe: true
      });
      const crystal = new THREE.Mesh(pylonGeo, pylonMat);
      crystal.scale.set(1, h / 2.2, 1);
      crystal.position.y = h / 2 + 0.5;
      group.add(crystal);

      const coreGeo = new THREE.OctahedronGeometry(0.65, 0);
      const coreMat = new THREE.MeshBasicMaterial({ color: color });
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.scale.set(1, h / 2.6, 1);
      core.position.y = h / 2 + 0.5;
      group.add(core);

      return group;
    },

    _createLowPolyMountain: function (idx, side) {
      const THREE = global.THREE;
      const group = new THREE.Group();
      const radius = 9 + (idx % 3) * 4;
      const height = 11 + ((idx * 7) % 14);
      const coneGeo = new THREE.ConeGeometry(radius, height, 5);
      const mesh = new THREE.Mesh(coneGeo, this.mountainMat);
      mesh.position.y = height / 2 - 0.2;
      mesh.rotation.y = side * idx * 0.7;

      const wire = new THREE.Mesh(coneGeo, this.mountainWireMat);
      wire.position.y = height / 2 - 0.18;
      wire.rotation.y = mesh.rotation.y;
      wire.scale.set(1.01, 1.01, 1.01);

      group.add(mesh, wire);
      return group;
    },

    /**
     * Alias for _buildPlayerCar
     */
    createPlayerCar: function () {
      return this._buildPlayerCar();
    },

    /**
     * Build "소윤이의 로블록스 오비 슈퍼카트" + 3D Blocky Avatar "이소윤" + Floating 3D Cube Pet
     */
    _buildPlayerCar: function () {
      const THREE = global.THREE;
      if (this.carGroup && this.scene) {
        this.scene.remove(this.carGroup);
      }

      this.carGroup = new THREE.Group();
      this.carGroup.position.set(0, 0, getCfg().GATE_PASS_Z);
      this.scene.add(this.carGroup);

      this.carWheels = [];
      this.carFlames = [];
      this.carBodyMaterials = [];

      // 1. Vibrant Open-Cockpit Roblox Blocky Speed Kart Chassis (Cyber-Pink, Neon-Cyan & Gold)
      const chassisMat = new THREE.MeshStandardMaterial({
        color: 0xff2a85,
        metalness: 0.35,
        roughness: 0.25,
        emissive: 0x3a0028,
        emissiveIntensity: 0.45
      });
      const cyanBlockMat = new THREE.MeshStandardMaterial({
        color: 0x00f3ff,
        metalness: 0.4,
        roughness: 0.2,
        emissive: 0x005577,
        emissiveIntensity: 0.5
      });
      const goldMat = new THREE.MeshStandardMaterial({
        color: 0xffd700,
        metalness: 0.65,
        roughness: 0.2,
        emissive: 0x664400,
        emissiveIntensity: 0.45
      });
      this.carBodyMaterials.push(chassisMat, cyanBlockMat);

      // Lower Blocky Base Frame
      const baseGeo = new THREE.BoxGeometry(2.35, 0.44, 4.3);
      const baseMesh = new THREE.Mesh(baseGeo, chassisMat);
      baseMesh.position.set(0, 0.44, 0);
      this.carGroup.add(baseMesh);

      // Front Blocky Nose / Hood with Roblox Studs
      const hoodGeo = new THREE.BoxGeometry(2.1, 0.38, 1.5);
      const hoodMesh = new THREE.Mesh(hoodGeo, cyanBlockMat);
      hoodMesh.position.set(0, 0.72, -1.35);
      this.carGroup.add(hoodMesh);

      // Gold Bumper & Headlight Bar
      const bumperGeo = new THREE.BoxGeometry(2.42, 0.28, 0.32);
      const bumperMesh = new THREE.Mesh(bumperGeo, goldMat);
      bumperMesh.position.set(0, 0.42, -2.18);
      this.carGroup.add(bumperMesh);

      // Open Cockpit Side Fenders (with Roblox Studs on top!)
      const fenderGeo = new THREE.BoxGeometry(0.36, 0.42, 2.1);
      [-1.02, 1.02].forEach((fx) => {
        const fender = new THREE.Mesh(fenderGeo, goldMat);
        fender.position.set(fx, 0.76, 0.05);
        this.carGroup.add(fender);
      });

      // Add 12 Roblox Studs across the hood and side fenders!
      const studGeo = this.sharedStudGeo || new THREE.CylinderGeometry(0.14, 0.14, 0.08, 12);
      [-0.65, 0, 0.65].forEach((sx) => {
        [-1.75, -1.15].forEach((sz) => {
          const stud = new THREE.Mesh(studGeo, goldMat);
          stud.position.set(sx, 0.95, sz);
          this.carGroup.add(stud);
        });
      });
      [-1.02, 1.02].forEach((fx) => {
        [-0.65, 0.05, 0.75].forEach((fz) => {
          const stud = new THREE.Mesh(studGeo, chassisMat);
          stud.position.set(fx, 1.01, fz);
          this.carGroup.add(stud);
        });
      });

      // Steering Column & Sporty Steering Wheel
      const colGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.55, 8);
      const colMat = new THREE.MeshStandardMaterial({ color: 0x222233 });
      const colMesh = new THREE.Mesh(colGeo, colMat);
      colMesh.position.set(0, 0.98, -0.58);
      colMesh.rotation.x = -0.55;
      this.carGroup.add(colMesh);

      const wheelRimGeo = new THREE.TorusGeometry(0.24, 0.045, 8, 16);
      const wheelRimMat = new THREE.MeshBasicMaterial({ color: 0xffe600 });
      this.steeringWheelMesh = new THREE.Mesh(wheelRimGeo, wheelRimMat);
      this.steeringWheelMesh.position.set(0, 1.15, -0.42);
      this.steeringWheelMesh.rotation.x = -0.55;
      this.carGroup.add(this.steeringWheelMesh);

      // 2. 3D Blocky Roblox Avatar for "이소윤 (Soyun)" sitting inside the open cockpit!
      this.soyunAvatarGroup = new THREE.Group();
      this.soyunAvatarGroup.position.set(0, 0.68, 0.15);
      this.carGroup.add(this.soyunAvatarGroup);

      // Blocky Torso (VIP Cyber-Pink & Cyan Roblox Jacket)
      const torsoGeo = new THREE.BoxGeometry(0.82, 0.74, 0.46);
      const torsoMat = new THREE.MeshStandardMaterial({
        color: 0x00f3ff,
        roughness: 0.3,
        emissive: 0x003355,
        emissiveIntensity: 0.35
      });
      const torsoMesh = new THREE.Mesh(torsoGeo, torsoMat);
      torsoMesh.position.set(0, 0.42, 0);
      this.soyunAvatarGroup.add(torsoMesh);

      // Gold Star Emblem on Back of Soyun's Jacket (visible to player camera!)
      const backBadgeGeo = new THREE.BoxGeometry(0.46, 0.46, 0.06);
      const backBadge = new THREE.Mesh(backBadgeGeo, goldMat);
      backBadge.position.set(0, 0.44, 0.24);
      backBadge.rotation.z = Math.PI / 4;
      this.soyunAvatarGroup.add(backBadge);

      // Blocky Left & Right Arms extending toward the steering wheel
      const armGeo = new THREE.BoxGeometry(0.28, 0.66, 0.28);
      const skinMat = new THREE.MeshStandardMaterial({
        color: 0xffdfb8,
        roughness: 0.35
      });
      const sleeveMat = new THREE.MeshStandardMaterial({
        color: 0xff2a85,
        roughness: 0.3
      });

      this.soyunLeftArm = new THREE.Group();
      this.soyunLeftArm.position.set(-0.54, 0.66, 0);
      const leftArmMesh = new THREE.Mesh(armGeo, sleeveMat);
      leftArmMesh.position.set(0, -0.22, 0);
      const leftHandGeo = new THREE.BoxGeometry(0.26, 0.22, 0.26);
      const leftHand = new THREE.Mesh(leftHandGeo, skinMat);
      leftHand.position.set(0, -0.56, 0);
      this.soyunLeftArm.add(leftArmMesh, leftHand);
      this.soyunLeftArm.rotation.x = 1.15;
      this.soyunLeftArm.rotation.z = -0.18;
      this.soyunAvatarGroup.add(this.soyunLeftArm);

      this.soyunRightArm = new THREE.Group();
      this.soyunRightArm.position.set(0.54, 0.66, 0);
      const rightArmMesh = new THREE.Mesh(armGeo, sleeveMat);
      rightArmMesh.position.set(0, -0.22, 0);
      const rightHand = new THREE.Mesh(leftHandGeo, skinMat);
      rightHand.position.set(0, -0.56, 0);
      this.soyunRightArm.add(rightArmMesh, rightHand);
      this.soyunRightArm.rotation.x = 1.15;
      this.soyunRightArm.rotation.z = 0.18;
      this.soyunAvatarGroup.add(this.soyunRightArm);

      // Blocky Roblox Head (Yellow/Peach with Cute Face on Front & Hair on Back)
      const headGroup = new THREE.Group();
      headGroup.position.set(0, 1.12, 0);
      this.soyunAvatarGroup.add(headGroup);
      this.soyunHeadMesh = headGroup;

      const headGeo = new THREE.BoxGeometry(0.74, 0.74, 0.74);
      const hairDarkMat = new THREE.MeshStandardMaterial({
        color: 0x1e132d,
        roughness: 0.4
      });
      const faceMat = new THREE.MeshBasicMaterial({
        map: this.textures.soyunFace
      });
      const headMaterials = [
        skinMat,     // Right
        skinMat,     // Left
        hairDarkMat, // Top
        skinMat,     // Bottom
        faceMat,     // Front (+Z)
        faceMat      // Back (-Z so face is also seen if turned!)
      ];
      const headBox = new THREE.Mesh(headGeo, headMaterials);
      headGroup.add(headBox);

      // Blocky Top & Back Hair Cap
      const hairCapGeo = new THREE.BoxGeometry(0.78, 0.24, 0.78);
      const hairCap = new THREE.Mesh(hairCapGeo, hairDarkMat);
      hairCap.position.set(0, 0.3, 0);
      headGroup.add(hairCap);

      const hairBackGeo = new THREE.BoxGeometry(0.76, 0.68, 0.18);
      const hairBack = new THREE.Mesh(hairBackGeo, hairDarkMat);
      hairBack.position.set(0, 0.02, 0.34);
      headGroup.add(hairBack);

      // Cute Twin-Pigtails Hair Blocks on Both Sides + Pink/Cyan Hair Ribbons!
      const ribbonMat = new THREE.MeshBasicMaterial({ color: 0xff2a85 });
      const pigtailGeo = new THREE.BoxGeometry(0.26, 0.64, 0.28);
      const ribbonGeo = new THREE.BoxGeometry(0.32, 0.18, 0.32);

      this.soyunLeftPigtail = new THREE.Group();
      this.soyunLeftPigtail.position.set(-0.48, 0.1, 0.08);
      const leftRibbon = new THREE.Mesh(ribbonGeo, ribbonMat);
      const leftTail = new THREE.Mesh(pigtailGeo, hairDarkMat);
      leftTail.position.set(-0.06, -0.28, 0);
      leftTail.rotation.z = -0.22;
      this.soyunLeftPigtail.add(leftRibbon, leftTail);
      headGroup.add(this.soyunLeftPigtail);

      this.soyunRightPigtail = new THREE.Group();
      this.soyunRightPigtail.position.set(0.48, 0.1, 0.08);
      const rightRibbon = new THREE.Mesh(ribbonGeo, ribbonMat);
      const rightTail = new THREE.Mesh(pigtailGeo, hairDarkMat);
      rightTail.position.set(0.06, -0.28, 0);
      rightTail.rotation.z = 0.22;
      this.soyunRightPigtail.add(rightRibbon, rightTail);
      headGroup.add(this.soyunRightPigtail);

      // Golden 3D Crown (👑) on top of Soyun's head!
      this.soyunCrownGroup = new THREE.Group();
      this.soyunCrownGroup.position.set(0, 0.5, 0);
      headGroup.add(this.soyunCrownGroup);

      const crownBandGeo = new THREE.BoxGeometry(0.56, 0.16, 0.56);
      const crownBand = new THREE.Mesh(crownBandGeo, goldMat);
      this.soyunCrownGroup.add(crownBand);

      const spikeGeo = new THREE.ConeGeometry(0.11, 0.26, 4);
      [
        [-0.2, 0.2, -0.2],
        [0.2, 0.2, -0.2],
        [-0.2, 0.2, 0.2],
        [0.2, 0.2, 0.2],
        [0, 0.24, 0]
      ].forEach(([cx, cy, cz], idx) => {
        const spike = new THREE.Mesh(
          spikeGeo,
          idx === 4 ? new THREE.MeshBasicMaterial({ color: 0x00f3ff }) : goldMat
        );
        spike.position.set(cx, cy, cz);
        this.soyunCrownGroup.add(spike);
      });

      // 3. Crisp 3D Canvas Sprite Nameplate above Soyun's head ("👑 [VIP] 이소윤") at y = 2.65
      if (this.textures.soyunNameplate) {
        const spriteMat = new THREE.SpriteMaterial({
          map: this.textures.soyunNameplate,
          transparent: true,
          depthTest: false
        });
        this.soyunNameSprite = new THREE.Sprite(spriteMat);
        this.soyunNameSprite.position.set(0, 2.68, 0.15);
        this.soyunNameSprite.scale.set(3.2, 0.8, 1);
        this.carGroup.add(this.soyunNameSprite);
      }

      // 4. Floating 3D Roblox Cube Pet (유니콘/드래곤 큐브 펫) at (1.65, 1.9, 0.3)
      this.petGroup = new THREE.Group();
      this.petGroup.position.set(1.65, 1.9, 0.3);
      this.carGroup.add(this.petGroup);

      const petBodyGeo = new THREE.BoxGeometry(0.68, 0.68, 0.68);
      const petSideMat = new THREE.MeshStandardMaterial({
        color: 0x72efdd,
        emissive: 0xff2a85,
        emissiveIntensity: 0.35,
        roughness: 0.25
      });
      const petFaceMat = new THREE.MeshBasicMaterial({
        map: this.textures.petFace
      });
      const petMaterials = [
        petSideMat,
        petSideMat,
        petSideMat,
        petSideMat,
        petFaceMat, // Front (+Z toward camera)
        petFaceMat  // Back (-Z)
      ];
      const petCube = new THREE.Mesh(petBodyGeo, petMaterials);
      this.petGroup.add(petCube);

      // Glowing Golden Unicorn Horn & Blocky Ears on Cube Pet
      const hornGeo = new THREE.ConeGeometry(0.12, 0.42, 4);
      const hornMat = new THREE.MeshBasicMaterial({ color: 0xffe600 });
      const hornMesh = new THREE.Mesh(hornGeo, hornMat);
      hornMesh.position.set(0, 0.52, 0);
      this.petGroup.add(hornMesh);

      const earGeo = new THREE.BoxGeometry(0.16, 0.22, 0.16);
      const earMat = new THREE.MeshBasicMaterial({ color: 0xff2a85 });
      [-0.24, 0.24].forEach((ex) => {
        const ear = new THREE.Mesh(earGeo, earMat);
        ear.position.set(ex, 0.42, 0);
        this.petGroup.add(ear);
      });

      // Flapping Blocky Wings on Cube Pet
      const wingGeo = new THREE.BoxGeometry(0.46, 0.1, 0.32);
      const wingMat = new THREE.MeshBasicMaterial({ color: 0xffe600 });
      this.petLeftWing = new THREE.Mesh(wingGeo, wingMat);
      this.petLeftWing.position.set(-0.5, 0.08, 0);
      this.petRightWing = new THREE.Mesh(wingGeo, wingMat);
      this.petRightWing.position.set(0.5, 0.08, 0);
      this.petGroup.add(this.petLeftWing, this.petRightWing);

      // 5. Rear Spoiler Wing, VIP Plate & Twin Turbo Boosters
      const strutGeo = new THREE.BoxGeometry(0.14, 0.58, 0.32);
      const wingBladeMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff });
      const leftStrut = new THREE.Mesh(strutGeo, goldMat);
      leftStrut.position.set(-0.82, 0.96, 1.85);
      const rightStrut = new THREE.Mesh(strutGeo, goldMat);
      rightStrut.position.set(0.82, 0.96, 1.85);
      const wingBladeGeo = new THREE.BoxGeometry(2.45, 0.14, 0.58);
      const wingBlade = new THREE.Mesh(wingBladeGeo, wingBladeMat);
      wingBlade.position.set(0, 1.26, 1.92);
      this.carGroup.add(leftStrut, rightStrut, wingBlade);

      const rearPlateGeo = new THREE.PlaneGeometry(1.65, 0.54);
      const rearPlateMat = new THREE.MeshBasicMaterial({
        map: this.textures.playerCar,
        side: THREE.DoubleSide
      });
      const rearPlate = new THREE.Mesh(rearPlateGeo, rearPlateMat);
      rearPlate.position.set(0, 0.58, 2.18);
      this.carGroup.add(rearPlate);

      const nozzleGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.38, 12);
      const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x333344, metalness: 0.8 });
      const flameGeo = new THREE.ConeGeometry(0.2, 1.25, 10);
      const flameMat = new THREE.MeshBasicMaterial({
        color: 0x00f3ff,
        transparent: true,
        opacity: 0.92
      });
      this.carFlameMat = flameMat;

      [-0.56, 0.56].forEach((xOffset) => {
        const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
        nozzle.rotation.x = Math.PI / 2;
        nozzle.position.set(xOffset, 0.36, 2.2);
        this.carGroup.add(nozzle);

        const flame = new THREE.Mesh(flameGeo, flameMat);
        flame.rotation.x = Math.PI / 2;
        flame.position.set(xOffset, 0.36, 2.8);
        this.carGroup.add(flame);
        this.carFlames.push(flame);
      });

      // 6. 4 Spinning Chunky Roblox Kart Wheels
      const wheelGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.42, 16);
      const wheelMat = new THREE.MeshStandardMaterial({
        color: 0x151522,
        roughness: 0.5
      });
      const rimGeo = new THREE.TorusGeometry(0.28, 0.05, 8, 16);
      const rimMat = new THREE.MeshBasicMaterial({ color: 0xffe600 });

      const wheelCoords = [
        [-1.22, 0.44, -1.35],
        [1.22, 0.44, -1.35],
        [-1.22, 0.44, 1.35],
        [1.22, 0.44, 1.35]
      ];
      wheelCoords.forEach(([wx, wy, wz]) => {
        const wheelHolder = new THREE.Group();
        wheelHolder.position.set(wx, wy, wz);

        const tire = new THREE.Mesh(wheelGeo, wheelMat);
        tire.rotation.z = Math.PI / 2;
        wheelHolder.add(tire);

        const rim = new THREE.Mesh(rimGeo, rimMat);
        rim.rotation.y = Math.PI / 2;
        rim.position.x = wx > 0 ? 0.21 : -0.21;
        wheelHolder.add(rim);

        this.carGroup.add(wheelHolder);
        this.carWheels.push(wheelHolder);
      });

      // 7. Neon Undercarriage Glow Plane
      const glowGeo = new THREE.PlaneGeometry(3.1, 5.2);
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0xff2a85,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide
      });
      this.carUnderGlow = new THREE.Mesh(glowGeo, glowMat);
      this.carUnderGlow.rotation.x = -Math.PI / 2;
      this.carUnderGlow.position.set(0, 0.03, 0);
      this.carGroup.add(this.carUnderGlow);

      return this.carGroup;
    },

    /**
     * Build High-Speed Wind / Speed-Line Particles flying past camera
     */
    _buildSpeedLines: function () {
      const THREE = global.THREE;
      const count = 75;
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 24;
        positions[i * 3 + 1] = 0.5 + Math.random() * 7;
        positions[i * 3 + 2] = -120 + Math.random() * 140;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        color: 0x00f3ff,
        size: 0.36,
        transparent: true,
        opacity: 0.65
      });
      this.speedLineParticles = new THREE.Points(geo, mat);
      this.scene.add(this.speedLineParticles);
    },

    /**
     * Build Stage Boss 3D Blocky Roblox Mecha ("단계별 로블록스 보스")
     * Positioned at BOSS_Z = -38, y = 2.8 so it is 100% visible below the top HUD banner!
     */
    _buildBossModel: function () {
      const THREE = global.THREE;
      this.bossGroup = new THREE.Group();
      this.bossGroup.position.set(0, 2.8, getCfg().BOSS_Z);
      this.bossGroup.visible = false;
      this.scene.add(this.bossGroup);

      // Central Billboard Plane displaying assets/boss_mecha.png
      const billGeo = new THREE.PlaneGeometry(5.6, 5.6);
      const billMat = new THREE.MeshBasicMaterial({
        map: this.textures.bossMecha,
        transparent: true,
        opacity: 0.96,
        side: THREE.DoubleSide
      });
      this.bossBillboardMesh = new THREE.Mesh(billGeo, billMat);
      this.bossBillboardMesh.position.set(0, 0.4, 1.15);
      this.bossGroup.add(this.bossBillboardMesh);

      // 3D Blocky Roblox Mecha Torso & Studded Shoulders behind billboard
      const torsoGeo = new THREE.BoxGeometry(5.2, 4.4, 2.6);
      this.bossArmorMat = new THREE.MeshStandardMaterial({
        color: 0x26083c,
        emissive: 0xff0055,
        emissiveIntensity: 0.5,
        metalness: 0.65,
        roughness: 0.25
      });
      this.bossCoreMesh = new THREE.Mesh(torsoGeo, this.bossArmorMat);
      this.bossCoreMesh.position.set(0, 0.3, -0.2);
      this.bossGroup.add(this.bossCoreMesh);

      // Blocky Shoulder Pads with Giant Golden Roblox Studs
      const padGeo = new THREE.BoxGeometry(2.2, 1.4, 2.8);
      const padMat = new THREE.MeshStandardMaterial({
        color: 0x151030,
        emissive: 0x00f3ff,
        emissiveIntensity: 0.45
      });
      const bossStudGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.24, 12);
      const bossStudMat = new THREE.MeshBasicMaterial({ color: 0xffe600 });

      [-3.6, 3.6].forEach((sx) => {
        const shoulder = new THREE.Mesh(padGeo, padMat);
        shoulder.position.set(sx, 2.1, 0);
        [-0.55, 0.55].forEach((ox) => {
          [-0.6, 0.6].forEach((oz) => {
            const stud = new THREE.Mesh(bossStudGeo, bossStudMat);
            stud.position.set(ox, 0.82, oz);
            shoulder.add(stud);
          });
        });
        this.bossGroup.add(shoulder);
      });

      // Rotating Energy Halo Rings around Boss
      const ring1Geo = new THREE.TorusGeometry(3.8, 0.13, 10, 36);
      const ring1Mat = new THREE.MeshBasicMaterial({ color: 0x00f3ff });
      this.bossRing1 = new THREE.Mesh(ring1Geo, ring1Mat);
      this.bossRing1.position.y = 0.4;
      this.bossGroup.add(this.bossRing1);

      const ring2Geo = new THREE.TorusGeometry(4.4, 0.1, 8, 32);
      const ring2Mat = new THREE.MeshBasicMaterial({ color: 0xff007f });
      this.bossRing2 = new THREE.Mesh(ring2Geo, ring2Mat);
      this.bossRing2.position.y = 0.4;
      this.bossRing2.rotation.x = Math.PI / 3;
      this.bossGroup.add(this.bossRing2);

      // Left Blocky Claw Arm
      const armGeo = new THREE.BoxGeometry(1.3, 3.2, 1.3);
      this.bossLeftArm = new THREE.Mesh(armGeo, padMat);
      this.bossLeftArm.position.set(-4.5, 0.1, 1.0);
      this.bossLeftArm.rotation.x = Math.PI / 3;
      this.bossGroup.add(this.bossLeftArm);

      // Right Arm wielding a Giant Blocky ROBLOX BAN-HAMMER (사이버 해머)!
      this.bossRightArm = new THREE.Group();
      this.bossRightArm.position.set(4.5, 0.6, 1.0);
      const rightArmMesh = new THREE.Mesh(armGeo, padMat);
      rightArmMesh.position.set(0, -0.6, 0);
      this.bossRightArm.add(rightArmMesh);

      // Giant Roblox Ban-Hammer
      this.bossHammerGroup = new THREE.Group();
      this.bossHammerGroup.position.set(0, -1.5, 0.8);
      const handleGeo = new THREE.CylinderGeometry(0.22, 0.22, 4.6, 10);
      const handleMat = new THREE.MeshBasicMaterial({ color: 0xffe600 });
      const handleMesh = new THREE.Mesh(handleGeo, handleMat);
      handleMesh.position.set(0, 1.6, 0);
      this.bossHammerGroup.add(handleMesh);

      const hammerHeadGeo = new THREE.BoxGeometry(2.6, 1.5, 1.6);
      const hammerHeadMat = new THREE.MeshStandardMaterial({
        color: 0xff0055,
        emissive: 0xff0055,
        emissiveIntensity: 0.65
      });
      const hammerHead = new THREE.Mesh(hammerHeadGeo, hammerHeadMat);
      hammerHead.position.set(0, 3.8, 0);
      this.bossHammerGroup.add(hammerHead);

      // Neon Cyan Impact Faces on Hammer Head
      const facePlateGeo = new THREE.BoxGeometry(2.72, 1.2, 1.2);
      const facePlateMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff });
      const facePlate = new THREE.Mesh(facePlateGeo, facePlateMat);
      facePlate.position.set(0, 3.8, 0);
      this.bossHammerGroup.add(facePlate);

      this.bossRightArm.add(this.bossHammerGroup);
      this.bossGroup.add(this.bossRightArm);

      // 3D Overhead Boss HP Bar in World Space (positioned at y = 4.1 so it stays below HUD banner)
      const hpBgGeo = new THREE.PlaneGeometry(7.6, 0.58);
      const hpBgMat = new THREE.MeshBasicMaterial({ color: 0x150520, side: THREE.DoubleSide });
      const hpBgMesh = new THREE.Mesh(hpBgGeo, hpBgMat);
      hpBgMesh.position.set(0, 4.1, 0.8);
      this.bossGroup.add(hpBgMesh);

      const hpFillGeo = new THREE.PlaneGeometry(7.2, 0.38);
      const hpFillMat = new THREE.MeshBasicMaterial({ color: 0x00ff9d, side: THREE.DoubleSide });
      this.bossHpFillMesh = new THREE.Mesh(hpFillGeo, hpFillMat);
      this.bossHpFillMesh.position.set(0, 4.1, 0.85);
      this.bossGroup.add(this.bossHpFillMesh);
    },

    /**
     * Start the 60fps animation loop
     */
    start: function () {
      if (!this.isInitialized) {
        this.init();
      }
      this.isRunning = true;
      this.isPaused = false;
      if (this.clock) this.clock.getDelta();
      if (!this.rafId) {
        this._animate();
      }
      return this;
    },

    /**
     * Stop the animation loop
     */
    stop: function () {
      this.isRunning = false;
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      return this;
    },

    /**
     * Pause or resume simulation
     */
    setPaused: function (paused) {
      this.isPaused = Boolean(paused);
      if (!this.isPaused && this.clock) {
        this.clock.getDelta();
      }
      return this;
    },

    pause: function () {
      return this.setPaused(true);
    },

    resume: function () {
      return this.setPaused(false);
    },

    /**
     * Reset track, gates, boss, and car to initial state
     */
    reset: function () {
      this.clearActiveGates();
      this.hideBoss();
      this.setLane(1);
      if (this.carGroup) {
        this.carGroup.position.x = 0;
        this.carGroup.rotation.set(0, 0, 0);
      }
      this.setSpeed(DEFAULT_CONFIG.BASE_SPEED);
      return this;
    },

    /**
     * Set player target lane (0 = Left, 1 = Center, 2 = Right)
     */
    setLane: function (laneIndex) {
      const clamped = Math.max(0, Math.min(2, Math.round(Number(laneIndex) || 0)));
      this.targetLane = clamped;
      this.currentLane = clamped;
      if (this.isPaused && this.carGroup) {
        const lanes = getCfg().LANES;
        this.carGroup.position.x = lanes[clamped] !== undefined ? lanes[clamped] : 0;
        this.carGroup.rotation.z = 0;
        this.carGroup.rotation.y = 0;
      }
      return this.targetLane;
    },

    moveLeft: function () {
      return this.setLane(this.targetLane - 1);
    },

    moveRight: function () {
      return this.setLane(this.targetLane + 1);
    },

    getCurrentLane: function () {
      return this.targetLane;
    },

    /**
     * Launches Soyun's Roblox Super Kart into a 3D Jump! (Used to clear Lava Hurdles in Obby Rush!)
     */
    jump: function () {
      if (this.isPaused) return false;
      if (this.carJumpY > 0.35 && this.carJumpVel > -2) {
        return false; // Already in mid-air
      }
      this.isJumping = true;
      this.carJumpVel = 15.2;
      this.avatarCheerTimer = 0.55;
      this.petSpinTimer = 0.55;
      this.cameraZoomPunch = 5.5;
      if (this.carGroup) {
        this._spawnParticleBurst(this.carGroup.position.x, 0.4, getCfg().GATE_PASS_Z, 0x00f3ff, 22, 0.9);
      }
      return true;
    },

    /**
     * Sets explicit view orientation mode ('auto' | 'portrait' | 'landscape') for mobile optimization
     */
    setViewOrientationMode: function (mode) {
      if (['auto', 'portrait', 'landscape'].includes(mode)) {
        this.viewOrientationMode = mode;
      } else {
        this.viewOrientationMode = 'auto';
      }
      this.resize();
      this.renderSingleFrame();
      return this.viewOrientationMode;
    },

    /**
     * Spawns a 3-Lane Roblox Obby Action Obstacle Wave at z = -82
     * @param {Object} waveConfig { waveIndex, totalWaves, lanes: ['block'|'hurdle'|'coin', ...] }
     */
    spawnObbyObstacleWave: function (waveConfig) {
      if (!this.isInitialized) this.init();
      const THREE = global.THREE;
      if (!THREE || !this.scene) return null;

      const cfg = getCfg();
      const lanes = cfg.LANES;
      const laneTypes = (waveConfig && Array.isArray(waveConfig.lanes) && waveConfig.lanes.length === 3)
        ? waveConfig.lanes
        : ['block', 'hurdle', 'coin'];

      const waveGroup = new THREE.Group();
      waveGroup.position.set(0, 0, -82);

      const disposables = {
        geometries: [],
        materials: [],
        textures: []
      };

      const coinMeshes = [];

      for (let i = 0; i < 3; i++) {
        const lx = lanes[i] !== undefined ? lanes[i] : (i - 1) * 4.5;
        const type = laneTypes[i];

        if (type === 'block') {
          // Tall Studded Roblox Hazard Block Wall (Must dodge left/right!)
          const wallGeo = new THREE.BoxGeometry(3.45, 3.6, 1.35);
          const wallMat = new THREE.MeshStandardMaterial({
            color: 0xff1e42,
            emissive: 0x990022,
            emissiveIntensity: 0.55,
            roughness: 0.25
          });
          disposables.geometries.push(wallGeo);
          disposables.materials.push(wallMat);

          const wallMesh = new THREE.Mesh(wallGeo, wallMat);
          wallMesh.position.set(lx, 1.8, 0);
          waveGroup.add(wallMesh);

          // Yellow/Black hazard warning stripe bar across front
          const stripeGeo = new THREE.BoxGeometry(3.52, 0.65, 1.42);
          const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffe600 });
          disposables.geometries.push(stripeGeo);
          disposables.materials.push(stripeMat);
          const stripeMesh = new THREE.Mesh(stripeGeo, stripeMat);
          stripeMesh.position.set(lx, 1.8, 0);
          waveGroup.add(stripeMesh);

          // Roblox studs on top of wall
          if (this.sharedStudGeo) {
            [-1.1, 0, 1.1].forEach((sx) => {
              const stud = new THREE.Mesh(this.sharedStudGeo, stripeMat);
              stud.scale.set(2.2, 2.5, 2.2);
              stud.position.set(lx + sx, 3.7, 0);
              waveGroup.add(stud);
            });
          }
        } else if (type === 'hurdle') {
          // Low Glowing Lava Kill-Brick Laser Hurdle (Must JUMP over!)
          const hurdleGeo = new THREE.BoxGeometry(3.85, 1.0, 0.95);
          const hurdleMat = new THREE.MeshBasicMaterial({
            color: 0xff3300
          });
          disposables.geometries.push(hurdleGeo);
          disposables.materials.push(hurdleMat);

          const hurdleMesh = new THREE.Mesh(hurdleGeo, hurdleMat);
          hurdleMesh.position.set(lx, 0.52, 0);
          waveGroup.add(hurdleMesh);

          // Glowing Neon Yellow Top Rail
          const railGeo = new THREE.BoxGeometry(3.9, 0.22, 1.02);
          const railMat = new THREE.MeshBasicMaterial({ color: 0xffe600 });
          disposables.geometries.push(railGeo);
          disposables.materials.push(railMat);
          const railMesh = new THREE.Mesh(railGeo, railMat);
          railMesh.position.set(lx, 1.05, 0);
          waveGroup.add(railMesh);

          // Floating Golden Robux Ring in mid-air above the hurdle (y = 2.75) so jumping grabs it!
          if (this.sharedRobuxGeo && this.sharedRobuxMaterial) {
            const airCoin = new THREE.Mesh(this.sharedRobuxGeo, this.sharedRobuxMaterial);
            airCoin.scale.set(1.55, 1.55, 1.55);
            airCoin.position.set(lx, 2.75, 0);
            waveGroup.add(airCoin);
            coinMeshes.push(airCoin);
          }
        } else {
          // Open Safe Lane with Spinning Golden Robux Ring + Green Boost Pad!
          const padGeo = new THREE.BoxGeometry(3.2, 0.12, 2.2);
          const padMat = new THREE.MeshBasicMaterial({
            color: 0x00ff88,
            transparent: true,
            opacity: 0.65
          });
          disposables.geometries.push(padGeo);
          disposables.materials.push(padMat);
          const padMesh = new THREE.Mesh(padGeo, padMat);
          padMesh.position.set(lx, 0.08, 0);
          waveGroup.add(padMesh);

          if (this.sharedRobuxGeo && this.sharedRobuxMaterial) {
            const coin = new THREE.Mesh(this.sharedRobuxGeo, this.sharedRobuxMaterial);
            coin.scale.set(1.65, 1.65, 1.65);
            coin.position.set(lx, 1.45, 0);
            waveGroup.add(coin);
            coinMeshes.push(coin);
          }
        }
      }

      this.scene.add(waveGroup);

      const waveObj = {
        group: waveGroup,
        lanes: laneTypes,
        waveIndex: waveConfig && waveConfig.waveIndex ? waveConfig.waveIndex : 1,
        totalWaves: waveConfig && waveConfig.totalWaves ? waveConfig.totalWaves : 8,
        passed: false,
        coinMeshes: coinMeshes,
        disposables: disposables
      };

      this.activeObbyWaves.push(waveObj);
      return waveObj;
    },

    /**
     * Clears all active Roblox Obby Mini-Game obstacle waves
     */
    clearObbyObstacles: function () {
      while (this.activeObbyWaves.length > 0) {
        const w = this.activeObbyWaves.pop();
        if (w && w.group && this.scene) {
          this.scene.remove(w.group);
        }
        if (w && w.disposables) {
          w.disposables.geometries.forEach((g) => g && g.dispose && g.dispose());
          w.disposables.materials.forEach((m) => m && m.dispose && m.dispose());
          w.disposables.textures.forEach((t) => t && t.dispose && t.dispose());
        }
      }
      return this;
    },

    /**
     * Set & get racing speed in km/h
     */
    setSpeed: function (speedKmh) {
      const val = Number(speedKmh);
      if (!isNaN(val)) {
        this.targetSpeed = Math.max(DEFAULT_CONFIG.MIN_SPEED, Math.min(DEFAULT_CONFIG.MAX_SPEED, val));
        this.currentSpeed = this.targetSpeed;
      }
      return this.currentSpeed;
    },

    getSpeed: function () {
      return Math.round(this.currentSpeed);
    },

    /**
     * Dynamically transition stage colors, fog, road grid, and sky theme
     */
    setStageTheme: function (stageConfig) {
      let theme = STAGE_THEMES[0];
      if (typeof stageConfig === 'number') {
        theme = STAGE_THEMES[(stageConfig - 1) % STAGE_THEMES.length] || STAGE_THEMES[0];
      } else if (stageConfig && typeof stageConfig === 'object') {
        const idx = (stageConfig.id || stageConfig.stage || 1) - 1;
        const base = STAGE_THEMES[Math.max(0, idx) % STAGE_THEMES.length] || STAGE_THEMES[0];
        theme = Object.assign({}, base);
        if (stageConfig.color || stageConfig.primaryColor || stageConfig.themeColor) {
          theme.primary = parseColorHex(stageConfig.color || stageConfig.primaryColor || stageConfig.themeColor, base.primary);
          theme.curbA = theme.primary;
          theme.mountainEdge = theme.primary;
        }
        if (stageConfig.secondaryColor || stageConfig.accentColor || stageConfig.bossColor) {
          theme.secondary = parseColorHex(stageConfig.secondaryColor || stageConfig.accentColor || stageConfig.bossColor, base.secondary);
          theme.curbB = theme.secondary;
        }
        if (stageConfig.roadColor) {
          theme.road = parseColorHex(stageConfig.roadColor, base.road);
        }
        if (stageConfig.fogColor || stageConfig.skyColor) {
          theme.fog = parseColorHex(stageConfig.fogColor || stageConfig.skyColor, base.fog);
        }
      }

      this.currentTheme = theme;
      if (!this.scene) return this;

      this.scene.background.setHex(theme.fog);
      if (this.scene.fog) this.scene.fog.color.setHex(theme.fog);
      if (this.outerGroundMat) this.outerGroundMat.color.setHex(theme.fog);
      if (this.roadSurfaceMat) this.roadSurfaceMat.color.setHex(theme.road);
      if (this.edgeRailMat) this.edgeRailMat.color.setHex(theme.primary);
      if (this.dashMaterial) this.dashMaterial.color.setHex(theme.primary);
      if (this.curbMatA) this.curbMatA.color.setHex(theme.curbA);
      if (this.curbMatB) this.curbMatB.color.setHex(theme.curbB);
      if (this.mountainMat) this.mountainMat.color.setHex(theme.mountain);
      if (this.mountainWireMat) this.mountainWireMat.color.setHex(theme.mountainEdge);
      if (this.carPointLight) this.carPointLight.color.setHex(theme.primary);
      if (this.retroSunMesh && this.retroSunMesh.material) {
        this.retroSunMesh.material.color.setHex(theme.secondary);
      }
      return this;
    },

    /**
     * Create a high-resolution CanvasTexture for a Gate Lane Signboard
     * Renders HUGE, ultra-legible answer text right from the start!
     */
    _createChoiceSignTexture: function (laneIndex, choiceText, accentHex) {
      const THREE = global.THREE;
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 420;
      const ctx = canvas.getContext('2d');

      const laneColors = ['#00f3ff', '#ffe600', '#ff2a85'];
      const borderColor = accentHex ? hexToCss(accentHex) : laneColors[laneIndex] || '#00f3ff';

      // High-contrast dark backdrop
      const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bgGrad.addColorStop(0, 'rgba(6, 10, 32, 0.98)');
      bgGrad.addColorStop(1, 'rgba(20, 6, 42, 0.98)');
      ctx.fillStyle = bgGrad;
      roundRectPath(ctx, 10, 10, canvas.width - 20, canvas.height - 20, 28);
      ctx.fill();

      // Thick glowing neon border
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 16;
      roundRectPath(ctx, 14, 14, canvas.width - 28, canvas.height - 28, 24);
      ctx.stroke();

      // Only show top badge for Speech Microphone sign; normal 3-lane boards use 100% of board for HUGE Answer text!
      const rawChoiceStr = String(choiceText !== undefined && choiceText !== null ? choiceText : '');
      const isSpeechSign = rawChoiceStr.startsWith('🎤');
      if (isSpeechSign) {
        ctx.fillStyle = borderColor;
        roundRectPath(ctx, 24, 22, 148, 52, 14);
        ctx.fill();

        ctx.fillStyle = '#050614';
        ctx.font = '900 30px "Malgun Gothic", "Orbitron", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🎤 말하기', 98, 49);
      }

      // Giant Answer Text filling 100% of the signboard
      const text = rawChoiceStr.trim();
      const maxWidth = canvas.width - 36;
      const fontFamily = '"Malgun Gothic", "Pretendard", "Apple SD Gothic Neo", "Orbitron", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#040614';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = borderColor;
      ctx.shadowBlur = 22;

      // Determine whether 2-line split gives much larger text (e.g. multi-word English or Korean > 4 chars)
      const hasSpaceOrSlash = text.indexOf(' ') > 0 || text.indexOf('/') > 0;
      const shouldSplitTwoLines = (hasSpaceOrSlash && text.length >= 6) || text.length >= 6;

      if (shouldSplitTwoLines) {
        const mid = Math.ceil(text.length / 2);
        let splitIdx = text.lastIndexOf('/', mid + 2);
        if (splitIdx <= 0) splitIdx = text.lastIndexOf(' ', mid + 4);
        if (splitIdx <= 0) splitIdx = text.indexOf(' ');
        if (splitIdx <= 0) splitIdx = mid;
        else splitIdx += 1;

        const line1 = text.slice(0, splitIdx).trim();
        const line2 = text.slice(splitIdx).trim();

        if (line1 && line2) {
          let fontSize = isSpeechSign ? 176 : 212;
          while (fontSize > 96) {
            ctx.font = `900 ${fontSize}px ${fontFamily}`;
            const w1 = ctx.measureText(line1).width;
            const w2 = ctx.measureText(line2).width;
            if (Math.max(w1, w2) <= maxWidth) break;
            fontSize -= 6;
          }
          ctx.font = `900 ${fontSize}px ${fontFamily}`;
          ctx.lineWidth = Math.max(14, Math.round(fontSize * 0.095));
          const y1 = isSpeechSign ? 166 : 126;
          const y2 = isSpeechSign ? 314 : 302;
          ctx.strokeText(line1, canvas.width / 2, y1, maxWidth);
          ctx.fillText(line1, canvas.width / 2, y1, maxWidth);
          ctx.strokeText(line2, canvas.width / 2, y2, maxWidth);
          ctx.fillText(line2, canvas.width / 2, y2, maxWidth);
        } else {
          let fontSize = 286;
          while (fontSize > 110) {
            ctx.font = `900 ${fontSize}px ${fontFamily}`;
            if (ctx.measureText(text).width <= maxWidth) break;
            fontSize -= 8;
          }
          ctx.font = `900 ${fontSize}px ${fontFamily}`;
          ctx.lineWidth = Math.max(16, Math.round(fontSize * 0.095));
          const cy = isSpeechSign ? 242 : 214;
          ctx.strokeText(text, canvas.width / 2, cy, maxWidth);
          ctx.fillText(text, canvas.width / 2, cy, maxWidth);
        }
      } else {
        let fontSize = 292;
        while (fontSize > 120) {
          ctx.font = `900 ${fontSize}px ${fontFamily}`;
          if (ctx.measureText(text).width <= maxWidth) break;
          fontSize -= 8;
        }
        ctx.font = `900 ${fontSize}px ${fontFamily}`;
        ctx.lineWidth = Math.max(16, Math.round(fontSize * 0.095));
        const cy = isSpeechSign ? 242 : 214;
        ctx.strokeText(text, canvas.width / 2, cy, maxWidth);
        ctx.fillText(text, canvas.width / 2, cy, maxWidth);
      }

      ctx.shadowBlur = 0;

      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      return texture;
    },

    /**
     * Spawn a 3-Lane Overhead Roblox Obby Quiz Gate at GATE_SPAWN_Z (-88)
     */
    spawnQuestionGate: function (questionData) {
      if (!this.isInitialized) this.init();
      const THREE = global.THREE;
      if (!THREE || !this.scene) return null;

      const cfg = getCfg();
      const lanes = cfg.LANES;
      const qData = questionData || {
        question: '3 + 4 = ?',
        choices: ['6', '7', '8'],
        correctLane: 1
      };
      const choices = Array.isArray(qData.choices)
        ? qData.choices
        : Array.isArray(qData.options)
        ? qData.options
        : ['1', '2', '3'];
      const correctLane =
        typeof qData.correctLane === 'number'
          ? qData.correctLane
          : typeof qData.correctIndex === 'number'
          ? qData.correctIndex
          : typeof qData.answerIndex === 'number'
          ? qData.answerIndex
          : 0;

      const gateGroup = new THREE.Group();
      gateGroup.position.set(0, 0, cfg.GATE_SPAWN_Z);
      // Start scaled up when far away so the 3 answer signboards are BIG right from the start,
      // while adapting automatically on narrow mobile portrait screens so all 3 lanes fit 100%!
      const initScale = this._getAdaptiveGateScale(0);
      gateGroup.scale.set(initScale, initScale, 1);

      const disposables = {
        geometries: [],
        materials: [],
        textures: []
      };

      // 1. Left & Right Roblox Block Pillars + Studded Overhead Crossbar
      const pillarGeo = new THREE.BoxGeometry(0.65, 6.4, 0.65);
      const pillarMat = new THREE.MeshStandardMaterial({
        color: 0x161233,
        emissive: this.currentTheme.primary,
        emissiveIntensity: 0.6
      });
      disposables.geometries.push(pillarGeo);
      disposables.materials.push(pillarMat);

      [-7.4, 7.4].forEach((px) => {
        const pillar = new THREE.Mesh(pillarGeo, pillarMat);
        pillar.position.set(px, 3.2, 0);
        gateGroup.add(pillar);
      });

      const stanchionGeo = new THREE.BoxGeometry(0.28, 5.6, 0.28);
      disposables.geometries.push(stanchionGeo);
      [-2.25, 2.25].forEach((sx) => {
        const stanchion = new THREE.Mesh(stanchionGeo, pillarMat);
        stanchion.position.set(sx, 2.8, 0);
        gateGroup.add(stanchion);
      });

      const beamGeo = new THREE.BoxGeometry(15.6, 0.56, 0.68);
      const beamMat = new THREE.MeshBasicMaterial({ color: this.currentTheme.primary });
      disposables.geometries.push(beamGeo);
      disposables.materials.push(beamMat);
      const topBeam = new THREE.Mesh(beamGeo, beamMat);
      topBeam.position.set(0, 6.1, 0);
      gateGroup.add(topBeam);

      // 2. Three Lane Choice Signboards (LARGE 4.62 x 3.95 boards!) + Smashable Blocky Energy Curtains
      const signGeo = new THREE.PlaneGeometry(4.62, 3.95);
      const curtainGeo = new THREE.PlaneGeometry(4.1, 2.7);
      disposables.geometries.push(signGeo, curtainGeo);

      const laneColors = [0x00f3ff, 0xffe600, 0xff2a85];
      const curtains = [];
      const hazardMeshes = [];

      for (let i = 0; i < 3; i++) {
        const laneX = lanes[i] !== undefined ? lanes[i] : (i - 1) * 4.5;
        const signTex = this._createChoiceSignTexture(i, choices[i], laneColors[i]);
        disposables.textures.push(signTex);

        const signMat = new THREE.MeshBasicMaterial({
          map: signTex,
          transparent: true,
          side: THREE.DoubleSide,
          fog: false
        });
        disposables.materials.push(signMat);

        const signMesh = new THREE.Mesh(signGeo, signMat);
        signMesh.position.set(laneX, 4.35, 0.15);
        gateGroup.add(signMesh);

        const curtainMat = new THREE.MeshBasicMaterial({
          color: laneColors[i],
          transparent: true,
          opacity: 0.26,
          side: THREE.DoubleSide
        });
        disposables.materials.push(curtainMat);

        const curtainMesh = new THREE.Mesh(curtainGeo, curtainMat);
        curtainMesh.position.set(laneX, 1.45, 0);
        gateGroup.add(curtainMesh);
        curtains.push(curtainMesh);

        const hazardGeo = new THREE.PlaneGeometry(3.9, 2.1);
        const hazardMat = new THREE.MeshBasicMaterial({
          map: this.textures.obstacleBarrier,
          transparent: true,
          opacity: 0.0,
          side: THREE.DoubleSide
        });
        disposables.geometries.push(hazardGeo);
        disposables.materials.push(hazardMat);

        const hazardMesh = new THREE.Mesh(hazardGeo, hazardMat);
        hazardMesh.position.set(laneX, 1.2, 0.35);
        hazardMesh.visible = false;
        gateGroup.add(hazardMesh);
        hazardMeshes.push(hazardMesh);
      }

      this.scene.add(gateGroup);

      const gateObj = {
        group: gateGroup,
        questionData: Object.assign({}, qData, { choices, correctLane }),
        passed: false,
        progress: 0,
        curtains,
        hazardMeshes,
        disposables
      };

      this.activeGates.push(gateObj);
      return gateObj;
    },

    /**
     * Remove & dispose a single gate object
     */
    _disposeGate: function (gateObj) {
      if (!gateObj) return;
      if (gateObj.group && this.scene) {
        this.scene.remove(gateObj.group);
      }
      if (gateObj.disposables) {
        gateObj.disposables.geometries.forEach((g) => g && g.dispose && g.dispose());
        gateObj.disposables.materials.forEach((m) => m && m.dispose && m.dispose());
        gateObj.disposables.textures.forEach((t) => t && t.dispose && t.dispose());
      }
    },

    /**
     * Clear all active question gates from the highway
     */
    clearActiveGates: function () {
      while (this.activeGates.length > 0) {
        const gate = this.activeGates.pop();
        this._disposeGate(gate);
      }
      return this;
    },

    /**
     * Return active gate telemetry for HUD & automated testing
     */
    getActiveGateInfo: function () {
      const nextGate = this.activeGates.find((g) => !g.passed) || this.activeGates[0] || null;
      if (!nextGate) {
        return {
          hasGate: false,
          z: null,
          progress: 0,
          questionData: null,
          correctLane: null,
          choices: null
        };
      }
      return {
        hasGate: !nextGate.passed,
        z: nextGate.group.position.z,
        progress: nextGate.progress,
        questionData: nextGate.questionData,
        correctLane: nextGate.questionData.correctLane,
        choices: nextGate.questionData.choices
      };
    },

    /**
     * Test helper / fast-forward to immediately resolve the active gate
     */
    forcePassActiveGate: function (laneOverride) {
      const nextGate = this.activeGates.find((g) => !g.passed);
      if (!nextGate) return false;
      if (typeof laneOverride === 'number') {
        this.setLane(laneOverride);
      }
      const cfg = getCfg();
      nextGate.group.position.z = cfg.GATE_PASS_Z + 0.1;
      this._evaluateGatePass(nextGate);
      return true;
    },

    /**
     * Immediately resolves the active Speech (Pronunciation) Gate when Soyun says the target word into the mic!
     */
    resolveSpeechGatePass: function (spokenText) {
      const nextGate = this.activeGates.find((g) => !g.passed);
      if (!nextGate || !nextGate.questionData) return false;
      nextGate.questionData.speechPassed = true;
      nextGate.questionData.spokenText = spokenText || nextGate.questionData.answerText;
      const cfg = getCfg();
      nextGate.group.position.z = cfg.GATE_PASS_Z + 0.1;
      this._evaluateGatePass(nextGate);
      return true;
    },

    /**
     * Evaluate gate collision / answer check when gate reaches player car Z
     */
    _evaluateGatePass: function (gate) {
      if (!gate || gate.passed) return;
      gate.passed = true;
      gate.progress = 1.0;

      const currentLaneIndex = this.targetLane;
      const isSpeechGate = Boolean(gate.questionData && gate.questionData.isSpeech);
      const correctLane = gate.questionData.correctLane;
      const isCorrect = isSpeechGate
        ? Boolean(gate.questionData.speechPassed)
        : (currentLaneIndex === correctLane);
      const lanes = getCfg().LANES;
      const laneX = lanes[currentLaneIndex] || 0;

      if (isCorrect) {
        // Shatter the gate curtain on the correct lane (or all 3 lanes for a Speech Gate!)
        if (isSpeechGate && Array.isArray(gate.curtains)) {
          gate.curtains.forEach((c) => {
            if (c) c.visible = false;
          });
        } else if (gate.curtains[currentLaneIndex]) {
          gate.curtains[currentLaneIndex].visible = false;
        }
        this.triggerCorrectEffect(laneX);
        if (this.isBossActive) {
          this.lastAutoLaserTime = performance.now();
          this._fireLaserAtBoss();
        }
      } else {
        if (gate.hazardMeshes && gate.hazardMeshes[currentLaneIndex]) {
          const hMesh = gate.hazardMeshes[currentLaneIndex];
          hMesh.visible = true;
          hMesh.material.opacity = 1.0;
        }
        if (gate.curtains[currentLaneIndex]) {
          gate.curtains[currentLaneIndex].material.color.setHex(0xff0044);
          gate.curtains[currentLaneIndex].material.opacity = 0.85;
        }
        this.triggerDamageEffect(laneX);
      }

      if (typeof this.onGatePass === 'function') {
        this.onGatePass(currentLaneIndex, gate.questionData, isCorrect);
      }
    },

    /**
     * Spawn 40+ 3D colorful Roblox Bricks + Golden Robux (R$) Rings that spin & bounce off the road!
     */
    spawnBrickExplosion: function (x, y, z, brickCount, isBossHit) {
      const THREE = global.THREE;
      if (!THREE || !this.scene) return;
      if (!this.sharedBrickGeo) this._initSharedBrickAssets();

      const count = typeof brickCount === 'number' ? brickCount : 44;

      // Cap total active bricks to keep 60fps rock-solid
      while (this.activeBricks.length > 160) {
        const oldest = this.activeBricks.shift();
        if (oldest && oldest.mesh) this.scene.remove(oldest.mesh);
      }

      for (let i = 0; i < count; i++) {
        const isRobuxCoin = i % 5 === 0;
        const mat = isRobuxCoin
          ? this.sharedRobuxMaterial
          : this.sharedBrickMaterials[i % this.sharedBrickMaterials.length];
        const geo = isRobuxCoin ? this.sharedRobuxGeo : this.sharedBrickGeo;
        const mesh = new THREE.Mesh(geo, mat);

        const scale = isRobuxCoin ? 0.85 : 0.42 + Math.random() * 0.42;
        mesh.scale.set(scale, scale, scale);

        mesh.position.set(
          x + (Math.random() - 0.5) * 3.2,
          Math.max(0.4, y + (Math.random() - 0.3) * 2.4),
          z + (Math.random() - 0.5) * 1.8
        );

        mesh.rotation.set(
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          Math.random() * Math.PI
        );

        this.scene.add(mesh);

        const spread = isBossHit ? 26 : 19;
        this.activeBricks.push({
          mesh,
          baseScale: scale,
          vx: (Math.random() - 0.5) * spread,
          vy: 7 + Math.random() * 14,
          vz: isBossHit ? (Math.random() - 0.3) * 22 : -10 + Math.random() * 26,
          rx: (Math.random() - 0.5) * 18,
          ry: (Math.random() - 0.5) * 18,
          rz: (Math.random() - 0.5) * 18,
          age: 0,
          maxAge: 1.05 + Math.random() * 0.35
        });
      }
    },

    _spawnBrickExplosion: function (x, y, z, brickCount, isBossHit) {
      return this.spawnBrickExplosion(x, y, z, brickCount, isBossHit);
    },

    /**
     * Spawn 3D particle burst at world position
     */
    _spawnParticleBurst: function (x, y, z, colorHex, count, speedScale) {
      const THREE = global.THREE;
      if (!THREE || !this.scene) return;

      const num = count || 36;
      const positions = new Float32Array(num * 3);
      const velocities = [];
      const spd = speedScale || 1.0;

      for (let i = 0; i < num; i++) {
        positions[i * 3] = x + (Math.random() - 0.5) * 1.2;
        positions[i * 3 + 1] = y + (Math.random() - 0.5) * 1.2;
        positions[i * 3 + 2] = z + (Math.random() - 0.5) * 1.2;

        velocities.push({
          vx: (Math.random() - 0.5) * 18 * spd,
          vy: (Math.random() * 12 + 2) * spd,
          vz: (Math.random() - 0.5) * 18 * spd
        });
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        color: colorHex,
        size: 0.48,
        transparent: true,
        opacity: 1.0
      });
      const points = new THREE.Points(geo, mat);
      this.scene.add(points);

      this.particleBursts.push({
        points,
        geo,
        mat,
        velocities,
        age: 0,
        maxAge: 0.75
      });
    },

    /**
     * Builds a 3D Blocky Super Bomb / Mega Missile Mesh with glowing warhead, fins, and thruster flame!
     */
    _createBombProjectileMesh: function (scale, mainColorHex) {
      const THREE = global.THREE;
      const bombGroup = new THREE.Group();
      const s = scale || 1.0;

      // 1. Bomb Spherical Core Body
      const coreGeo = new THREE.SphereGeometry(0.78 * s, 14, 14);
      const coreMat = new THREE.MeshStandardMaterial({
        color: 0x1a1428,
        emissive: mainColorHex || 0xff1e42,
        emissiveIntensity: 0.65,
        roughness: 0.25,
        metalness: 0.65
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      bombGroup.add(coreMesh);

      // 2. Glowing Warhead Nose Cone pointing forward (-Z)
      const noseGeo = new THREE.ConeGeometry(0.58 * s, 0.95 * s, 12);
      noseGeo.rotateX(-Math.PI / 2);
      const noseMat = new THREE.MeshBasicMaterial({ color: 0xffe600 });
      const noseMesh = new THREE.Mesh(noseGeo, noseMat);
      noseMesh.position.set(0, 0, -0.82 * s);
      bombGroup.add(noseMesh);

      // 3. Glowing Hazard Ring around Bomb Equator
      const ringGeo = new THREE.TorusGeometry(0.84 * s, 0.12 * s, 8, 20);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      bombGroup.add(ringMesh);

      // 4. 4 Cross Tail Fins
      const finGeo = new THREE.BoxGeometry(1.65 * s, 0.14 * s, 0.55 * s);
      const finMat = new THREE.MeshBasicMaterial({ color: mainColorHex || 0xff1e42 });
      const finA = new THREE.Mesh(finGeo, finMat);
      finA.position.set(0, 0, 0.55 * s);
      const finB = new THREE.Mesh(finGeo, finMat);
      finB.rotation.z = Math.PI / 2;
      finB.position.set(0, 0, 0.55 * s);
      bombGroup.add(finA, finB);

      // 5. Blazing Rear Rocket Thruster Flame Cone (+Z)
      const flameGeo = new THREE.ConeGeometry(0.52 * s, 1.65 * s, 10);
      flameGeo.rotateX(Math.PI / 2);
      const flameMat = new THREE.MeshBasicMaterial({
        color: 0xff9900,
        transparent: true,
        opacity: 0.95
      });
      const flameMesh = new THREE.Mesh(flameGeo, flameMat);
      flameMesh.position.set(0, 0, 1.25 * s);
      bombGroup.add(flameMesh);

      return {
        group: bombGroup,
        disposables: [coreGeo, coreMat, noseGeo, noseMat, ringGeo, ringMat, finGeo, finMat, flameGeo, flameMat]
      };
    },

    /**
     * Triggers the massive explosion at the Boss when a 3D Bomb slams into it!
     */
    _triggerBombBossImpact: function (impactPos) {
      const THREE = global.THREE;
      if (!THREE || !this.scene) return;

      const pos = impactPos || (this.bossGroup
        ? new THREE.Vector3(this.bossGroup.position.x, this.bossGroup.position.y + 0.5, this.bossGroup.position.z + 1.8)
        : new THREE.Vector3(0, 3.3, -36));

      // Expanding 3D Fireball Shockwave Sphere + Blast Ring
      const shockGeo = new THREE.SphereGeometry(2.2, 16, 16);
      const shockMat = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        transparent: true,
        opacity: 0.92
      });
      const shockMesh = new THREE.Mesh(shockGeo, shockMat);
      shockMesh.position.copy(pos);
      this.scene.add(shockMesh);

      this.activeLasers.push({
        mesh: shockMesh,
        geo: shockGeo,
        mat: shockMat,
        isShockwave: true,
        age: 0,
        maxAge: 0.42
      });

      const ringGeo = new THREE.TorusGeometry(2.6, 0.35, 10, 28);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x00f3ff,
        transparent: true,
        opacity: 0.95
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.copy(pos);
      this.scene.add(ringMesh);

      this.activeLasers.push({
        mesh: ringMesh,
        geo: ringGeo,
        mat: ringMat,
        isShockwave: true,
        age: 0,
        maxAge: 0.45
      });

      // Violent Boss Knockback Recoil + 52+ Exploding Roblox Bricks off Boss Armor!
      this.bossHitTimer = 0.55;
      this.bossRecoilZ = -9.5;
      this.bossRecoilPitch = -0.68;
      this.shakeIntensity = 0.85;
      this.shakeTimer = 0.42;
      this.cameraZoomPunch = 14.5;

      this.spawnBrickExplosion(pos.x, pos.y, pos.z, 52, true);
      this._spawnParticleBurst(pos.x, pos.y, pos.z, 0xff5500, 60, 2.0);
      this._spawnParticleBurst(pos.x, pos.y, pos.z, 0xffe600, 48, 1.8);
      this._spawnParticleBurst(pos.x, pos.y, pos.z, 0x00f3ff, 40, 1.6);

      if (global.SoundEngine && typeof global.SoundEngine.playBossHit === 'function') {
        global.SoundEngine.playBossHit();
      }
    },

    /**
     * Launch Giant 3D Super Bomb + Companion Pet Bomb flying in a high parabolic arc
     * and slamming directly into the Boss, accompanied by Twin Target Lock Lasers!
     */
    _fireLaserAtBoss: function () {
      const THREE = global.THREE;
      if (!THREE || !this.scene || !this.bossGroup || !this.carGroup) return;

      const kartStart = new THREE.Vector3(
        this.carGroup.position.x,
        1.45,
        this.carGroup.position.z - 1.2
      );
      const petStart = new THREE.Vector3(
        this.carGroup.position.x + 1.65,
        2.2,
        this.carGroup.position.z + 0.2
      );
      const endPos = new THREE.Vector3(
        this.bossGroup.position.x,
        this.bossGroup.position.y + 0.5,
        this.bossGroup.position.z + 1.8
      );

      // 1. Launch Giant 3D Bomb Projectile from Soyun's Kart + Companion Bomb from Cube Pet!
      const mainBomb = this._createBombProjectileMesh(1.35, 0xff1e42);
      mainBomb.group.position.copy(kartStart);
      this.scene.add(mainBomb.group);

      this.activeProjectiles.push({
        group: mainBomb.group,
        disposables: mainBomb.disposables,
        startPos: kartStart.clone(),
        endPos: endPos.clone(),
        arcHeight: 6.2,
        age: 0,
        duration: 0.34,
        isPrimaryBomb: true
      });

      const petBomb = this._createBombProjectileMesh(0.85, 0xff2a85);
      petBomb.group.position.copy(petStart);
      this.scene.add(petBomb.group);

      this.activeProjectiles.push({
        group: petBomb.group,
        disposables: petBomb.disposables,
        startPos: petStart.clone(),
        endPos: endPos.clone(),
        arcHeight: 4.8,
        age: 0,
        duration: 0.36,
        isPrimaryBomb: false
      });

      // 2. Twin Target-Lock Laser Beams from Kart & Pet
      const beams = [
        { start: kartStart, color: 0x00f3ff, r1: 0.22, r2: 0.38 },
        { start: petStart, color: 0xff2a85, r1: 0.18, r2: 0.30 }
      ];

      beams.forEach((b) => {
        const dist = b.start.distanceTo(endPos);
        const beamGeo = new THREE.CylinderGeometry(b.r1, b.r2, dist, 10);
        beamGeo.rotateX(Math.PI / 2);
        const beamMat = new THREE.MeshBasicMaterial({
          color: b.color,
          transparent: true,
          opacity: 0.88
        });
        const beamMesh = new THREE.Mesh(beamGeo, beamMat);
        beamMesh.position.copy(b.start).lerp(endPos, 0.5);
        beamMesh.lookAt(endPos);
        this.scene.add(beamMesh);

        this.activeLasers.push({
          mesh: beamMesh,
          geo: beamGeo,
          mat: beamMat,
          age: 0,
          maxAge: 0.32
        });
      });

      // 3. Immediate launch feedback + initial recoil (followed by huge bomb impact at t=0.34s!)
      this.bossHitTimer = 0.48;
      this.bossRecoilZ = -5.5;
      this.bossRecoilPitch = -0.38;
      this.shakeIntensity = 0.58;
      this.shakeTimer = 0.32;

      this.spawnBrickExplosion(endPos.x, endPos.y, endPos.z, 28, true);
      this._spawnParticleBurst(kartStart.x, kartStart.y, kartStart.z, 0xffe600, 24, 1.2);
    },

    /**
     * Trigger massive Roblox Brick Shatter, FOV Zoom Punch, and Soyun + Pet celebration on correct answer!
     */
    triggerCorrectEffect: function (laneX) {
      const x = typeof laneX === 'number' ? laneX : this.carGroup ? this.carGroup.position.x : 0;
      const z = getCfg().GATE_PASS_Z;

      this.boostEffectTimer = 0.55;
      this.avatarCheerTimer = 0.65;
      this.petSpinTimer = 0.75;

      // Energetic Camera FOV Zoom Punch & Impact Shake ("타격감"!)
      this.cameraZoomPunch = 10.5;
      this.shakeIntensity = 0.42;
      this.shakeTimer = 0.24;

      // Burst 44+ 3D colorful Roblox Bricks + Golden Robux Coins out of the smashed gate!
      this.spawnBrickExplosion(x, 1.8, z - 1.2, 44, false);

      this._spawnParticleBurst(x, 1.6, z - 1.0, 0x00ff9d, 42, 1.25);
      this._spawnParticleBurst(x, 2.2, z - 1.5, 0xffe600, 32, 1.15);
      return this;
    },

    triggerBoostEffect: function () {
      return this.triggerCorrectEffect();
    },

    /**
     * Trigger camera shake, red car flash, and hazard impact particles on wrong answer
     */
    triggerDamageEffect: function (laneX) {
      const x = typeof laneX === 'number' ? laneX : this.carGroup ? this.carGroup.position.x : 0;
      const z = getCfg().GATE_PASS_Z;
      this.shakeIntensity = 0.72;
      this.shakeTimer = 0.45;
      this.damageFlashTimer = 0.48;
      this.cameraZoomPunch = -6.0;
      this._spawnParticleBurst(x, 1.4, z - 0.8, 0xff0044, 48, 1.35);
      this._spawnParticleBurst(x, 1.8, z - 0.5, 0xffbe0b, 26, 1.0);
      return this;
    },

    /**
     * Trigger celebratory multi-burst fireworks & Roblox Brick fountain on stage clear
     */
    triggerStageClearEffect: function () {
      this.stageClearTimer = 1.2;
      this.boostEffectTimer = 1.0;
      this.avatarCheerTimer = 1.2;
      this.petSpinTimer = 1.2;
      this.spawnBrickExplosion(0, 3.5, -6, 50, true);
      this._spawnParticleBurst(-5, 5, -15, 0x00f3ff, 50, 1.6);
      this._spawnParticleBurst(5, 6, -18, 0xff007f, 50, 1.6);
      this._spawnParticleBurst(0, 7, -12, 0xffe600, 60, 1.8);
      return this;
    },

    /**
     * Spawn Stage Boss Mecha at BOSS_Z = -38, y = 2.8
     */
    spawnBoss: function (stageConfig) {
      if (!this.isInitialized) this.init();
      this.isBossActive = true;
      this.bossDefeating = false;
      this.bossHpRatio = 1.0;
      this.bossHitTimer = 0;
      this.bossRecoilZ = 0;
      this.bossRecoilPitch = 0;

      if (this.bossGroup) {
        this.bossGroup.visible = true;
        this.bossGroup.position.set(0, 2.8, getCfg().BOSS_Z - 26);
        this.bossGroup.rotation.set(0, 0, 0);
        this.bossGroup.scale.set(1, 1, 1);
      }

      if (stageConfig && this.bossArmorMat) {
        const tint = parseColorHex(
          stageConfig.bossColor || stageConfig.color || stageConfig.themeColor,
          this.currentTheme.secondary
        );
        this.bossArmorMat.emissive.setHex(tint);
        if (this.bossRing2 && this.bossRing2.material) {
          this.bossRing2.material.color.setHex(tint);
        }
      }

      this._updateBossHpBar(1.0);
      return this;
    },

    /**
     * Damage the active Stage Boss and fire player + pet twin mega laser
     */
    damageBoss: function (newHpRatio) {
      if (!this.isBossActive && this.bossGroup) {
        this.isBossActive = true;
        this.bossGroup.visible = true;
      }

      if (typeof newHpRatio === 'number') {
        this.bossHpRatio = Math.max(0, Math.min(1, newHpRatio));
      } else {
        this.bossHpRatio = Math.max(0, this.bossHpRatio - 0.25);
      }

      this._updateBossHpBar(this.bossHpRatio);

      const now = performance.now();
      if (now - this.lastAutoLaserTime > 120) {
        this._fireLaserAtBoss();
      } else {
        this.bossHitTimer = 0.42;
      }
      return this;
    },

    _updateBossHpBar: function (ratio) {
      if (!this.bossHpFillMesh) return;
      const clamped = Math.max(0.001, Math.min(1, ratio));
      this.bossHpFillMesh.scale.x = clamped;
      this.bossHpFillMesh.position.x = -3.6 * (1 - clamped);
      if (clamped > 0.5) {
        this.bossHpFillMesh.material.color.setHex(0x00ff9d);
      } else if (clamped > 0.25) {
        this.bossHpFillMesh.material.color.setHex(0xffbe0b);
      } else {
        this.bossHpFillMesh.material.color.setHex(0xff0055);
      }
    },

    /**
     * Trigger dramatic multi-burst Boss defeat sequence with massive Roblox Brick explosion
     */
    defeatBoss: function (onComplete) {
      this._updateBossHpBar(0);
      this.bossDefeating = true;
      this.bossDefeatTimer = 0;
      this.bossDefeatCallback = typeof onComplete === 'function' ? onComplete : null;

      if (this.bossGroup) {
        const bx = this.bossGroup.position.x;
        const by = this.bossGroup.position.y;
        const bz = this.bossGroup.position.z;
        this.spawnBrickExplosion(bx, by + 1, bz + 2, 60, true);
        this._spawnParticleBurst(bx, by, bz, 0xff0055, 70, 2.2);
        this._spawnParticleBurst(bx - 3, by + 1, bz + 2, 0xffe600, 55, 1.9);
        this._spawnParticleBurst(bx + 3, by - 1, bz + 2, 0x00f3ff, 55, 1.9);
      }

      this.shakeIntensity = 0.65;
      this.shakeTimer = 0.55;
      this.cameraZoomPunch = 12.0;
      return this;
    },

    /**
     * Hide/remove Boss immediately
     */
    hideBoss: function () {
      this.isBossActive = false;
      this.bossDefeating = false;
      this.bossDefeatCallback = null;
      if (this.bossGroup) {
        this.bossGroup.visible = false;
      }
      while (this.activeProjectiles && this.activeProjectiles.length > 0) {
        const p = this.activeProjectiles.pop();
        if (p && p.group && this.scene) {
          this.scene.remove(p.group);
        }
        if (p && Array.isArray(p.disposables)) {
          p.disposables.forEach((d) => d && d.dispose && d.dispose());
        }
      }
      return this;
    },

    isBossSpawned: function () {
      return Boolean(this.isBossActive && this.bossGroup && this.bossGroup.visible);
    },

    /**
     * Computes portrait factor (0 on desktop/landscape, up to 1 on narrow mobile portrait screens)
     * Respects explicit user selection ('portrait' | 'landscape' | 'auto')
     */
    _getPortraitFactor: function () {
      if (this.viewOrientationMode === 'portrait') {
        return 0.96;
      }
      if (this.viewOrientationMode === 'landscape') {
        return 0.0;
      }
      const aspect = (this.camera && this.camera.aspect) ? this.camera.aspect : 1.77;
      return Math.max(0, Math.min(1, (1.15 - aspect) / 0.72));
    },

    /**
     * Computes adaptive 3D gate scale at normalized progress (0.0 at spawn -> 1.0 at player pass)
     * Ensures 3-lane signboards are huge from the start AND never clip horizontally on portrait phones.
     */
    _getAdaptiveGateScale: function (progress) {
      const p = Math.max(0, Math.min(1, Number(progress) || 0));
      const pf = this._getPortraitFactor();
      const initScale = Math.max(1.62, 2.25 - pf * 0.55);
      const endScale = Math.max(0.95, 1.05 - pf * 0.08);
      return initScale - p * (initScale - endScale);
    },

    /**
     * Handle window / container resize & mobile orientation changes
     */
    resize: function () {
      if (!this.container || !this.camera) return;
      const width = this.container.clientWidth || global.innerWidth || 1280;
      const height = this.container.clientHeight || global.innerHeight || 720;
      this.camera.aspect = width / Math.max(1, height);
      const pf = this._getPortraitFactor();
      this.camera.fov = 60 + pf * 23;
      this.camera.position.y = 4.4 + pf * 1.1;
      this.camera.position.z = 16.5 + pf * 5.2;
      this.camera.updateProjectionMatrix();
      if (this.renderer) {
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, width < 768 ? 1.75 : 2));
      }
    },

    /**
     * Render a single frame (useful when paused or right after init)
     */
    renderSingleFrame: function () {
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    },

    /**
     * Enables or disables live 3D attract/demo animation on the Main Screen
     * @param {boolean} enabled
     */
    setDemoMode: function (enabled) {
      this.isDemoMode = Boolean(enabled);
      if (this.isDemoMode) {
        this.demoTimer = 0.7;
        this.setPaused(false);
      }
      return this;
    },

    /**
     * Main 60fps animation & physics update loop
     */
    _animate: function () {
      if (!this.isRunning) {
        this.rafId = null;
        return;
      }
      this.rafId = requestAnimationFrame(() => this._animate());

      const rawDt = this.clock ? this.clock.getDelta() : 0.016;
      const dt = Math.min(rawDt, 0.08);

      if (!this.isPaused) {
        this.update(dt);
      }

      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    },

    /**
     * Step physics, scrolling highway, Soyun avatar, pet, gates, boss, bricks, and camera by dt seconds
     */
    update: function (dt) {
      const cfg = getCfg();
      const lanes = cfg.LANES;
      this.elapsedTime += dt;

      // Live Demo Animation on the Main Title Screen (automatic lane weaving, 3D jumps & sparkles!)
      if (this.isDemoMode && this.activeGates.length === 0 && this.activeObbyWaves.length === 0) {
        this.demoTimer -= dt;
        if (this.demoTimer <= 0) {
          this.demoTimer = 1.6 + Math.random() * 0.9;
          const nextLane = (this.targetLane + 1 + Math.floor(Math.random() * 2)) % 3;
          this.setLane(nextLane);
          this.avatarCheerTimer = 0.95;
          this.petSpinTimer = 0.85;
          if (Math.random() < 0.6) {
            this.triggerJump();
          }
          const lx = lanes[nextLane] || 0;
          this._spawnParticleBurst(lx, 1.4, cfg.GATE_PASS_Z - 2, 0x00f3ff, 18, 0.9);
        }
      }

      // Smooth speed interpolation
      this.currentSpeed += (this.targetSpeed - this.currentSpeed) * Math.min(1, dt * 6);
      // Gate travel speed: distance is 82 units (-74 to +8).
      // At Stage 1 (36 KM/H), gateSpeedUnitsPerSec = 36 * 0.24 = 8.64 units/s -> 9.49 seconds per question (3.06x old 3.1s time!).
      // At Max Stage (53 KM/H), gateSpeedUnitsPerSec = 53 * 0.24 = 12.72 units/s -> 6.45 seconds (strictly > 2x old 3.1s time!).
      const gateSpeedUnitsPerSec = this.currentSpeed * 0.24;
      const worldUnitsPerSec = gateSpeedUnitsPerSec * 2.1;

      // 1. Scroll Road Lane Dashes, Studded Curbs & Roadside Obby Scenery
      for (let i = 0; i < this.laneDashMeshes.length; i++) {
        const dash = this.laneDashMeshes[i];
        dash.position.z += worldUnitsPerSec * dt;
        if (dash.position.z > 28) {
          dash.position.z -= 240;
        }
      }

      for (let i = 0; i < this.curbMeshes.length; i++) {
        const curb = this.curbMeshes[i];
        curb.position.z += worldUnitsPerSec * dt;
        if (curb.position.z > 28) {
          curb.position.z -= 240;
        }
      }

      for (let i = 0; i < this.sceneryItems.length; i++) {
        const item = this.sceneryItems[i];
        item.position.z += worldUnitsPerSec * dt;
        if (item.position.z > 28) {
          item.position.z -= 216;
        }
        if (item.userData && typeof item.userData.baseY === 'number') {
          item.position.y =
            item.userData.baseY + Math.sin(this.elapsedTime * 2.6 + item.userData.phase) * 0.35;
        }
      }

      // 2. Soyun's Roblox Super Kart, 3D Blocky Avatar & Floating Cube Pet Physics
      if (this.carGroup) {
        const targetX = lanes[this.targetLane] !== undefined ? lanes[this.targetLane] : 0;
        const dx = targetX - this.carGroup.position.x;

        // Spring-lerp horizontal position
        this.carGroup.position.x += dx * Math.min(1, dt * 13.5);

        // Dynamic banking roll & steering yaw proportional to lateral velocity
        this.carGroup.rotation.z = -dx * 0.085;
        this.carGroup.rotation.y = -dx * 0.055;

        // High-speed suspension vibration + 3D Jump Physics (carJumpY)!
        if (this.isJumping || this.carJumpY > 0 || this.carJumpVel !== 0) {
          this.carJumpY += this.carJumpVel * dt;
          this.carJumpVel -= 38.0 * dt; // Gravity
          if (this.carJumpY <= 0) {
            this.carJumpY = 0;
            this.carJumpVel = 0;
            this.isJumping = false;
            this.carGroup.rotation.x = 0;
            this._spawnParticleBurst(this.carGroup.position.x, 0.3, cfg.GATE_PASS_Z, 0xffe600, 16, 0.7);
          } else {
            // Pitch nose slightly on jump arc
            this.carGroup.rotation.x = Math.max(-0.28, Math.min(0.28, this.carJumpVel * 0.018));
          }
        } else {
          this.carGroup.rotation.x = 0;
        }

        const vibeFreq = 26 + this.currentSpeed * 0.1;
        this.carGroup.position.y = this.carJumpY + Math.sin(this.elapsedTime * vibeFreq) * 0.025;

        // Steering wheel & Soyun's Blocky Avatar Arms/Head/Pigtails animation!
        if (this.steeringWheelMesh) {
          this.steeringWheelMesh.rotation.z = -dx * 0.35;
        }
        if (this.soyunHeadMesh) {
          this.soyunHeadMesh.rotation.y = -dx * 0.12;
          this.soyunHeadMesh.rotation.z = -dx * 0.06;
        }
        if (this.soyunLeftPigtail && this.soyunRightPigtail) {
          const bounce = Math.sin(this.elapsedTime * 18) * 0.08;
          this.soyunLeftPigtail.rotation.z = -0.1 + bounce - dx * 0.08;
          this.soyunRightPigtail.rotation.z = 0.1 - bounce - dx * 0.08;
        }
        if (this.soyunLeftArm && this.soyunRightArm) {
          if (this.avatarCheerTimer > 0) {
            this.avatarCheerTimer -= dt;
            // Cheer with both arms raised high!
            const wave = Math.sin(this.elapsedTime * 28) * 0.25;
            this.soyunLeftArm.rotation.x = 2.65 + wave;
            this.soyunRightArm.rotation.x = 2.65 - wave;
          } else {
            this.soyunLeftArm.rotation.x = 1.15 + dx * 0.15;
            this.soyunRightArm.rotation.x = 1.15 - dx * 0.15;
          }
        }

        // Floating 3D Cube Pet bobbing, flapping wings & celebratory joy-spin!
        if (this.petGroup) {
          const petBob = Math.sin(this.elapsedTime * 5.8) * 0.22;
          this.petGroup.position.y = 1.9 + petBob + (this.petSpinTimer > 0 ? 0.35 : 0);

          if (this.petSpinTimer > 0) {
            this.petSpinTimer -= dt;
            this.petGroup.rotation.y += dt * 18;
          } else {
            this.petGroup.rotation.y += (0 - this.petGroup.rotation.y) * Math.min(1, dt * 8);
          }

          if (this.petLeftWing && this.petRightWing) {
            const flap = Math.sin(this.elapsedTime * 22) * 0.48;
            this.petLeftWing.rotation.z = flap;
            this.petRightWing.rotation.z = -flap;
          }
        }

        // Spin wheels & steer front wheels
        const wheelSpin = worldUnitsPerSec * dt * 1.6;
        for (let w = 0; w < this.carWheels.length; w++) {
          this.carWheels[w].rotation.x -= wheelSpin;
          if (w < 2) {
            this.carWheels[w].rotation.y = -dx * 0.08;
          }
        }

        // Scale twin turbo exhaust flames with speed & boost
        const speedNorm = Math.max(0, (this.currentSpeed - 80) / 220);
        const boostBonus = this.boostEffectTimer > 0 ? 0.95 : 0;
        for (let f = 0; f < this.carFlames.length; f++) {
          const pulse = 0.85 + Math.sin(this.elapsedTime * 45 + f) * 0.25;
          const flameScale = (0.75 + speedNorm * 1.2 + boostBonus) * pulse;
          this.carFlames[f].scale.set(1, flameScale, 1);
        }

        // Damage red flash vs boost glow
        if (this.damageFlashTimer > 0) {
          this.damageFlashTimer -= dt;
          const flashOn = Math.floor(this.damageFlashTimer * 24) % 2 === 0;
          this.carBodyMaterials.forEach((m) => {
            m.emissive.setHex(flashOn ? 0xff0033 : 0x3a0028);
            m.emissiveIntensity = flashOn ? 1.5 : 0.45;
          });
        } else if (this.boostEffectTimer > 0) {
          this.boostEffectTimer -= dt;
          this.carBodyMaterials.forEach((m) => {
            m.emissive.setHex(0x00ffaa);
            m.emissiveIntensity = 0.9;
          });
        } else {
          this.carBodyMaterials.forEach((m, idx) => {
            m.emissive.setHex(idx === 0 ? 0x3a0028 : 0x005577);
            m.emissiveIntensity = 0.45;
          });
        }

        if (this.carPointLight) {
          this.carPointLight.position.x = this.carGroup.position.x;
        }
      }

      // 3. Speed-Line Particles
      if (this.speedLineParticles) {
        const posAttr = this.speedLineParticles.geometry.getAttribute('position');
        const arr = posAttr.array;
        const lineSpeed = worldUnitsPerSec * 1.65;
        for (let i = 0; i < arr.length; i += 3) {
          arr[i + 2] += lineSpeed * dt;
          if (arr[i + 2] > 20) {
            arr[i + 2] = -130 - Math.random() * 20;
            arr[i] = (Math.random() - 0.5) * 24;
            arr[i + 1] = 0.5 + Math.random() * 7;
          }
        }
        posAttr.needsUpdate = true;
      }

      // 4. Camera Follow, Dynamic FOV Zoom Punch & Impact Shake (Adaptive for Mobile Portrait & Desktop!)
      if (this.camera && this.carGroup) {
        const pf = this._getPortraitFactor();
        const followFactor = 0.36 + pf * 0.24;
        const targetCamX = this.carGroup.position.x * followFactor;
        this.camera.position.x += (targetCamX - this.camera.position.x) * Math.min(1, dt * 8);
        this.camera.position.y = 4.4 + pf * 1.1;
        this.camera.position.z = 16.5 + pf * 5.2;

        if (this.shakeTimer > 0) {
          this.shakeTimer -= dt;
          this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity * 1.45;
          this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity * 1.15;
        }

        // Spring back cameraZoomPunch to 0
        if (Math.abs(this.cameraZoomPunch) > 0.05) {
          this.cameraZoomPunch += (0 - this.cameraZoomPunch) * Math.min(1, dt * 9.5);
        } else {
          this.cameraZoomPunch = 0;
        }

        const baseFov = 60 + pf * 23;
        const targetFov =
          baseFov +
          Math.max(0, Math.min(16, (this.currentSpeed - 110) * 0.075)) +
          (this.boostEffectTimer > 0 ? 4 : 0) +
          this.cameraZoomPunch;

        if (Math.abs(this.camera.fov - targetFov) > 0.08) {
          this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 12);
          this.camera.updateProjectionMatrix();
        }

        this.camera.lookAt(this.carGroup.position.x * (0.2 + pf * 0.12), 1.8 - pf * 0.35, -30);
      }

      // 5. Update 3-Lane Quiz Gates & Collision Check
      const spawnZ = cfg.GATE_SPAWN_Z;
      const passZ = cfg.GATE_PASS_Z;
      const despawnZ = cfg.GATE_DESPAWN_Z;

      for (let i = this.activeGates.length - 1; i >= 0; i--) {
        const gate = this.activeGates[i];
        const isSpeechWaiting = Boolean(gate.questionData && gate.questionData.isSpeech && !gate.questionData.speechPassed);
        const stepSpeed = isSpeechWaiting ? (gateSpeedUnitsPerSec * 0.62) : gateSpeedUnitsPerSec;
        gate.group.position.z += stepSpeed * dt;

        const rawProgress = (gate.group.position.z - spawnZ) / Math.max(1, passZ - spawnZ);
        gate.progress = Math.max(0, Math.min(1, rawProgress));

        // Perspective distance scale compensation: starts large when far away so answers are BIG right from the start,
        // and adapts to screen aspect ratio so all 3 lanes fit inside mobile portrait & desktop viewports!
        const distScale = this._getAdaptiveGateScale(gate.progress);
        gate.group.scale.set(distScale, distScale, 1);

        if (!gate.passed && typeof this.onGateProgress === 'function') {
          this.onGateProgress(gate.progress, gate.questionData, gate.group.position.z);
        }

        if (!gate.passed && gate.group.position.z >= passZ) {
          this._evaluateGatePass(gate);
        }

        if (gate.group.position.z > despawnZ) {
          this._disposeGate(gate);
          this.activeGates.splice(i, 1);
        }
      }

      // 5b. Update 3-Lane Roblox Obby Action Mini-Game Obstacle Waves (2x Speed!)
      const obbySpeedUnitsPerSec = gateSpeedUnitsPerSec * 1.45;
      for (let i = this.activeObbyWaves.length - 1; i >= 0; i--) {
        const wave = this.activeObbyWaves[i];
        wave.group.position.z += obbySpeedUnitsPerSec * dt;

        // Spin Robux rings in the wave
        if (Array.isArray(wave.coinMeshes)) {
          for (let c = 0; c < wave.coinMeshes.length; c++) {
            wave.coinMeshes[c].rotation.y += dt * 4.5;
          }
        }

        if (!wave.passed && wave.group.position.z >= passZ - 0.8) {
          wave.passed = true;
          const playerLane = this.targetLane;
          const laneType = wave.lanes[playerLane] || 'coin';
          const laneX = lanes[playerLane] || 0;

          let cleared = true;
          let actionType = 'dodge';

          if (laneType === 'block') {
            cleared = false;
            actionType = 'hit_block';
            this.triggerDamageEffect(laneX);
          } else if (laneType === 'hurdle') {
            if (this.carJumpY >= 0.65) {
              cleared = true;
              actionType = 'jumped_hurdle';
              this.triggerCorrectEffect(laneX);
            } else {
              cleared = false;
              actionType = 'hit_hurdle';
              this.triggerDamageEffect(laneX);
            }
          } else {
            cleared = true;
            actionType = 'collected_coin';
            this.spawnBrickExplosion(laneX, 1.5, passZ - 1, 20, false);
            this._spawnParticleBurst(laneX, 1.5, passZ - 1, 0x00ff88, 28, 1.1);
          }

          if (typeof this.onObbyWavePass === 'function') {
            this.onObbyWavePass({
              cleared: cleared,
              actionType: actionType,
              laneType: laneType,
              lane: playerLane,
              waveIndex: wave.waveIndex,
              totalWaves: wave.totalWaves
            });
          }
        }

        if (wave.group.position.z > despawnZ) {
          if (wave.group && this.scene) {
            this.scene.remove(wave.group);
          }
          if (wave.disposables) {
            wave.disposables.geometries.forEach((g) => g && g.dispose && g.dispose());
            wave.disposables.materials.forEach((m) => m && m.dispose && m.dispose());
          }
          this.activeObbyWaves.splice(i, 1);
        }
      }

      // 6. Update Stage Boss 3D Blocky Roblox Mecha (at BOSS_Z = -38, y = 2.8) — Dynamic 1.5x Overdrive Action!
      if (this.isBossActive && this.bossGroup && this.bossGroup.visible) {
        if (this.bossDefeating) {
          this.bossDefeatTimer += dt;
          this.bossGroup.position.y += dt * 14;
          this.bossGroup.position.z -= dt * 36;
          this.bossGroup.rotation.z += dt * 9;
          this.bossGroup.rotation.x += dt * 5;
          const shrink = Math.max(0.05, 1 - this.bossDefeatTimer * 0.85);
          this.bossGroup.scale.set(shrink, shrink, shrink);

          if (Math.random() < 0.35) {
            this._spawnParticleBurst(
              this.bossGroup.position.x + (Math.random() - 0.5) * 4,
              this.bossGroup.position.y + (Math.random() - 0.5) * 3,
              this.bossGroup.position.z,
              0xffbe0b,
              18,
              1.4
            );
          }

          if (this.bossDefeatTimer >= 1.05) {
            const cb = this.bossDefeatCallback;
            this.hideBoss();
            if (cb) cb();
          }
        } else {
          // Recover from knockback recoil smoothly
          this.bossRecoilZ += (0 - this.bossRecoilZ) * Math.min(1, dt * 6.5);
          this.bossRecoilPitch += (0 - this.bossRecoilPitch) * Math.min(1, dt * 7.5);

          // Dynamic lunging, weaving across all 3 lanes, and energetic bobbing!
          const lungeOffset = Math.sin(this.elapsedTime * 3.1) * 2.8;
          const targetBossZ = cfg.BOSS_Z + lungeOffset + this.bossRecoilZ;
          this.bossGroup.position.z += (targetBossZ - this.bossGroup.position.z) * Math.min(1, dt * 7);
          this.bossGroup.position.x = Math.sin(this.elapsedTime * 1.95) * 5.4;
          this.bossGroup.position.y = 2.8 + Math.sin(this.elapsedTime * 4.2) * 0.68;
          this.bossGroup.rotation.z = Math.cos(this.elapsedTime * 1.95) * -0.15;
          this.bossGroup.rotation.x = this.bossRecoilPitch + Math.sin(this.elapsedTime * 3.1) * 0.08;

          // Swing the giant Roblox Ban-Hammer rapidly and dynamically!
          if (this.bossRightArm) {
            this.bossRightArm.rotation.x = 0.55 + Math.sin(this.elapsedTime * 6.8) * 0.85;
          }
          if (this.bossLeftArm) {
            this.bossLeftArm.rotation.x = Math.PI / 3 + Math.cos(this.elapsedTime * 5.4) * 0.45;
          }

          if (this.bossRing1) this.bossRing1.rotation.z += dt * 3.2;
          if (this.bossRing2) this.bossRing2.rotation.y -= dt * 4.2;

          if (this.bossHitTimer > 0) {
            this.bossHitTimer -= dt;
            this.bossGroup.position.x += (Math.random() - 0.5) * 1.4;
            if (this.bossArmorMat) {
              this.bossArmorMat.emissive.setHex(0xffffff);
              this.bossArmorMat.emissiveIntensity = 2.0;
            }
          } else if (this.bossArmorMat) {
            this.bossArmorMat.emissive.setHex(this.currentTheme.secondary);
            this.bossArmorMat.emissiveIntensity = 0.6;
          }
        }
      }

      // 6b. Update Flying 3D Bomb Projectiles arcing toward the Boss!
      for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
        const proj = this.activeProjectiles[i];
        proj.age += dt;
        const t = Math.min(1, proj.age / Math.max(0.05, proj.duration));

        // Track live boss position if boss is active
        if (this.bossGroup && this.bossGroup.visible) {
          proj.endPos.set(
            this.bossGroup.position.x,
            this.bossGroup.position.y + 0.5,
            this.bossGroup.position.z + 1.8
          );
        }

        // Parabolic arc interpolation
        const curX = proj.startPos.x + (proj.endPos.x - proj.startPos.x) * t;
        const curZ = proj.startPos.z + (proj.endPos.z - proj.startPos.z) * t;
        const baseLinearY = proj.startPos.y + (proj.endPos.y - proj.startPos.y) * t;
        const arcY = Math.sin(t * Math.PI) * (proj.arcHeight || 5.5);
        const curY = baseLinearY + arcY;

        proj.group.position.set(curX, curY, curZ);

        // Orient bomb nose along trajectory tangent & spin barrel
        const nextT = Math.min(1, t + 0.05);
        const nextX = proj.startPos.x + (proj.endPos.x - proj.startPos.x) * nextT;
        const nextZ = proj.startPos.z + (proj.endPos.z - proj.startPos.z) * nextT;
        const nextY = proj.startPos.y + (proj.endPos.y - proj.startPos.y) * nextT + Math.sin(nextT * Math.PI) * (proj.arcHeight || 5.5);
        proj.group.lookAt(nextX, nextY, nextZ);
        proj.group.rotation.z += dt * 22;

        // Emit fiery rocket trail particles along the bomb's flight path
        if (Math.random() < 0.85) {
          this._spawnParticleBurst(curX, curY, curZ + 0.6, proj.isPrimaryBomb ? 0xff9900 : 0xff2a85, 5, 0.45);
        }

        if (t >= 1) {
          // Bomb slams into Boss!
          if (proj.isPrimaryBomb) {
            this._triggerBombBossImpact(proj.endPos.clone());
          }
          if (proj.group && this.scene) {
            this.scene.remove(proj.group);
          }
          if (Array.isArray(proj.disposables)) {
            proj.disposables.forEach((d) => d && d.dispose && d.dispose());
          }
          this.activeProjectiles.splice(i, 1);
        }
      }

      // 7. Update Active Laser Beams & Explosion Shockwave Spheres
      for (let i = this.activeLasers.length - 1; i >= 0; i--) {
        const laser = this.activeLasers[i];
        laser.age += dt;
        const lifeRatio = 1 - laser.age / laser.maxAge;
        if (lifeRatio <= 0) {
          this.scene.remove(laser.mesh);
          laser.geo.dispose();
          laser.mat.dispose();
          this.activeLasers.splice(i, 1);
        } else if (laser.isShockwave) {
          laser.mat.opacity = lifeRatio * 0.9;
          const expandScale = 1 + (1 - lifeRatio) * 3.4;
          laser.mesh.scale.set(expandScale, expandScale, expandScale);
        } else {
          laser.mat.opacity = lifeRatio;
          laser.mesh.scale.set(lifeRatio * 1.5, lifeRatio * 1.5, 1);
        }
      }

      // 8. Update 3D Shattered Roblox Bricks & Golden Robux Rings (with Road Bounce!)
      for (let i = this.activeBricks.length - 1; i >= 0; i--) {
        const b = this.activeBricks[i];
        b.age += dt;
        if (b.age >= b.maxAge) {
          this.scene.remove(b.mesh);
          this.activeBricks.splice(i, 1);
          continue;
        }

        b.mesh.position.x += b.vx * dt;
        b.mesh.position.y += b.vy * dt;
        b.mesh.position.z += b.vz * dt;
        b.vy -= 28 * dt; // strong arcade gravity

        // Bounce off the highway surface (y = 0.22)!
        if (b.mesh.position.y < 0.22 && b.vy < 0) {
          b.mesh.position.y = 0.22;
          b.vy = -b.vy * 0.58;
          b.vx *= 0.88;
        }

        b.mesh.rotation.x += b.rx * dt;
        b.mesh.rotation.y += b.ry * dt;
        b.mesh.rotation.z += b.rz * dt;

        const lifeLeft = 1 - b.age / b.maxAge;
        if (lifeLeft < 0.3) {
          const s = Math.max(0.01, b.baseScale * (lifeLeft / 0.3));
          b.mesh.scale.set(s, s, s);
        }
      }

      // 9. Update 3D Particle Bursts
      for (let i = this.particleBursts.length - 1; i >= 0; i--) {
        const burst = this.particleBursts[i];
        burst.age += dt;
        if (burst.age >= burst.maxAge) {
          this.scene.remove(burst.points);
          burst.geo.dispose();
          burst.mat.dispose();
          this.particleBursts.splice(i, 1);
          continue;
        }

        const posAttr = burst.geo.getAttribute('position');
        const arr = posAttr.array;
        for (let p = 0; p < burst.velocities.length; p++) {
          const v = burst.velocities[p];
          arr[p * 3] += v.vx * dt;
          arr[p * 3 + 1] += v.vy * dt;
          arr[p * 3 + 2] += v.vz * dt;
          v.vy -= 18 * dt;
        }
        posAttr.needsUpdate = true;
        burst.mat.opacity = 1 - burst.age / burst.maxAge;
      }
    }
  };

  global.Engine3D = Engine3D;
})(typeof window !== 'undefined' ? window : this);
