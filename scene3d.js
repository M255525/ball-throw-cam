/* ============================================================
 * 體感丟球大作戰 — 3D 情境背景（Three.js）
 * 只負責「背景與氣氛」：遊戲判定、角色、物件全部仍在 2D 畫布（#game）上，
 * 這裡畫在它後面。地面格線／防線用 screenToGround() 把 2D 畫面座標反推到地面，
 * 所以 3D 地上的線會剛好落在角色腳底的格位上。
 * 三關三個情境：校園操場（白天）、夜市（傍晚）、頂樓煙火（夜晚）。全部程式產生，無外部素材。
 * ============================================================ */
import * as THREE from 'three';

const TAU = Math.PI * 2;
const CAM_H = 1.6;           // 眼睛高度（公尺）
const FOV = 55;
const HORIZON = 0.2;         // 地平線在畫面高的比例（由上往下）
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];

const THEMES = [
  { key: 'school', title: '校園操場', sky: [0x4f9be8, 0xcfe9ff], fog: 0xd6ecff, fogN: 40, fogF: 160, hemi: [0xffffff, 0x6a8a4a, 1.0], sun: [0xfff1d6, 1.6, [6, 12, 4]], mark: 0xffffff, line: 0xff3b3b },
  { key: 'market', title: '夜市', sky: [0x141238, 0xc0587a], fog: 0x3a2a52, fogN: 18, fogF: 80, hemi: [0xffd2b0, 0x4a3a5a, 1.0], sun: [0xffb070, 0.7, [-5, 8, 3]], mark: 0xffe08a, line: 0xff4d4d },
  { key: 'roof', title: '頂樓煙火', sky: [0x050817, 0x1b2a5c], fog: 0x0b1230, fogN: 25, fogF: 140, hemi: [0x8aa0ff, 0x1a1a2a, 0.55], sun: [0xbfd0ff, 0.5, [4, 10, 6]], mark: 0x9fd8ff, line: 0xff5a5a },
];

/* ---------- 程式產生的貼圖 ---------- */
function canvasTex(w, h, fn, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = 4;
  return t;
}
const grassTex = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#5fae4a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#56a443'; g.fillRect(0, 0, w, h / 2);        // 割草條紋
  for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${pick(['40,110,40', '120,190,80', '70,140,50'])},.5)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 3); }
}, [40, 40]);
const asphaltTex = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#4a4652'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) { const v = 55 + Math.random() * 55; g.fillStyle = `rgba(${v},${v},${v + 8},.6)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
}, [30, 30]);
const tileTex = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#6d7180'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const v = 98 + Math.random() * 22; g.fillStyle = `rgb(${v},${v + 2},${v + 12})`;
    g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
  }
}, [60, 60]);
function windowsTex(cols, rows, lit, base, day) {
  return canvasTex(cols * 16, rows * 20, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const on = Math.random() < lit;
      g.fillStyle = day ? (Math.random() < 0.5 ? '#9cc7e8' : '#7fb0d8') : (on ? pick(['#ffd98a', '#ffe9b0', '#fff3d0', '#ffcf7a']) : '#1b2033');
      g.fillRect(x * 16 + 3, y * 20 + 4, 10, 12);
    }
  });
}
function signTex(text, bg, fg) {
  return canvasTex(256, 96, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = fg; g.font = 'bold 58px "Microsoft JhengHei","Noto Sans TC",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 3);
  });
}

/* ---------- 簡單模型 ---------- */
const lam = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o });
const glow = (color) => new THREE.MeshBasicMaterial({ color });
/* 夜間大樓：亮著的窗戶自己發光 */
const nightMat = (tex) => new THREE.MeshLambertMaterial({ color: 0x555566, map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.85 });
function box(w, h, d, mat) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); return m; }

