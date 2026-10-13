/**
 * Procedural 3D footballer, built from simple shapes and rigged with a joint
 * hierarchy that `pose.ts` animates. Each player's look (skin, hair, beard,
 * build, boots) comes from their card — see roster.ts.
 *
 * Local axes: the player faces +z, their left is +x, y is up. 1 unit = 1 metre.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { hashString, rng } from "../math";
import type { FaceCrop, HairStyle, Look } from "../roster";
import { KITS, shirtTexture, type KitId } from "./kits";

export interface Joints {
  pelvis: THREE.Group;
  spine: THREE.Group;
  neck: THREE.Group;
  lShoulder: THREE.Group;
  lElbow: THREE.Group;
  rShoulder: THREE.Group;
  rElbow: THREE.Group;
  lHip: THREE.Group;
  lKnee: THREE.Group;
  lAnkle: THREE.Group;
  rHip: THREE.Group;
  rKnee: THREE.Group;
  rAnkle: THREE.Group;
}

export interface PlayerModel {
  root: THREE.Group;
  /** Rotates/offsets the whole body (slides, celebrations) without moving `root`. */
  body: THREE.Group;
  joints: Joints;
  setKit(kit: KitId): void;
  setGlow(on: boolean): void;
  /** Swap the drawn face for the player's real face from their card art. */
  applyFace(img: HTMLImageElement, crop: FaceCrop): void;
  /** Hip height at rest, for posing. */
  hipHeight: number;
}

const HEAD_R = 0.125;
/** Head scale (x narrower than y). */
const HEAD_SX = 0.88;
const HEAD_SY = 1.1;
// Where the photo's eyes and chin land on the head (head-local y).
const EYE_Y = 0.02;
const CHIN_Y = -0.115;
/** Half-size of the square (head-local units) the face texture covers. */
const DECAL_E = 0.135;


const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, roughness = 0.75, metalness = 0) {
  const k = `${color}|${roughness}|${metalness}`;
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    matCache.set(k, m);
  }
  return m;
}

function mesh(geo: THREE.BufferGeometry, material: THREE.Material, parent?: THREE.Object3D) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = false;
  parent?.add(m);
  return m;
}

function group(parent: THREE.Object3D, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/** Capsule hanging down from its joint (top at y=0). */
function limb(radius: number, length: number, material: THREE.Material, parent: THREE.Object3D, r2 = radius) {
  const geo = taperedCapsule(radius, r2, length);
  const m = mesh(geo, material, parent);
  return m;
}

/** A capsule whose radius tapers from top `r1` to bottom `r2`, top at y=0 going down to -len. */
function taperedCapsule(r1: number, r2: number, len: number) {
  const pts: THREE.Vector2[] = [];
  const steps = 6;
  // Bottom pole up to the widest point of the lower cap…
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (i / steps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(a) * r2, -len + r2 + Math.sin(a) * r2));
  }
  // …then from the widest point of the upper cap to the top pole at y=0.
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(a) * r1, -r1 + Math.sin(a) * r1));
  }
  pts[0].x = 0;
  pts[pts.length - 1].x = 0;
  return new THREE.LatheGeometry(pts, 14);
}

function sphereGeo(r: number, w = 16, h = 12) {
  return new THREE.SphereGeometry(r, w, h);
}

/** Points on the head sphere: theta from the top (0) down, phi around from the front (+z). */
function onHead(r: number, theta: number, phi: number) {
  return new THREE.Vector3(r * Math.sin(theta) * Math.sin(phi), r * Math.cos(theta), r * Math.sin(theta) * Math.cos(phi));
}

function colorize(geo: THREE.BufferGeometry, color: THREE.Color) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}

/**
 * Give the head sphere a jaw and a flatter face. Applied to the head, the face
 * decal and the hair so they all stay on the same surface.
 */
function shapeHead(geo: THREE.BufferGeometry) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), z = pos.getZ(i);
    const y = pos.getY(i);
    const ny = y / HEAD_R;
    if (ny < 0) {
      const t = Math.min(1, -ny);
      x *= 1 - 0.2 * t * t;
      z *= 1 - 0.05 * t;
    }
    if (z > 0) z *= 0.93;
    pos.setXYZ(i, x, y, z);
  }
  return geo;
}

