/**
 * The cage: turf pitch with walls you can play the ball off, small goals,
 * floodlights, a graffiti wall and a city skyline at dusk.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { rng } from "../math";
import { GOAL_DEPTH, GOAL_H, GOAL_HALF, HALF_L, HALF_W, POST_R } from "../game/field";

const BOARD_H = 1.0;
const FENCE_H = 4.6;

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")! };
}

function tex(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function glowTexture(inner = "rgba(255,255,255,1)", outer = "rgba(255,255,255,0)") {
  const { c, g } = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.25, inner.replace(/[\d.]+\)$/, "0.55)"));
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return tex(c);
}

function turfTexture() {
  const L = HALF_L * 2 + 1, W = HALF_W * 2 + 1;
  const ppm = 64; // pixels per metre
  const { c, g } = canvas(Math.round(L * ppm), Math.round(W * ppm));
  const r = rng(7);
  // Mowing stripes across the pitch.
  const stripe = 2.5 * ppm;
  for (let x = 0; x < c.width; x += stripe) {
    g.fillStyle = Math.round(x / stripe) % 2 ? "#2f8a3a" : "#287a33";
    g.fillRect(x, 0, stripe, c.height);
  }
  // Rubber crumb / fibre speckle.
  for (let i = 0; i < 26000; i++) {
    const v = r();
    g.fillStyle = v < 0.5 ? "rgba(0,0,0,0.10)" : v < 0.85 ? "rgba(120,200,110,0.10)" : "rgba(20,20,20,0.18)";
    g.fillRect(r() * c.width, r() * c.height, 2, 2);
  }
  // Lines.
  const X = (m: number) => (m + L / 2) * ppm;
  const Z = (m: number) => (m + W / 2) * ppm;
  g.strokeStyle = "rgba(255,255,255,0.85)";
  g.lineWidth = 0.09 * ppm;
  const inset = 0.45;
  g.strokeRect(X(-HALF_L + inset), Z(-HALF_W + inset), (HALF_L - inset) * 2 * ppm, (HALF_W - inset) * 2 * ppm);
  g.beginPath();
  g.moveTo(X(0), Z(-HALF_W + inset));
  g.lineTo(X(0), Z(HALF_W - inset));
  g.stroke();
  g.beginPath();
  g.arc(X(0), Z(0), 2.6 * ppm, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "rgba(255,255,255,0.9)";
  g.beginPath();
  g.arc(X(0), Z(0), 0.14 * ppm, 0, Math.PI * 2);
  g.fill();
  for (const side of [-1, 1]) {
    g.beginPath();
    g.arc(X(side * (HALF_L - inset)), Z(0), 4.2 * ppm, side < 0 ? -Math.PI / 2 : Math.PI / 2, side < 0 ? Math.PI / 2 : (3 * Math.PI) / 2);
    g.stroke();
  }
  // Big faded club mark in the centre circle.
  g.save();
  g.globalAlpha = 0.12;
  g.fillStyle = "#ffffff";
  g.font = `italic 900 ${1.7 * ppm}px Arial Black, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.translate(X(0), Z(0));
  g.fillText("5", 0, 0);
  g.restore();
  return tex(c);
}

const TAGS = ["5IVE", "GUYS", "PANNA", "SIUUU", "OGFC", "5G", "STREET", "NUTMEG", "BALLER", "TEKKERS"];
const SPRAY = ["#a855f7", "#f0abfc", "#fbbf24", "#22d3ee", "#f43f5e", "#4ade80", "#ffffff", "#fb923c"];

/** Painted kickboards: dark boards with tags, throw-ups and drips. */
function graffitiTexture(widthM: number, heightM: number, seed: number) {
  const ppm = 72;
  const { c, g } = canvas(Math.min(4096, Math.round(widthM * ppm)), Math.round(heightM * ppm));
  const r = rng(seed);
  g.fillStyle = "#1b1b21";
  g.fillRect(0, 0, c.width, c.height);
  // Board seams.
  g.fillStyle = "rgba(255,255,255,0.05)";
  for (let x = 0; x < c.width; x += 2.44 * ppm) g.fillRect(x, 0, 3, c.height);
  // Spray clouds.
  for (let i = 0; i < widthM * 0.9; i++) {
    const x = r() * c.width, y = r() * c.height, rad = (0.3 + r() * 0.8) * ppm;
    const col = SPRAY[Math.floor(r() * SPRAY.length)];
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, col + "55");
    grd.addColorStop(1, col + "00");
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // Tags.
  g.textBaseline = "middle";
  g.textAlign = "center";
  for (let x = ppm; x < c.width - ppm; x += (2.2 + r() * 2.8) * ppm) {
    const word = TAGS[Math.floor(r() * TAGS.length)];
    const size = (0.45 + r() * 0.35) * ppm;
    const fill = SPRAY[Math.floor(r() * SPRAY.length)];
    const y = c.height * (0.45 + (r() - 0.5) * 0.2);
    g.save();
    g.translate(x, y);
    g.rotate((r() - 0.5) * 0.25);
    g.font = `italic 900 ${size}px Arial Black, Impact, sans-serif`;
    g.lineJoin = "round";
    g.lineWidth = size * 0.22;
    g.strokeStyle = "#0a0a0a";
    g.strokeText(word, 0, 0);
    g.lineWidth = size * 0.08;
    g.strokeStyle = r() < 0.5 ? "#ffffff" : SPRAY[Math.floor(r() * SPRAY.length)];
    g.strokeText(word, 0, 0);
    g.fillStyle = fill;
    g.fillText(word, 0, 0);
    // Drips.
    g.fillStyle = fill;
    for (let d = 0; d < 3; d++) g.fillRect((r() - 0.5) * size * 2, size * 0.3, 2, size * (0.2 + r() * 0.5));
    g.restore();
  }
  // Scuffs from the ball.
  for (let i = 0; i < widthM * 3; i++) {
    g.fillStyle = "rgba(0,0,0,0.25)";
    g.beginPath();
    g.arc(r() * c.width, c.height * (0.3 + r() * 0.6), 4 + r() * 8, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c);
}

/** The big mural on the wall behind the far fence. */
function muralTexture() {
  const { c, g } = canvas(2048, 320);
  const r = rng(42);
  // Brick.
  g.fillStyle = "#3a2630";
  g.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < c.height; y += 16) {
    for (let x = (y / 16) % 2 ? -16 : 0; x < c.width; x += 32) {
      g.fillStyle = `rgba(${90 + r() * 30},${50 + r() * 20},${60 + r() * 20},0.55)`;
      g.fillRect(x + 1, y + 1, 30, 14);
    }
  }
  // Background throw-ups.
  for (let i = 0; i < 18; i++) {
    const x = r() * c.width, y = r() * c.height, rad = 60 + r() * 120;
    const col = SPRAY[Math.floor(r() * SPRAY.length)];
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, col + "88");
    grd.addColorStop(1, col + "00");
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // Centre piece: 5IVE GUYS.
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  const piece = (text: string, x: number, y: number, size: number, fillTop: string, fillBot: string) => {
    g.save();
    g.translate(x, y);
    g.rotate(-0.04);
    g.font = `italic 900 ${size}px Arial Black, Impact, sans-serif`;
    g.lineWidth = size * 0.3;
    g.strokeStyle = "#0b0b0b";
    g.strokeText(text, 8, 10);
    g.strokeText(text, 0, 0);
    g.lineWidth = size * 0.1;
    g.strokeStyle = "#ffffff";
    g.strokeText(text, 0, 0);
    const grd = g.createLinearGradient(0, -size / 2, 0, size / 2);
    grd.addColorStop(0, fillTop);
    grd.addColorStop(1, fillBot);
    g.fillStyle = grd;
    g.fillText(text, 0, 0);
    g.restore();
  };
  piece("5IVE GUYS", 1024, 170, 190, "#f0abfc", "#7e22ce");
  piece("STREET", 330, 120, 90, "#fde68a", "#f59e0b");
  piece("3v3", 1740, 130, 100, "#a5f3fc", "#0891b2");
  return tex(c);
}