function makePerson(color, skin = 0xf2c9a0) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.75, 8), lam(color));
  body.position.y = 0.75; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), lam(skin));
  head.position.y = 1.3; g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.165, 10, 6, 0, TAU, 0, Math.PI / 2), lam(pick([0x2b1d14, 0x5b3a1e, 0x111111, 0xa16207])));
  hair.position.y = 1.32; g.add(hair);
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.4, 8), lam(0x2a3550));
  legs.position.y = 0.2; g.add(legs);
  const armMat = lam(color);
  const arms = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.22, 1.05, 0);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6), armMat);
    arm.position.y = -0.25; pivot.add(arm); g.add(pivot); arms.push(pivot);
  }
  g.userData = { arms, phase: Math.random() * TAU, baseY: 0, cheer: 0 };
  return g;
}
function makeTree(h = rnd(3, 5)) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, h * 0.45, 6), lam(0x7a5230));
  trunk.position.y = h * 0.225; g.add(trunk);
  const leafMat = lam(pick([0x3f8f3a, 0x4ea145, 0x2f7a35]), { flatShading: true });
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(h * (0.28 - i * 0.04), 0), leafMat);
    s.position.set(rnd(-0.3, 0.3), h * (0.55 + i * 0.16), rnd(-0.3, 0.3)); g.add(s);
  }
  g.userData.sway = Math.random() * TAU;
  return g;
}
function makeCloud() {
  const g = new THREE.Group(), m = lam(0xffffff, { emissive: 0xdde8f5, emissiveIntensity: 0.6 });
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(rnd(2, 3.4), 10, 8), m);
    s.position.set(i * 2.6 - 5, rnd(-0.5, 0.8), rnd(-1, 1)); s.scale.y = 0.65; g.add(s);
  }
  return g;
}