let strandTex: THREE.CanvasTexture | null = null;
/** Grey strand noise, multiplied over the hair colours for texture. */
function hairTexture() {
  if (strandTex) return strandTex;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const r = rng(5);
  g.fillStyle = "#d8d8d8";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const v = Math.floor(120 + r() * 135);
    g.strokeStyle = `rgba(${v},${v},${v},0.8)`;
    g.lineWidth = 1 + r() * 1.5;
    const x = r() * 256, y = r() * 256, l = 8 + r() * 26, a = Math.PI / 2 + (r() - 0.5) * 0.6;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (r() - 0.5) * 6, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  strandTex = new THREE.CanvasTexture(c);
  strandTex.wrapS = strandTex.wrapT = THREE.RepeatWrapping;
  strandTex.repeat.set(3, 3);
  return strandTex;
}

/** Hair is many small shapes merged into one mesh with per-piece colour variation. */
function buildHair(style: HairStyle, look: Look, seed: number): THREE.BufferGeometry {
  const r = rng(seed);
  const base = new THREE.Color(look.hair);
  const tip = new THREE.Color(look.hairTip ?? look.hair);
  const skin = new THREE.Color(look.skin);
  /** Short faded sides: hair colour with skin showing through. */
  const fade = base.clone().lerp(skin, 0.4);
  const pieces: THREE.BufferGeometry[] = [];
  const shade = (c: THREE.Color, v = 0.18) => c.clone().multiplyScalar(1 - v / 2 + r() * v);

  const add = (geo: THREE.BufferGeometry, color: THREE.Color) => pieces.push(colorize(geo.toNonIndexed(), color));

  /** Skull cap following the head, down to `thetaSide` at the sides/back, raised to `thetaFront` at the hairline. */
  const cap = (thetaSide: number, thetaFront: number, scale: number, color: THREE.Color) => {
    const geo = new THREE.SphereGeometry(HEAD_R * scale, 40, 24, 0, Math.PI * 2, 0, thetaSide);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const th = Math.acos(THREE.MathUtils.clamp(v.y / (HEAD_R * scale), -1, 1));
      const front = Math.max(0, v.z / (HEAD_R * scale)) ** 1.5;
      const limit = thetaSide + (thetaFront - thetaSide) * front;
      if (th > limit) {
        v.copy(onHead(HEAD_R * scale, limit, Math.atan2(v.x, v.z)));
        pos.setXYZ(i, v.x, v.y, v.z);
      }
    }
    geo.computeVertexNormals();
    add(geo, color);
  };

  const curl = (p: THREE.Vector3, size: number, color: THREE.Color) => {
    const g = sphereGeo(size, 7, 5);
    g.rotateY(r() * Math.PI);
    g.scale(1, 0.85 + r() * 0.3, 1);
    g.translate(p.x, p.y, p.z);
    add(g, color);
  };

  /** Tapered strand from `start` along `dir`. */
  const strand = (start: THREE.Vector3, dir: THREE.Vector3, length: number, r0: number, color: THREE.Color) => {
    const g = new THREE.ConeGeometry(r0, length, 6, 1);
    g.translate(0, length / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
    g.translate(start.x, start.y, start.z);
    add(g, color);
  };

  /**
   * A flattened clump of hair lying on the scalp at `p`, combed along `dir`
   * (projected onto the scalp). Reads as hair much better than spikes.
   */
  const clump = (p: THREE.Vector3, dir: THREE.Vector3, length: number, width: number, thick: number, color: THREE.Color, rise = 0) => {
    const n = p.clone().normalize();
    const t = dir.clone().sub(n.clone().multiplyScalar(dir.dot(n))).normalize();
    t.add(n.clone().multiplyScalar(rise)).normalize();
    const side = new THREE.Vector3().crossVectors(n, t).normalize();
    const nn = new THREE.Vector3().crossVectors(t, side).normalize();
    const g = sphereGeo(1, 10, 6);
    g.scale(width, thick, length);
    g.applyMatrix4(new THREE.Matrix4().makeBasis(side, nn, t));
    g.translate(p.x, p.y, p.z);
    add(g, color);
  };

  /** Is this point of the head part of the face (keep hair off it)? */
  const onFace = (th: number, ph: number, top = 0.95) => th > top && Math.cos(ph) > 0.35;

  switch (style) {
    case "curlyMop": {
      // Louis: a big mop of dark curls covering the ears and falling onto the forehead.
      cap(1.85, 0.95, 1.03, base);
      for (let i = 0; i < 300; i++) {
        const th = Math.acos(1 - r() * 1.3);
        const ph = (r() * 2 - 1) * Math.PI;
        if (th > 1.85 || onFace(th, ph, 0.92)) continue;
        curl(onHead(HEAD_R * (1.07 + r() * 0.13 - (th > 1.4 ? 0.04 : 0)), th, ph), 0.021 + r() * 0.012, shade(base, 0.35));
      }
      for (let i = 0; i < 16; i++) {
        const ph = (r() - 0.5) * 1.5;
        curl(onHead(HEAD_R * 1.08, 0.86 + r() * 0.2, ph), 0.018 + r() * 0.008, shade(base, 0.3));
      }
      break;
    }
    case "curlyTop": {
      // Neymar: short faded sides; a dome of small curls on top with lighter tips, a few on the forehead.
      cap(1.62, 1.02, 1.012, fade);
      for (let i = 0; i < 240; i++) {
        const th = Math.acos(1 - r() * 0.48);
        const ph = (r() * 2 - 1) * Math.PI;
        const lift = 0.038 * (1 - th / 1.05) + r() * 0.014;
        const p = onHead(HEAD_R * 1.04 + lift, th, ph);
        p.z += 0.008;
        curl(p, 0.017 + r() * 0.008, shade(base.clone().lerp(tip, Math.min(1, lift / 0.045 * 0.8 + r() * 0.35)), 0.2));
      }
      for (let i = 0; i < 12; i++) {
        curl(onHead(HEAD_R * 1.07, 0.84 + r() * 0.2, (r() - 0.5) * 1.1), 0.016 + r() * 0.006, base.clone().lerp(tip, 0.5 + r() * 0.4));
      }
      break;
    }
    case "shortCurly": {
      // Barney: short, tight dark curls with a crisp hairline and a little height on top.
      cap(1.56, 0.93, 1.025, base);
      for (let i = 0; i < 420; i++) {
        const th = Math.acos(1 - r() * 1.0);
        const ph = (r() * 2 - 1) * Math.PI;
        if (th > 1.5 || onFace(th, ph, 0.9)) continue;
        const lift = th < 0.7 ? 0.012 * (1 - th / 0.7) : 0;
        curl(onHead(HEAD_R * 1.03 + lift, th, ph), 0.0085 + r() * 0.004, shade(base, 0.45));
      }
      break;
    }
    case "messy": {
      // Oscar: short sides, a longer textured top pushed forward.
      cap(1.58, 0.96, 1.015, base.clone().lerp(skin, 0.15));
      for (let i = 0; i < 70; i++) {
        const th = 0.05 + r() * 0.95;
        const ph = (r() * 2 - 1) * 2.4;
        if (th > 0.75 && Math.abs(ph) > 1.6) continue;
        const p = onHead(HEAD_R * (1.04 + 0.03 * (1 - th)), th, ph);
        const dir = new THREE.Vector3((r() - 0.5) * 0.6, 0, 1);
        clump(p, dir, 0.045 + r() * 0.035, 0.02 + r() * 0.01, 0.011, shade(base, 0.35), 0.15 + r() * 0.2);
      }
      break;
    }
    case "locs": {
      // Uriel: twists from the crown hanging to the jaw, framing the face.
      cap(1.6, 0.95, 1.03, base);
      for (let i = 0; i < 56; i++) {
        const ph = (i / 56) * Math.PI * 2 + (r() - 0.5) * 0.12;
        const front = Math.cos(ph);
        if (front > 0.8) continue;
        const th = 0.5 + r() * 0.4;
        const start = onHead(HEAD_R * 1.05, th, ph);
        const length = (front > 0.3 ? 0.14 : 0.2) + r() * 0.1;
        const g = new THREE.CylinderGeometry(0.013, 0.011, length, 6, 3);
        g.translate(0, -length / 2, 0);
        const out = new THREE.Vector3(Math.sin(ph), 0, front).multiplyScalar(0.3);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(out.x, -1, out.z).normalize()));
        g.translate(start.x, start.y, start.z);
        add(g, shade(base, 0.3));
      }
      for (let i = 0; i < 40; i++) {
        const ph = r() * Math.PI * 2;
        clump(onHead(HEAD_R * 1.045, r() * 0.75, ph), new THREE.Vector3(Math.sin(ph), -0.5, Math.cos(ph)), 0.05, 0.014, 0.012, shade(base, 0.3));
      }
      break;
    }
    case "quiff": {
      // Raptis: faded sides, longer top swept up and back from the hairline.
      cap(1.58, 1.0, 1.012, fade);
      for (let i = 0; i < 90; i++) {
        const ph = (r() * 2 - 1) * 1.3;
        // Stay behind the hairline at the front; reach further down at the sides.
        const th = 0.1 + r() * (0.62 + 0.3 * (1 - Math.max(0, Math.cos(ph))));
        const front = Math.max(0, Math.cos(ph)) * (th / 0.72);
        const p = onHead(HEAD_R * (1.04 + 0.045 * front), th, ph);
        const dir = new THREE.Vector3(Math.sin(ph) * 0.25, 0.35, -1);
        clump(p, dir, 0.06 + r() * 0.04, 0.024 + r() * 0.01, 0.014, shade(base, 0.3), 0.3 * front);
      }
      break;
    }
  }

  return shapeHead(mergeGeometries(pieces, false)!);
}