function netTexture(color: string, cell = 16) {
  const { c, g } = canvas(64, 64);
  g.strokeStyle = color;
  g.lineWidth = 2;
  for (let i = 0; i <= 64; i += cell) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(64, i); g.stroke();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function windowTexture(seed: number) {
  const { c, g } = canvas(64, 128);
  const r = rng(seed);
  g.fillStyle = "#000000";
  g.fillRect(0, 0, 64, 128);
  for (let y = 4; y < 124; y += 8) {
    for (let x = 4; x < 60; x += 8) {
      if (r() < 0.35) {
        const warm = r() < 0.7;
        g.fillStyle = warm ? `rgba(255,${190 + r() * 50},${110 + r() * 60},${0.6 + r() * 0.4})` : `rgba(170,200,255,${0.5 + r() * 0.4})`;
        g.fillRect(x, y, 5, 5);
      }
    }
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  return t;
}

function skyDome() {
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color("#0c0820") },
      mid: { value: new THREE.Color("#3b1a63") },
      low: { value: new THREE.Color("#e2734a") },
    },
    vertexShader: `varying vec3 vPos; void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 mid; uniform vec3 low; varying vec3 vPos;
      void main() {
        float h = normalize(vPos).y;
        vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.6, h)) : mix(low, mid, smoothstep(-0.02, 0.12, h));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  return new THREE.Mesh(geo, m);
}

export interface Arena {
  group: THREE.Group;
  sun: THREE.DirectionalLight;
}

export function buildArena(): Arena {
  const group = new THREE.Group();
  const r = rng(99);

  group.add(skyDome());

  // Stars.
  const starPos: number[] = [];
  for (let i = 0; i < 300; i++) {
    const th = r() * Math.PI * 2, ph = 0.15 + r() * 1.2;
    starPos.push(Math.cos(th) * Math.cos(ph) * 380, Math.sin(ph) * 380, Math.sin(th) * Math.cos(ph) * 380);
  }
  const stars = new THREE.Points(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3)),
    new THREE.PointsMaterial({ color: "#ffffff", size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.7 }),
  );
  group.add(stars);

  // Ground around the cage.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshStandardMaterial({ color: "#26232b", roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  group.add(ground);

  // Turf.
  const turf = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF_L * 2 + 1, HALF_W * 2 + 1),
    new THREE.MeshStandardMaterial({ map: turfTexture(), roughness: 0.92 }),
  );
  turf.rotation.x = -Math.PI / 2;
  turf.receiveShadow = true;
  group.add(turf);

  // Kickboards with graffiti, and the metal rail on top.
  const boardMat = (w: number, seed: number) => new THREE.MeshStandardMaterial({ map: graffitiTexture(w, BOARD_H, seed), roughness: 0.8 });
  const plain = new THREE.MeshStandardMaterial({ color: "#1b1b21", roughness: 0.8 });
  const rail = new THREE.MeshStandardMaterial({ color: "#9ca3af", roughness: 0.35, metalness: 0.7 });
  const board = (w: number, x: number, z: number, rotY: number, seed: number) => {
    const g = new THREE.BoxGeometry(w, BOARD_H, 0.14);
    const art = boardMat(w, seed);
    // Box faces: +x, -x, +y, -y, +z (inner face after rotation), -z.
    const m = new THREE.Mesh(g, [plain, plain, plain, plain, art, plain]);
    m.position.set(x, BOARD_H / 2, z);
    m.rotation.y = rotY;
    m.receiveShadow = true;
    group.add(m);
    const rl = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, w, 8), rail);
    rl.rotation.z = Math.PI / 2;
    rl.position.set(0, BOARD_H / 2 + 0.03, 0);
    m.add(rl);
  };
  board(HALF_L * 2 + 0.3, 0, -HALF_W - 0.07, 0, 11); // far side (faces +z)
  board(HALF_L * 2 + 0.3, 0, HALF_W + 0.07, Math.PI, 12); // near side
  const endW = HALF_W - GOAL_HALF;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      board(endW, sx * (HALF_L + 0.07), sz * (GOAL_HALF + endW / 2), -sx * Math.PI / 2, 20 + sx * 3 + sz);
    }
  }

  // Fence posts and netting on the far side and both ends (the near side stays low so it doesn't block the view).
  const postMat = new THREE.MeshStandardMaterial({ color: "#1f2f25", roughness: 0.6, metalness: 0.4 });
  const fenceNet = netTexture("rgba(40,90,60,0.9)", 8);
  const fence = (w: number, h: number, x: number, y: number, z: number, rotY: number) => {
    const t = fenceNet.clone();
    t.repeat.set(w * 2.2, h * 2.2);
    t.needsUpdate = true;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.85 }),
    );
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    group.add(m);
  };
  fence(HALF_L * 2, FENCE_H - BOARD_H, 0, BOARD_H + (FENCE_H - BOARD_H) / 2, -HALF_W - 0.1, 0);
  for (const sx of [-1, 1]) {
    fence(endW, FENCE_H - BOARD_H, sx * (HALF_L + 0.1), BOARD_H + (FENCE_H - BOARD_H) / 2, -(GOAL_HALF + endW / 2), Math.PI / 2);
    fence(endW, FENCE_H - BOARD_H, sx * (HALF_L + 0.1), BOARD_H + (FENCE_H - BOARD_H) / 2, GOAL_HALF + endW / 2, Math.PI / 2);
    fence(GOAL_HALF * 2, FENCE_H - GOAL_H, sx * (HALF_L + GOAL_DEPTH + 0.1), GOAL_H + (FENCE_H - GOAL_H) / 2, 0, Math.PI / 2);
  }
  const post = (x: number, z: number, h: number) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, h, 8), postMat);
    m.position.set(x, h / 2, z);
    group.add(m);
  };
  for (let x = -HALF_L; x <= HALF_L + 0.01; x += 3) post(x, -HALF_W - 0.12, FENCE_H);
  for (const sx of [-1, 1]) for (const z of [-HALF_W, -GOAL_HALF - 3.6, GOAL_HALF + 3.6, HALF_W]) post(sx * (HALF_L + 0.12), z, FENCE_H);
  const topRail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, HALF_L * 2, 8), postMat);
  topRail.rotation.z = Math.PI / 2;
  topRail.position.set(0, FENCE_H, -HALF_W - 0.12);
  group.add(topRail);

  // Goals: white frame, net box set into the end walls.
  const frameMat = new THREE.MeshStandardMaterial({ color: "#f4f4f5", roughness: 0.35, metalness: 0.1 });
  const goalNet = netTexture("rgba(255,255,255,0.95)", 16);
  const bar = (len: number, from: THREE.Vector3, axis: "x" | "y" | "z", parent: THREE.Object3D, r0 = POST_R) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r0, len, 12), frameMat);
    if (axis === "x") m.rotation.z = Math.PI / 2;
    if (axis === "z") m.rotation.x = Math.PI / 2;
    m.position.copy(from);
    m.castShadow = true;
    parent.add(m);
  };
  for (const sx of [-1, 1]) {
    const goal = new THREE.Group();
    goal.position.x = sx * HALF_L;
    group.add(goal);
    const back = sx * GOAL_DEPTH;
    for (const sz of [-1, 1]) {
      bar(GOAL_H, new THREE.Vector3(0, GOAL_H / 2, sz * GOAL_HALF), "y", goal);
      bar(GOAL_H, new THREE.Vector3(back, GOAL_H / 2, sz * GOAL_HALF), "y", goal, 0.03);
      bar(GOAL_DEPTH, new THREE.Vector3(back / 2, GOAL_H, sz * GOAL_HALF), "x", goal, 0.03);
      bar(GOAL_DEPTH, new THREE.Vector3(back / 2, 0.02, sz * GOAL_HALF), "x", goal, 0.03);
    }
    bar(GOAL_HALF * 2 + POST_R * 2, new THREE.Vector3(0, GOAL_H, 0), "z", goal);
    bar(GOAL_HALF * 2, new THREE.Vector3(back, GOAL_H, 0), "z", goal, 0.03);
    const netMat = (w: number, h: number) => {
      const t = goalNet.clone();
      t.repeat.set(w * 6, h * 6);
      t.needsUpdate = true;
      return new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.8 });
    };
    const backNet = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_HALF * 2, GOAL_H), netMat(GOAL_HALF * 2, GOAL_H));
    backNet.position.set(back, GOAL_H / 2, 0);
    backNet.rotation.y = Math.PI / 2;
    goal.add(backNet);
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_DEPTH, GOAL_HALF * 2), netMat(GOAL_DEPTH, GOAL_HALF * 2));
    roof.rotation.x = -Math.PI / 2;
    roof.position.set(back / 2, GOAL_H, 0);
    goal.add(roof);
    for (const sz of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_DEPTH, GOAL_H), netMat(GOAL_DEPTH, GOAL_H));
      side.position.set(back / 2, GOAL_H / 2, sz * GOAL_HALF);
      goal.add(side);
    }
    // Turf inside the goal.
    const gt = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_DEPTH, GOAL_HALF * 2), new THREE.MeshStandardMaterial({ color: "#256f30", roughness: 0.95 }));
    gt.rotation.x = -Math.PI / 2;
    gt.position.set(back / 2, 0.005, 0);
    gt.receiveShadow = true;
    goal.add(gt);
  }

  // Mural wall behind the far fence.
  const mural = new THREE.Mesh(new THREE.PlaneGeometry(52, 8.1), new THREE.MeshStandardMaterial({ map: muralTexture(), roughness: 0.9 }));
  mural.position.set(0, 4.05, -HALF_W - 5.5);
  mural.receiveShadow = true;
  group.add(mural);

  // Floodlights.
  const glow = glowTexture("rgba(255,244,220,1)");
  const lampMat = new THREE.MeshBasicMaterial({ color: "#fffaf0" });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (HALF_L + 3.5), z = sz * (HALF_W + 3.2);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 12, 8), postMat);
      pole.position.set(x, 6, z);
      group.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 0.25), lampMat);
      head.position.set(x - sx * 0.3, 12.1, z - sz * 0.3);
      head.lookAt(0, 0, 0);
      group.add(head);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: "#ffe9c4", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      sprite.scale.setScalar(7);
      sprite.position.copy(head.position);
      group.add(sprite);
    }
  }

  // Skyline: every building merged into one mesh (one draw call), windows tiled via UVs.
  const blocks: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2;
    const d = 42 + r() * 45;
    const w = 6 + r() * 12, dpt = 6 + r() * 10, h = 10 + r() * (r() < 0.15 ? 55 : 26);
    const g = new THREE.BoxGeometry(w, h, dpt);
    // Box faces are 4 verts each in order +x, -x, +y, -y, +z, -z; tile windows ~3m × 6m.
    const uv = g.attributes.uv;
    const shift = r();
    for (let f = 0; f < 6; f++) {
      const across = f < 2 ? dpt : w;
      const tall = f === 2 || f === 3 ? 0 : h;
      for (let k = 0; k < 4; k++) {
        const i4 = f * 4 + k;
        uv.setXY(i4, uv.getX(i4) * Math.max(1, Math.round(across / 3)) + shift, uv.getY(i4) * Math.round(tall / 6));
      }
    }
    g.rotateY(-a + Math.PI / 2);
    g.translate(Math.cos(a) * d, h / 2, Math.sin(a) * d);
    blocks.push(g);
  }
  const win = windowTexture(100);
  const skyline = new THREE.Mesh(
    mergeGeometries(blocks, false)!,
    new THREE.MeshStandardMaterial({ color: "#16121f", roughness: 0.9, emissive: "#ffffff", emissiveMap: win, emissiveIntensity: 0.9 }),
  );
  group.add(skyline);

  // Lighting: floodlight key light with shadows, sky fill and a purple rim.
  group.add(new THREE.HemisphereLight("#9fb0ff", "#2c3a22", 1.1));
  const sun = new THREE.DirectionalLight("#fff1dc", 2.4);
  sun.position.set(9, 24, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -22; sc.right = 22; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 70;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  group.add(sun);
  group.add(sun.target);
  const rim = new THREE.DirectionalLight("#c084fc", 0.9);
  rim.position.set(-6, 8, -18);
  group.add(rim);

  return { group, sun };
}
