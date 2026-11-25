// Ajudantes do pacote 2 (ultrawide, gamer, mac, robôs, tecnologia, oriente): paletas e animação genérica.
import * as THREE from "three";
import { box, cylZ, grp, c, reg, screenMat, type PackDef } from "./lib";

export const LEDS: [string, string][] = [["lima", "#c8f501"], ["ciano", "#4fb7d9"], ["rosa", "#ff4fa3"], ["vermelho", "#ff3b3b"], ["laranja", "#ff9a3c"], ["amarelo", "#ffd23c"], ["verde", "#3cff6e"], ["azul", "#3c7dff"], ["roxo", "#a56bff"], ["branco", "#ffffff"], ["magenta", "#ff3cf0"], ["turquesa", "#3cffd8"]];
export const BODIES: [string, string][] = [["preto", "#1d2029"], ["grafite", "#3d4460"], ["branco", "#f2f0ea"], ["prata", "#b9bcc8"], ["azul-marinho", "#24325a"], ["vinho", "#7a2430"]];
export const APPS = ["code", "chart", "chat", "video", "doc", "dash", "map", "cam"];

export interface Scr { m: THREE.Mesh; mats: THREE.Material[]; }
/** LED por instância (cada item tem a sua cor e pisca por conta própria). */
export function led(hex: string) {
  const m = new THREE.MeshBasicMaterial({ color: hex, toneMapped: false });
  m.userData.base = hex;
  return m;
}
export function ledBox(w: number, h: number, d: number, hex: string, x: number, y: number, z: number, store: THREE.MeshBasicMaterial[]) {
  const m = led(hex);
  store.push(m);
  return box(w, h, d, m, x, y, z);
}
/** Ventoinha: aro + hub aceso + pás; gira em Z. */
export function fan(r: number, hex: string, x: number, y: number, z: number, store: THREE.Object3D[], leds: THREE.MeshBasicMaterial[]) {
  const f = new THREE.Group();
  const hub = led(hex);
  leds.push(hub);
  f.add(cylZ(r, 0.012, c("#1d2029"), 0, 0, 0, 14), cylZ(r * 0.28, 0.016, hub, 0, 0, 0.004, 8));
  for (let i = 0; i < 5; i++) {
    const arm = new THREE.Group();
    arm.add(box(r * 0.62, r * 0.2, 0.004, c("#2f3240"), r * 0.4, -r * 0.1, 0.006));
    arm.rotation.z = (i / 5) * Math.PI * 2;
    f.add(arm);
  }
  f.position.set(x, y, z);
  store.push(f);
  return f;
}
const sliceCache = new Map<string, THREE.MeshBasicMaterial>();
/** Fatia i de n da textura de uma tela (telas curvas: a imagem corre contínua por todos os painéis). */
function slice(m: THREE.MeshBasicMaterial, i: number, n: number) {
  const key = m.uuid + ":" + i + "/" + n;
  let o = sliceCache.get(key);
  if (!o) {
    const t = m.map!.clone();
    t.repeat.set(1 / n, 1);
    t.offset.set(i / n, 0);
    t.needsUpdate = true;
    o = new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
    o.userData.shared = true;
    sliceCache.set(key, o);
  }
  return o;
}
/** Tela por instância: dois ou três apps que alternam quando o item está em uso (parte i de n em telas curvas). */
export function screenMesh(w: number, h: number, kinds: string[], a: string, b: string, x: number, y: number, z: number, store: Scr[], part?: [number, number]) {
  let mats: THREE.Material[] = kinds.map((k) => screenMat(k, a, b));
  if (part && part[1] > 1) mats = (mats as THREE.MeshBasicMaterial[]).map((m) => slice(m, part[0], part[1]));
  const m = box(w, h, 0.004, mats[0], x, y, z);
  store.push({ m, mats });
  return m;
}
export interface Joint { o: THREE.Object3D; axis: "x" | "y" | "z"; base: number; amp: number; speed: number; phase: number; }
export function joint(o: THREE.Object3D, axis: "x" | "y" | "z", amp: number, speed: number, phase: number, store: Joint[]) {
  store.push({ o, axis, base: o.rotation[axis], amp, speed, phase });
  return o;
}
export interface Anim { fans?: THREE.Object3D[]; leds?: THREE.MeshBasicMaterial[]; scr?: Scr[]; joints?: Joint[]; spin?: { o: THREE.Object3D; axis: "x" | "y" | "z"; v: number }[]; rainbow?: boolean; }
export function anim(g: THREE.Object3D, a: Anim) { Object.assign(g.userData, a); return g; }

const tmp = new THREE.Color();
/** Animação única para tudo: LED respira (arco-íris quando em uso), ventoinhas giram, tela alterna apps, juntas se mexem. */
export function tickAll(g: THREE.Object3D, t: number, on: boolean) {
  const u = g.userData as Anim;
  if (u.fans) for (const f of u.fans) f.rotation.z = t * (on ? 22 : 2.5);
  if (u.leds) {
    let i = 0;
    for (const m of u.leds) {
      if (on && u.rainbow !== false) m.color.setHSL((t * 0.5 + i * 0.09) % 1, 1, 0.55);
      else m.color.set(m.userData.base).multiplyScalar(0.6 + 0.4 * Math.sin(t * 2 + i));
      i++;
    }
  }
  if (u.scr) for (const s of u.scr) s.m.material = s.mats[on ? Math.floor(t * 3) % s.mats.length : 0];
  if (u.joints) for (const j of u.joints) j.o.rotation[j.axis] = j.base + Math.sin(t * j.speed * (on ? 2.6 : 1) + j.phase) * j.amp * (on ? 1.25 : 1);
  if (u.spin) for (const s of u.spin) s.o.rotation[s.axis] = t * s.v * (on ? 3 : 1);
  void tmp;
}
/** Registra um item do pacote 2 já com a animação comum. */
export function mk(prefix: string, cat: string, id: string, label: string, w: number, d: number, build: () => THREE.Object3D, extra: Partial<PackDef> = {}) {
  reg({ id: `pk_${prefix}_${id}`, cat, label, w, d, blocks: false, idle: true, tick: tickAll, build, ...extra });
}
export const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
export { grp };