/** A patch of the head shell: theta from the top, phi centred on the front (+z). */
function headShell(scale: number, thetaStart: number, thetaLength: number, phiCenter: number, phiSpan: number) {
  // three's SphereGeometry puts phi=π/2 at +z, so shift to centre the patch on the face.
  return new THREE.SphereGeometry(HEAD_R * scale, 24, 10, Math.PI / 2 + phiCenter - phiSpan / 2, phiSpan, thetaStart, thetaLength);
}

function buildBeard(kind: Look["beard"], look: Look): THREE.Mesh[] {
  if (kind === "none") return [];
  const hair = new THREE.Color(look.hair);
  const out: THREE.Mesh[] = [];
  if (kind === "stubble") {
    const stubble = new THREE.MeshStandardMaterial({ color: new THREE.Color(look.skin).lerp(hair, 0.3), roughness: 0.95 });
    out.push(new THREE.Mesh(headShell(1.006, 1.95, 0.85, 0, 2.7), stubble));
    return out;
  }
  const m = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.95 });
  // Chin (below the mouth).
  out.push(new THREE.Mesh(headShell(1.035, 2.18, 0.75, 0, kind === "full" ? 1.5 : 0.9), m));
  if (kind === "full") {
    // Jaw line up to the sideburns on both sides.
    for (const side of [1, -1]) out.push(new THREE.Mesh(headShell(1.03, 1.65, 1.1, side * 1.05, 1.0), m));
  }
  // Moustache.
  const mo = new THREE.TorusGeometry(0.028, 0.008, 6, 12, Math.PI);
  mo.translate(0, -0.045, HEAD_R * 0.955);
  out.push(new THREE.Mesh(mo, m));
  return out;
}