/* ============================================================ */
export function createScene3D(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 400);
  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let W = 1, H = 1, pitch = 0;

  /* 天空：漸層球 */
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: new THREE.Color() }, uBot: { value: new THREE.Color() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 uTop,uBot; varying vec3 vP; void main(){ float t = smoothstep(-0.05, 0.55, vP.y); gl_FragColor = vec4(mix(uBot,uTop,t),1.); }',
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), skyMat);
  scene.add(sky);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1); scene.add(sun);

  /* 地面格線＋防線（每關重建位置） */
  const marks = new THREE.Group(); scene.add(marks);
  const markMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.9 });
  const postMat = lam(0xffcc33);

  /* 各關情境 */
  const levels = THEMES.map(() => ({ group: new THREE.Group(), anim: [], sideAnchors: [], built: false }));
  levels.forEach(l => { l.group.visible = false; scene.add(l.group); });
  let cur = -1;
  const crowd = [];             // 所有觀眾（目前關卡的）
  let shakeT = 0, bumpT = 0, danger = 0, time = 0;
  const fireworks = [];

  /* 依畫面寬度放在左右兩側的物件：dist 公尺遠、比畫面邊緣往外 out 公尺 */
  /* ref：用哪個距離的畫面寬度當基準（給定就變成固定街寬，物件會往遠方收斂） */
  function anchor(l, obj, side, dist, out = 0, ref) { l.sideAnchors.push({ obj, side, dist, out, ref }); obj.position.z = -dist; l.group.add(obj); }
  function halfWidthAt(dist) { return dist * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * camera.aspect / Math.cos(pitch); }
  function layoutSides() {
    const l = levels[cur]; if (!l) return;
    for (const a of l.sideAnchors) a.obj.position.x = a.side * Math.max(a.ref ? 3.6 : 2.5, halfWidthAt(a.ref || a.dist) + a.out);
  }

  /* ---------- 第 1 關：校園操場（白天） ---------- */
  function buildSchool(l) {
    const g = l.group;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), lam(0xffffff, { map: grassTex() }));
    ground.rotation.x = -Math.PI / 2; g.add(ground);
    // 跑道（紅色 PU）在角色後方
    const track = new THREE.Mesh(new THREE.PlaneGeometry(200, 5), lam(0xc8553d));
    track.rotation.x = -Math.PI / 2; track.position.set(0, 0.01, -24); g.add(track);
    for (let i = 0; i < 5; i++) {
      const ln = new THREE.Mesh(new THREE.PlaneGeometry(200, 0.06), glow(0xf3e9e0));
      ln.rotation.x = -Math.PI / 2; ln.position.set(0, 0.02, -21.6 - i * 1.2); g.add(ln);
    }
    // 看台＋觀眾
    for (let r = 0; r < 3; r++) {
      const step = box(60, 0.45, 1.1, lam(r % 2 ? 0x8fa3bf : 0xa9bad1));
      step.position.set(0, 0.225 + r * 0.45, -30 - r * 1.1); g.add(step);
      const back = box(60, 0.45 * (r + 1), 1.1, lam(0x6d7f99)); back.position.set(0, 0.225 * (r + 1), -30 - r * 1.1); g.add(back);
    }
    for (let i = 0; i < 60; i++) {
      const r = i % 3, p = makePerson(pick([0xef4444, 0x3b82f6, 0xf59e0b, 0x22c55e, 0xffffff, 0x7c3aed]));
      p.position.set(rnd(-30, 30), 0.45 * (r + 1), -30 - r * 1.1); p.userData.baseY = p.position.y; p.scale.setScalar(0.9);
      g.add(p); l.crowdList = l.crowdList || []; l.crowdList.push(p);
    }
    // 教學大樓
    const bTex = windowsTex(48, 3, 0, '#e9dcc4', true);
    const bld = box(70, 8, 8, [lam(0xe9dcc4), lam(0xe9dcc4), lam(0xb44a3a), lam(0xe9dcc4), lam(0xffffff, { map: bTex }), lam(0xe9dcc4)]);
    bld.position.set(0, 4, -75); g.add(bld);
    const roofTrim = box(71, 0.8, 9, lam(0xb44a3a)); roofTrim.position.set(0, 8.2, -75); g.add(roofTrim);
    const clock = new THREE.Mesh(new THREE.CircleGeometry(1.3, 24), glow(0xffffff)); clock.position.set(0, 6.2, -70.9); g.add(clock);
    const hand1 = box(0.12, 1.2, 0.05, glow(0x222222)); hand1.position.set(0, 6.6, -70.85); g.add(hand1);
    const hand2 = box(0.9, 0.12, 0.05, glow(0x222222)); hand2.position.set(0.35, 6.2, -70.85); g.add(hand2);
    // 旗桿＋飄動的旗子
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 12, 8), lam(0xdddddd)); pole.position.set(-18, 6, -45); g.add(pole);
    const flagGeo = new THREE.PlaneGeometry(3, 2, 12, 4); flagGeo.translate(1.5, 0, 0);
    const flag = new THREE.Mesh(flagGeo, lam(0xff7a2f, { side: THREE.DoubleSide })); flag.position.set(-18, 10.8, -45); g.add(flag);
    const fbase = flagGeo.attributes.position.array.slice();
    l.anim.push(t => {
      const p = flagGeo.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = fbase[i * 3]; p.setZ(i, Math.sin(x * 2.2 - t * 5) * 0.25 * (x / 3)); }
      p.needsUpdate = true; flagGeo.computeVertexNormals();
    });
    // 籃球架
    for (const s of [-1, 1]) {
      const hoop = new THREE.Group();
      const post = box(0.2, 3.4, 0.2, lam(0x2b4a7a)); post.position.y = 1.7; hoop.add(post);
      const board = box(1.8, 1.1, 0.08, lam(0xffffff)); board.position.set(0, 3.4, 0.3); hoop.add(board);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.03, 6, 16), lam(0xff6a1a)); rim.rotation.x = Math.PI / 2; rim.position.set(0, 3.05, 0.6); hoop.add(rim);
      hoop.rotation.y = s * 0.5;
      anchor(l, hoop, s, 16, 0.5);
    }
    // 兩側的樹
    for (let i = 0; i < 14; i++) {
      const s = i % 2 ? 1 : -1, t = makeTree();
      anchor(l, t, s, 6 + Math.floor(i / 2) * 5 + rnd(0, 2), rnd(0.6, 3));
      l.anim.push(tt => { t.rotation.z = Math.sin(tt * 1.3 + t.userData.sway) * 0.03; });
    }
    // 雲
    for (let i = 0; i < 6; i++) {
      const c = makeCloud(); c.position.set(rnd(-90, 90), rnd(9, 16), rnd(-160, -110)); c.scale.setScalar(rnd(1, 1.8)); g.add(c);
      const sp = rnd(0.6, 1.5);
      l.anim.push((t, dt) => { c.position.x += sp * dt; if (c.position.x > 110) c.position.x = -110; });
    }
    // 太陽
    const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(6, 32), new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false }));
    sunDisc.position.set(55, 24, -200); g.add(sunDisc);
  }

  /* ---------- 第 2 關：夜市（傍晚） ---------- */
  function buildMarket(l) {
    const g = l.group;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), lam(0xffffff, { map: asphaltTex() }));
    ground.rotation.x = -Math.PI / 2; g.add(ground);
    const FOODS = ['雞排', '珍奶', '烤玉米', '蚵仔煎', '臭豆腐', '鹽酥雞', '炒麵', '刨冰', '地瓜球', '大腸包', '烤魷魚', '豆花', '水煎包', '甜不辣'];
    const COLORS = ['#d7263d', '#f46036', '#2e86ab', '#1b998b', '#c5a100', '#8e44ad', '#e84393'];
    const stallMats = COLORS.map(c => lam(new THREE.Color(c)));
    let n = 0;
    l.crowdList = [];
    for (const s of [-1, 1]) {
      // 攤位：從角色後方開始沿街往遠處排，稍微斜向鏡頭，招牌才看得到
      for (let i = 0; i < 9; i++) {
        const st = new THREE.Group(), col = pick(COLORS);
        const counter = box(2.4, 1.0, 1.4, lam(0xd9c2a0)); counter.position.set(0, 0.5, 0.2); st.add(counter);
        const back = box(2.4, 2.4, 0.2, lam(0x5a4636)); back.position.set(0, 1.2, -0.7); st.add(back);
        const awn = box(2.8, 0.12, 2.2, stallMats[COLORS.indexOf(col)]); awn.position.set(0, 2.5, 0.2); st.add(awn);
        const stripe = box(2.82, 0.3, 0.06, glow(0xffffff)); stripe.position.set(0, 2.38, 1.3); st.add(stripe);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.82), new THREE.MeshBasicMaterial({ map: signTex(FOODS[n++ % FOODS.length], col, '#fff7d6') }));
        sign.position.set(0, 3.05, 0.9); st.add(sign);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), glow(0xfff0b0)); bulb.position.set(0, 2.3, 0.6); st.add(bulb);
        if (Math.random() < 0.75) {           // 攤位前排隊的客人
          const p = makePerson(pick([0xffffff, 0x3b82f6, 0xf59e0b, 0x22c55e, 0xe84393, 0x111827]));
          p.position.set(rnd(-0.6, 0.6), 0, 1.5); p.rotation.y = Math.PI; st.add(p);
          l.crowdList.push(p);
        }
        st.rotation.y = -s * Math.PI / 2 * 0.6;   // 面向街道中間、略朝鏡頭
        anchor(l, st, s, 12 + i * 3.4, -1.2, 12);
      }
      // 攤位後方的騎樓建築
      for (let i = 0; i < 8; i++) {
        const h = rnd(7, 13), b = box(5, h, 5, nightMat(windowsTex(5, Math.round(h / 1.6), 0.55, '#3b3446', false)));
        b.position.y = h / 2; anchor(l, b, s, 12 + i * 5, 2.4, 12);
      }
    }
    // 街道盡頭的牌樓與更遠的人潮
    const gate = new THREE.Group();
    for (const s of [-1, 1]) { const col = box(0.5, 6, 0.5, lam(0xb3261e)); col.position.set(s * 6, 3, 0); gate.add(col); }
    const beam = box(14, 0.6, 0.7, lam(0xb3261e)); beam.position.y = 6; gate.add(beam);
    const gsign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.4), new THREE.MeshBasicMaterial({ map: signTex('夜 市', '#b3261e', '#ffd84d') }));
    gsign.position.set(0, 6, 0.4); gate.add(gsign);
    gate.position.set(0, 0, -50); g.add(gate);
    for (let i = 0; i < 26; i++) {
      const p = makePerson(pick([0xffffff, 0x3b82f6, 0xf59e0b, 0x22c55e, 0xe84393, 0x111827, 0xef4444]));
      p.position.set(rnd(-5, 5), 0, rnd(-44, -16)); g.add(p);
      l.crowdList.push(p);
      const sp = rnd(0.4, 0.9) * (Math.random() < 0.5 ? 1 : -1);
      p.rotation.y = sp > 0 ? -Math.PI / 2 : Math.PI / 2;
      l.anim.push((t, dt) => { p.position.x += sp * dt; if (Math.abs(p.position.x) > 5.5) p.position.x = -Math.sign(p.position.x) * 5.5; });
    }
    // 跨街的燈泡串＋燈籠
    const bulbMats = [0xffe08a, 0xff9f6b, 0x9fe3ff].map(c => new THREE.MeshBasicMaterial({ color: c }));
    l.bulbMats = bulbMats;
    for (let k = 0; k < 7; k++) {
      const z = -(10 + k * 5), span = halfWidthGuess(z) + 1.5;
      for (let j = 0; j <= 16; j++) {
        const u = j / 16, x = (u * 2 - 1) * span, y = 4.2 - Math.sin(u * Math.PI) * 0.7;
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), bulbMats[j % 3]); b.position.set(x, y, z); g.add(b);
      }
      if (k % 2 === 1) {
        const lan = new THREE.Group();
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff3b2f }));
        body.scale.y = 1.25; body.position.y = -0.6; lan.add(body);
        const cap = box(0.3, 0.1, 0.3, glow(0xffcc33)); cap.position.y = -0.15; lan.add(cap);
        lan.position.set(0, 4.0, z); g.add(lan);
        const ph = Math.random() * TAU;
        l.anim.push(t => { lan.rotation.z = Math.sin(t * 1.6 + ph) * 0.12; });
      }
    }
    l.anim.push(t => { bulbMats.forEach((m, i) => { const v = 0.75 + 0.25 * Math.sin(t * 3 + i * 2.1); m.color.setRGB(...[[1, .88, .54], [1, .62, .42], [.62, .89, 1]][i].map(c => c * v)); }); });
    // 晚霞中的月亮
    const moon = new THREE.Mesh(new THREE.CircleGeometry(4, 32), new THREE.MeshBasicMaterial({ color: 0xfff1d0, fog: false }));
    moon.position.set(-40, 22, -200); g.add(moon);
  }
  function halfWidthGuess(z) { return Math.max(4, halfWidthAt(-z)); }

  /* ---------- 第 3 關：頂樓煙火（夜晚） ---------- */
  function buildRoof(l) {
    const g = l.group;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 26), lam(0xffffff, { map: tileTex() }));
    floor.rotation.x = -Math.PI / 2; floor.position.z = -8; g.add(floor);
    // 女兒牆（頂樓邊緣）＋燈串
    const wall = box(90, 1.1, 0.4, lam(0x8a90a6)); wall.position.set(0, 0.55, -21);
    const facade = box(90, 60, 0.4, lam(0x2a3048)); facade.position.set(0, -29.5, -21.1); g.add(facade); g.add(wall);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xffe6a0 });
    for (let j = 0; j < 60; j++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), lightMat); b.position.set(-30 + j, 1.25 + Math.sin(j * 0.9) * 0.05, -21); g.add(b); }
    // 水塔、冷氣主機、曬衣架
    const tank = new THREE.Group();
    const tk = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 2, 16), lam(0xd8dde6)); tk.position.y = 3.2; tank.add(tk);
    for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) { const leg = box(0.1, 2.2, 0.1, lam(0x666a75)); leg.position.set(x, 1.1, z); tank.add(leg); }
    anchor(l, tank, -1, 19, -2.5, 16);
    for (let i = 0; i < 3; i++) {
      const ac = box(1.1, 0.8, 0.6, lam(0xcfd3da)); ac.position.y = 0.4;
      const fan = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16), glow(0x3a3f4b)); fan.position.set(0, 0.4, 0.31);
      const grp = new THREE.Group(); grp.add(ac); grp.add(fan); grp.rotation.y = -Math.PI / 2 * 0.3;
      anchor(l, grp, 1, 14 + i * 2.2, -1.2, 14);
    }
    const rack = new THREE.Group();
    for (const s of [-1, 1]) { const pst = box(0.06, 1.8, 0.06, lam(0x999999)); pst.position.set(s * 1.4, 0.9, 0); rack.add(pst); }
    const bar = box(2.9, 0.05, 0.05, lam(0x999999)); bar.position.y = 1.8; rack.add(bar);
    for (let i = 0; i < 3; i++) {
      const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.7), lam(pick([0xef4444, 0x60a5fa, 0xfacc15]), { side: THREE.DoubleSide }));
      cl.position.set(-0.9 + i * 0.9, 1.42, 0); rack.add(cl);
      const ph = Math.random() * TAU; l.anim.push(t => { cl.rotation.x = Math.sin(t * 2 + ph) * 0.18; });
    }
    anchor(l, rack, -1, 13.5, -1.6, 13.5);
    // 城市天際線
    for (let i = 0; i < 70; i++) {
      const w = rnd(5, 11), h = Math.random() < 0.15 ? rnd(50, 62) : rnd(14, 42), d = rnd(5, 10);
      const b = box(w, h, d, nightMat(windowsTex(Math.max(2, Math.round(w / 1.2)), Math.round(h / 1.4), 0.4, '#141a30', false)));
      const ring = i < 40 ? rnd(-70, -45) : rnd(-120, -75);
      b.position.set(rnd(-130, 130), h / 2 - 45, ring); g.add(b);
    }
    // 遠方的高塔（通用造型，非特定建築）
    const tower = new THREE.Group();
    const tb = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.4, 60, 8), lam(0x2b3550)); tb.position.y = 30 - 22; tower.add(tb);
    const tt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 1.2, 14, 8), lam(0x3b4560)); tt.position.y = 67 - 22; tower.add(tt);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3030, fog: false })); beacon.position.y = 74.5 - 22; tower.add(beacon);
    tower.position.set(26, -23, -120); g.add(tower);
    l.anim.push(t => { beacon.visible = Math.sin(t * 3) > -0.2; });
    // 星星＋月亮
    const sg = new THREE.BufferGeometry(), sp = [];
    for (let i = 0; i < 600; i++) { const a = Math.random() * TAU, e = rnd(0.12, 1.3); sp.push(Math.cos(a) * Math.cos(e) * 250, Math.sin(e) * 250, Math.sin(a) * Math.cos(e) * 250); }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.3, sizeAttenuation: false, fog: false }));
    g.add(stars);
    const moon = new THREE.Mesh(new THREE.CircleGeometry(5, 32), new THREE.MeshBasicMaterial({ color: 0xfff4d8, fog: false }));
    moon.position.set(-60, 26, -200); g.add(moon);
    // 頂樓上的朋友（觀眾）
    for (let i = 0; i < 6; i++) {
      const p = makePerson(pick([0xffffff, 0x3b82f6, 0xf59e0b, 0x22c55e, 0xe84393]));
      p.rotation.y = (i % 2 ? -1 : 1) * 0.6;
      anchor(l, p, i % 2 ? 1 : -1, 13 + i * 1.3, -2.2 - (i % 3) * 0.5, 13);
      l.crowdList = l.crowdList || []; l.crowdList.push(p);
    }
    l.autoFire = true;
  }

  /* ---------- 煙火 ---------- */
  const dotTex = canvasTex(32, 32, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  const FW_COLORS = [0xff4d6d, 0xffd166, 0x06d6a0, 0x4cc9f0, 0xc77dff, 0xff9e00, 0xffffff];
  function firework(x, y, z, n = 90, color) {
    if (fireworks.length > 8) { const old = fireworks.shift(); scene.remove(old.pts); old.pts.geometry.dispose(); old.pts.material.dispose(); }
    const geo = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      const u = rnd(-1, 1), a = Math.random() * TAU, r = Math.sqrt(1 - u * u), s = rnd(3.5, 5);
      vel[i * 3] = r * Math.cos(a) * s; vel[i * 3 + 1] = u * s; vel[i * 3 + 2] = r * Math.sin(a) * s;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: color ?? pick(FW_COLORS), size: 7, map: dotTex, sizeAttenuation: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const pts = new THREE.Points(geo, mat); scene.add(pts);
    fireworks.push({ pts, vel, life: 1.8 });
  }
  function updateFireworks(dt) {
    for (const f of fireworks) {
      f.life -= dt;
      const p = f.pts.geometry.attributes.position, a = p.array, v = f.vel;
      for (let i = 0; i < v.length; i += 3) { v[i + 1] -= 2.5 * dt; v[i] *= 0.985; v[i + 1] *= 0.985; v[i + 2] *= 0.985; a[i] += v[i] * dt; a[i + 1] += v[i + 1] * dt; a[i + 2] += v[i + 2] * dt; }
      p.needsUpdate = true;
      f.pts.material.opacity = Math.max(0, Math.min(1, f.life / 1.0));
    }
    for (let i = fireworks.length - 1; i >= 0; i--) if (fireworks[i].life <= 0) { const f = fireworks[i]; scene.remove(f.pts); f.pts.geometry.dispose(); f.pts.material.dispose(); fireworks.splice(i, 1); }
  }
  let fireT = 1;

  /* ---------- 對外 API ---------- */
  function setLevel(i) {
    i = Math.max(0, Math.min(THEMES.length - 1, i | 0));
    if (i === cur) return;
    const l = levels[i];
    if (!l.built) { [buildSchool, buildMarket, buildRoof][i](l); l.built = true; }
    levels.forEach((x, k) => { x.group.visible = k === i; });
    cur = i;
    const T = THEMES[i];
    skyMat.uniforms.uTop.value.set(T.sky[0]); skyMat.uniforms.uBot.value.set(T.sky[1]);
    scene.fog = new THREE.Fog(T.fog, T.fogN, T.fogF);
    hemi.color.set(T.hemi[0]); hemi.groundColor.set(T.hemi[1]); hemi.intensity = T.hemi[2];
    sun.color.set(T.sun[0]); sun.intensity = T.sun[1]; sun.position.set(...T.sun[2]);
    markMat.color.set(T.mark); lineMat.color.set(T.line);
    crowd.length = 0; (l.crowdList || []).forEach(p => crowd.push(p));
    for (const f of fireworks) { scene.remove(f.pts); f.pts.geometry.dispose(); f.pts.material.dispose(); }
    fireworks.length = 0;
    layoutSides();
  }

  function resize(w, h) {
    W = Math.max(1, w); H = Math.max(1, h);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.position.set(0, CAM_H, 0);
    // 讓地平線固定落在畫面 HORIZON 的位置：pitch 往下
    const ndc = 1 - 2 * HORIZON;
    pitch = Math.atan(ndc * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    camera.rotation.set(-pitch, 0, 0);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    layoutSides();
  }

  const _v = new THREE.Vector2(), _hit = new THREE.Vector3();
  function screenToGround(px, py) {
    _v.set(px / W * 2 - 1, -(py / H * 2 - 1));
    raycaster.setFromCamera(_v, camera);
    return raycaster.ray.intersectPlane(groundPlane, _hit) ? _hit.clone() : null;
  }

  /* 地上的格線：rowYs＝每一格角色腳底的畫面 y；lineY＝防線畫面 y */
  function setMarks(rowYs, lineYpx) {
    for (const m of marks.children) m.geometry.dispose();
    marks.clear();
    const wide = 120;
    for (const y of rowYs) {
      const p = screenToGround(W / 2, y); if (!p) continue;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(wide, 0.06 * Math.max(1, -p.z / 6)), markMat);
      m.rotation.x = -Math.PI / 2; m.position.set(0, 0.03, p.z); marks.add(m);
    }
    const p = screenToGround(W / 2, lineYpx);
    if (p) {
      const tape = new THREE.Mesh(new THREE.PlaneGeometry(wide, 0.05), lineMat);
      tape.rotation.x = -Math.PI / 2; tape.position.set(0, 0.04, p.z); marks.add(tape);
      const hw = halfWidthAt(-p.z), k = Math.max(0.45, Math.min(1, hw / 1.6));
      for (const s of [-1, 1]) {           // 防線兩端的三角錐
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 12), lam(0xff6a1a));
        cone.scale.setScalar(k); cone.position.set(s * (hw - 0.12 * k), 0.11 * k, p.z); marks.add(cone);
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.04, 12), lam(0xffffff));
        ring.scale.setScalar(k); ring.position.set(s * (hw - 0.12 * k), 0.12 * k, p.z); marks.add(ring);
      }
    }
  }
  function clearMarks() { for (const m of marks.children) m.geometry.dispose(); marks.clear(); }

  /* 遊戲事件 */
  function onHit(px, py, big) {
    for (const p of crowd) if (Math.random() < (big ? 0.95 : 0.6)) p.userData.cheer = rnd(0.8, 1.3);
    bumpT = 0.25;
    if (cur === 2 || big) {
      firework(rnd(-20, 20), rnd(4, 6), rnd(-42, -32));
    }
  }
  function onDrop() { shakeT = 0.3; }
  function celebrate() {
    for (const p of crowd) p.userData.cheer = 2.5;
    for (let i = 0; i < 5; i++) setTimeout(() => firework(rnd(-22, 22), rnd(4, 6.5), rnd(-42, -32), 110), i * 260);
  }
  function setDanger(v) { danger = v; }

  /* 每幀 */
  const baseRot = new THREE.Euler();
  function frame(dt, idle) {
    time += dt;
    const l = levels[cur]; if (!l) return;
    for (const fn of l.anim) fn(time, dt);
    for (const p of crowd) {
      const u = p.userData;
      if (u.cheer > 0) {
        u.cheer -= dt;
        p.position.y = u.baseY + Math.abs(Math.sin(time * 10 + u.phase)) * 0.28;
        u.arms[0].rotation.z = -2.6 + Math.sin(time * 14 + u.phase) * 0.3; u.arms[1].rotation.z = 2.6 - Math.sin(time * 14 + u.phase) * 0.3;
      } else {
        p.position.y = u.baseY + Math.sin(time * 2 + u.phase) * 0.015;
        u.arms[0].rotation.z = -0.15; u.arms[1].rotation.z = 0.15;
      }
    }
    if (l.autoFire) { fireT -= dt; if (fireT <= 0) { fireT = rnd(1.4, 3.2); firework(rnd(-24, 24), rnd(4, 6), rnd(-44, -34)); } }
    updateFireworks(dt);
    // 鏡頭：開始畫面緩慢擺動；遊戲中只有被打中／降格時的晃動
    shakeT = Math.max(0, shakeT - dt); bumpT = Math.max(0, bumpT - dt);
    const sx = shakeT > 0 ? (Math.random() - 0.5) * 0.05 * shakeT / 0.3 : 0;
    const sy = shakeT > 0 ? (Math.random() - 0.5) * 0.04 * shakeT / 0.3 : 0;
    const idleYaw = idle ? Math.sin(time * 0.25) * 0.06 : 0;
    camera.position.set(sx, CAM_H + sy + (bumpT > 0 ? Math.sin(bumpT / 0.25 * Math.PI) * 0.02 : 0), 0);
    camera.rotation.set(-pitch, idleYaw, 0, 'YXZ');
    // 危險時把光線往紅色調
    const d = danger * (0.6 + 0.4 * Math.sin(time * 8));
    hemi.intensity = THEMES[cur].hemi[2] * (1 - d * 0.25);
    renderer.render(scene, camera);
  }

  function dispose() { renderer.dispose(); }

  return { fireworks, setLevel, resize, setMarks, clearMarks, onHit, onDrop, celebrate, setDanger, frame, screenToGround, dispose, THEMES,
    get level() { return cur; } };
}