/** Front of the head with UVs projected straight on, matching the face texture. */
function faceDecalGeometry() {
  const geo = shapeHead(new THREE.SphereGeometry(HEAD_R * 1.004, 40, 32, Math.PI / 2 - 1.35, 2.7, 0.55, 2.3));
  geo.computeVertexNormals();
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, 0.5 + pos.getX(i) / (2 * DECAL_E), 0.5 + pos.getY(i) / (2 * DECAL_E));
  }
  return geo;
}

/**
 * Cut the face out of the card: scale it so the eyes and chin land on the
 * head's eye line and chin, feather the edges, and sample the skin tone.
 */
function faceTexture(img: HTMLImageElement, crop: FaceCrop) {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d", { willReadFrequently: true });
  const maskW = crop.w ?? 1;
  if (!g || !img.naturalWidth) return null;
  const W = img.naturalWidth, H = img.naturalHeight;
  const perUnit = S / (2 * DECAL_E); // canvas px per head unit
  const ky = ((crop.chin - crop.y) * H) / (EYE_Y - CHIN_Y); // card px per head unit (vertical)
  const kx = (ky * HEAD_SX) / HEAD_SY; // keeps the face's proportions once the head is scaled
  const ax = perUnit / kx, ay = perUnit / ky;
  g.setTransform(ax, 0, 0, ay, S / 2 - crop.x * W * ax, S / 2 - EYE_Y * perUnit - crop.y * H * ay);
  try {
    g.drawImage(img, 0, 0);
  } catch {
    return null;
  }
  g.setTransform(1, 0, 0, 1, 0, 0);

  // Skin tone from both cheeks.
  const toPx = (x: number, y: number) => [S / 2 + x * perUnit, S / 2 - y * perUnit] as const;
  let r = 0, gg = 0, b = 0, n = 0;
  try {
    for (const [hx, hy] of [[-0.045, -0.03], [0.045, -0.03], [0, 0.05], [-0.03, 0.045], [0.03, 0.045]]) {
      const [px, py] = toPx(hx * maskW, hy);
      const d = g.getImageData(Math.round(px) - 5, Math.round(py) - 5, 11, 11).data;
      for (let i = 0; i < d.length; i += 4) {
        // Skin only: skip the card's purple background, shadows and highlights.
        const [pr, pg, pb] = [d[i], d[i + 1], d[i + 2]];
        if (pr < pb + 12 || pr < pg || pr < 50 || pr > 250) continue;
        r += pr; gg += pg; b += pb; n++;
      }
    }
  } catch {
    return null; // cross-origin image: canvas is tainted
  }
  if (!n) return null;
  const skin = new THREE.Color().setRGB(r / n / 255, gg / n / 255, b / n / 255, THREE.SRGBColorSpace);

  // Feathered oval mask.
  const [cx, cy] = toPx(0, -0.03);
  g.globalCompositeOperation = "destination-in";
  g.save();
  g.translate(cx, cy);
  g.scale(maskW, 1.06);
  const rad = 0.1 * perUnit;
  const grd = g.createRadialGradient(0, 0, rad * 0.62, 0, 0, rad);
  grd.addColorStop(0, "rgba(0,0,0,1)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(-rad * 1.2, -rad * 1.2, rad * 2.4, rad * 2.4);
  g.restore();

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, skin };
}

export function buildPlayer(name: string, look: Look, kitId: KitId): PlayerModel {
  const seed = hashString(name);
  const s = look.height / 1.8;
  const w = look.build;

  // Per-player skin material: its colour is matched to the card photo once loaded.
  const skin = new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.6 });
  const hairMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, map: hairTexture() });
  const boot = mat(look.boots, 0.35, 0.1);
  const sole = mat("#e5e5e5", 0.6);

  // Kit materials (swapped by setKit).
  const shirtTex: Partial<Record<KitId, THREE.CanvasTexture>> = {};
  const shirt = new THREE.MeshStandardMaterial({ roughness: 0.7 });
  const sleeve = new THREE.MeshStandardMaterial({ roughness: 0.7 });
  const trim = new THREE.MeshStandardMaterial({ roughness: 0.6 });
  const shorts = new THREE.MeshStandardMaterial({ roughness: 0.75 });
  const socks = new THREE.MeshStandardMaterial({ roughness: 0.8 });

  const root = new THREE.Group();
  root.name = name;
  const body = group(root);
  body.scale.setScalar(s);

  const hipHeight = 0.93;
  const pelvis = group(body, 0, hipHeight, 0);

  // Shorts block around the hips.
  const shortsGeo = new THREE.CylinderGeometry(0.16, 0.17, 0.2, 16);
  shortsGeo.scale(1.08 * w, 1, 0.75);
  shortsGeo.translate(0, -0.06, 0);
  mesh(shortsGeo, shorts, pelvis);

  const spine = group(pelvis, 0, 0.02, 0);
  // Torso: a lathe profile (waist → chest → shoulders → neck), flattened front-to-back.
  const prof = [
    [0.15, 0.0], [0.155, 0.06], [0.165, 0.14], [0.18, 0.22], [0.195, 0.3], [0.205, 0.37],
    [0.2, 0.42], [0.18, 0.47], [0.14, 0.51], [0.085, 0.535], [0.06, 0.545],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const torsoGeo = new THREE.LatheGeometry(prof, 32, Math.PI / 2);
  torsoGeo.scale(1.12 * w, 1, 0.66 * (0.9 + 0.1 * w));
  mesh(torsoGeo, shirt, spine);

  // Collar ring.
  const collar = new THREE.TorusGeometry(0.062, 0.016, 8, 20);
  collar.rotateX(Math.PI / 2 + 0.25);
  collar.translate(0, 0.545, 0.004);
  mesh(collar, trim, spine);

  const neck = group(spine, 0, 0.55, 0);
  const neckGeo = new THREE.CylinderGeometry(0.056, 0.064, 0.12, 14);
  neckGeo.translate(0, 0.04, 0);
  mesh(neckGeo, skin, neck);
  if (look.snood) {
    const sn = new THREE.CylinderGeometry(0.075, 0.085, 0.09, 14);
    sn.translate(0, 0.03, 0);
    mesh(sn, mat("#111111", 0.9), neck);
  }

  // Head: slightly oversized for readability at gameplay distance.
  const head = group(neck, 0, 0.165, 0.012);
  head.scale.set(HEAD_SX * 1.12, HEAD_SY * 1.12, 1.0 * 1.12);
  const skull = shapeHead(sphereGeo(HEAD_R, 36, 28));
  skull.computeVertexNormals();
  mesh(skull, skin, head);

  // Ears.
  for (const sx of [1, -1]) {
    const e = sphereGeo(0.032, 10, 8);
    e.scale(0.45, 1, 0.75);
    e.translate(sx * HEAD_R * 0.98, -0.005, -0.005);
    mesh(e, skin, head);
    if (look.earrings) {
      const ring = sphereGeo(0.006, 8, 6);
      ring.translate(sx * HEAD_R * 0.99, -0.035, 0.005);
      mesh(ring, mat("#f8fafc", 0.2, 0.8), head);
    }
  }

  // Drawn face, replaced by the card photo when it loads (applyFace).
  const features = group(head);
  const white = mat("#f8f8f5", 0.4);
  const iris = mat("#1b130e", 0.3);
  const brow = mat(look.hair, 0.9);
  for (const sx of [1, -1]) {
    const eye = sphereGeo(0.021, 12, 10);
    eye.scale(1.15, 0.85, 0.6);
    eye.translate(sx * 0.043, 0.012, HEAD_R * 0.905);
    mesh(eye, white, features);
    const pupil = sphereGeo(0.0115, 10, 8);
    pupil.scale(1, 1, 0.6);
    pupil.translate(sx * 0.042, 0.011, HEAD_R * 0.905 + 0.012);
    mesh(pupil, iris, features);
    const b = new THREE.BoxGeometry(0.05, 0.011, 0.014);
    b.rotateZ(sx * -0.12);
    b.translate(sx * 0.045, 0.047, HEAD_R * 0.93);
    mesh(b, brow, features);
  }
  const nose = sphereGeo(0.021, 10, 8);
  nose.scale(0.8, 1.1, 1.0);
  nose.translate(0, -0.018, HEAD_R * 0.99);
  mesh(nose, skin, features);
  const mouthMat = mat(look.smile ? "#5a1d1d" : "#6b3a32", 0.6);
  if (look.smile) {
    const smile = new THREE.TorusGeometry(0.03, 0.008, 6, 14, Math.PI);
    smile.rotateZ(Math.PI);
    smile.translate(0, -0.05, HEAD_R * 0.93);
    mesh(smile, mouthMat, features);
    const teeth = new THREE.BoxGeometry(0.044, 0.01, 0.01);
    teeth.translate(0, -0.06, HEAD_R * 0.945);
    mesh(teeth, white, features);
  } else {
    const line = new THREE.BoxGeometry(0.046, 0.008, 0.01);
    line.translate(0, -0.062, HEAD_R * 0.925);
    mesh(line, mouthMat, features);
  }
  for (const b of buildBeard(look.beard, look)) {
    b.castShadow = true;
    features.add(b);
  }

  mesh(buildHair(look.hairStyle, look, seed), hairMat, head);

  // Arms: short sleeve in shirt colour, skin forearm, hand.
  const arm = (sx: number) => {
    const shoulder = group(spine, sx * 0.215 * w, 0.44, 0);
    limb(0.062 * w, 0.17, sleeve, shoulder, 0.058 * w);
    const cuff = new THREE.TorusGeometry(0.058 * w, 0.012, 6, 14);
    cuff.rotateX(Math.PI / 2);
    cuff.translate(0, -0.16, 0);
    mesh(cuff, trim, shoulder);
    const upper = limb(0.048 * w, 0.27, skin, shoulder, 0.042 * w);
    upper.position.y = -0.02;
    const elbow = group(shoulder, 0, -0.28, 0);
    limb(0.042 * w, 0.25, skin, elbow, 0.034);
    const hand = sphereGeo(0.042, 12, 10);
    hand.scale(0.85, 1.1, 0.7);
    hand.translate(0, -0.27, 0.005);
    mesh(hand, skin, elbow);
    return { shoulder, elbow };
  };
  const L = arm(1);
  const R = arm(-1);

  // Legs: thigh (shorts over the top), knee, sock, boot.
  const leg = (sx: number) => {
    const hip = group(pelvis, sx * 0.095 * w, -0.04, 0);
    limb(0.075 * w, 0.44, skin, hip, 0.055);
    const shortLeg = new THREE.CylinderGeometry(0.092 * w, 0.088 * w, 0.2, 14);
    shortLeg.translate(0, -0.08, 0);
    mesh(shortLeg, shorts, hip);
    const knee = group(hip, 0, -0.44, 0);
    const shin = limb(0.056, 0.42, socks, knee, 0.042);
    shin.position.y = -0.04;
    const kneeCap = sphereGeo(0.055, 10, 8);
    mesh(kneeCap, skin, knee);
    const ankle = group(knee, 0, -0.44, 0);
    const bootGeo = new THREE.CapsuleGeometry(0.043, 0.14, 4, 10);
    bootGeo.rotateX(Math.PI / 2);
    bootGeo.scale(1.1, 0.9, 1);
    bootGeo.translate(0, -0.035, 0.055);
    mesh(bootGeo, boot, ankle);
    const soleGeo = new THREE.BoxGeometry(0.085, 0.014, 0.23);
    soleGeo.translate(0, -0.075, 0.055);
    mesh(soleGeo, sole, ankle);
    return { hip, knee, ankle };
  };
  const LL = leg(1);
  const RL = leg(-1);

  const joints: Joints = {
    pelvis, spine, neck,
    lShoulder: L.shoulder, lElbow: L.elbow, rShoulder: R.shoulder, rElbow: R.elbow,
    lHip: LL.hip, lKnee: LL.knee, lAnkle: LL.ankle, rHip: RL.hip, rKnee: RL.knee, rAnkle: RL.ankle,
  };

  const setKit = (id: KitId) => {
    const kit = KITS[id];
    shirtTex[id] ??= shirtTexture(kit, name);
    shirt.map = shirtTex[id]!;
    shirt.color.set("#ffffff");
    shirt.needsUpdate = true;
    sleeve.color.set(kit.shirt);
    trim.color.set(kit.trim);
    shorts.color.set(kit.shorts);
    socks.color.set(kit.socks);
  };
  setKit(kitId);

  const glowables = [shirt, sleeve];
  const setGlow = (on: boolean) => {
    for (const m of glowables) {
      m.emissive.set(on ? "#7e22ce" : "#000000");
      m.emissiveIntensity = on ? 0.55 : 0;
    }
  };

  const applyFace = (img: HTMLImageElement, crop: FaceCrop) => {
    const face = faceTexture(img, crop);
    if (!face) return;
    skin.color.copy(face.skin);
    features.visible = false;
    const decal = new THREE.Mesh(faceDecalGeometry(), new THREE.MeshStandardMaterial({
      map: face.texture, transparent: true, roughness: 0.62, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    decal.renderOrder = 1;
    head.add(decal);
  };

  return { root, body, joints, setKit, setGlow, applyFace, hipHeight };
}
