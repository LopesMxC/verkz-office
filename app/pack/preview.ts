import * as THREE from "three";
import { REG, type PackDef } from "./lib";
import "./index";
const q = new URLSearchParams(location.search);
const cat = q.get("cat") ?? "";
const page = +(q.get("page") ?? 0);
const PER = 40, COLS = 8;
(window as any).REGINFO = { total: REG.length, cats: [...new Set(REG.map((r) => r.cat))].map((k) => [k, REG.filter((r) => r.cat === k).length]) };
const list = REG.filter((r) => !cat || r.cat === cat).slice(page * PER, page * PER + PER);
const cv = document.getElementById("c") as HTMLCanvasElement;
const R = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
R.setSize(1800, 1100, false);
const scene = new THREE.Scene(); scene.background = new THREE.Color("#242834");
scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.9); sun.position.set(3, 6, 5); scene.add(sun);
const CW = 1800 / COLS, CH = 1100 / Math.ceil(PER / COLS);
const rows = Math.ceil(list.length / COLS);
R.setScissorTest(true); R.setClearColor("#242834");
const wrap = document.getElementById("wrap")!;
const ticks: { d: PackDef; g: THREE.Object3D }[] = [];
const cam = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.1, 50);
cam.position.set(2.6, 3.4, 4.4); cam.lookAt(0, 0.8, 0);
cam.left = -1.45 * (CW / (CH - 34)); cam.right = -cam.left; cam.top = 1.45; cam.bottom = -1.45; cam.updateProjectionMatrix();
cam.position.set(2.8, 3.6, 4.6); cam.lookAt(0, 0.95, 0);
R.setViewport(0, 0, 1800, 1100); R.setScissor(0, 0, 1800, 1100); R.clear();
list.forEach((d, i) => {
  const col = i % COLS, row = Math.floor(i / COLS);
  const x = col * CW, yTop = row * CH;
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9); sun.position.set(3, 6, 5); sc.add(sun);
  const slab = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.04, 40), new THREE.MeshLambertMaterial({ color: "#3a4052" }));
  slab.position.y = -0.02; sc.add(slab);
  let m: THREE.Object3D; try { m = d.build(); } catch (e) { console.log("ERRO build " + d.id + " " + e); m = new THREE.Object3D(); }
  const inner = new THREE.Group(); inner.add(m);
  if (d.tabletop) { const t = new THREE.Mesh(new THREE.BoxGeometry(Math.max(d.w, 0.8) + 0.2, 0.05, Math.max(d.d, 0.6) + 0.2), new THREE.MeshLambertMaterial({ color: "#a9825a" })); t.position.y = 0.0; inner.add(t); m.position.y = 0.025; }
  if (d.mount === "wall") { const wl = new THREE.Mesh(new THREE.BoxGeometry(Math.max(d.w, 1) + 0.6, 1.8, 0.04), new THREE.MeshLambertMaterial({ color: "#d8d4ca" })); wl.position.set(0, 0.9, -0.03); inner.add(wl); m.position.set(0, 1.1, 0); }
  if (d.mount === "ceiling") { const cl = new THREE.Mesh(new THREE.BoxGeometry(Math.max(d.w, 1) + 0.6, 0.04, 1.2), new THREE.MeshLambertMaterial({ color: "#d8d4ca" })); cl.position.set(0, 2.1, 0); inner.add(cl); m.position.set(0, 2.1, 0); }
  if (d.tick) { ticks.push({ d, g: m }); try { d.tick(m, 1.7, true); } catch (e) { console.log("ERRO tick " + d.id + " " + e); } }
  const bb = new THREE.Box3().setFromObject(inner); const sz = bb.getSize(new THREE.Vector3());
  const k = Math.min(1.9 / Math.max(sz.x, sz.z, 0.001), 2.3 / Math.max(sz.y, 0.001), 2.2);
  inner.scale.setScalar(k); const bb2 = new THREE.Box3().setFromObject(inner); const ctr = bb2.getCenter(new THREE.Vector3());
  inner.position.set(-ctr.x, -bb2.min.y, -ctr.z); sc.add(inner);
  const vy = 1100 - yTop - CH + 34;
  R.setViewport(x + 4, vy, CW - 8, CH - 34); R.setScissor(x + 4, vy, CW - 8, CH - 34);
  R.setClearColor((i + row) % 2 ? "#262a37" : "#2b3040"); R.clear(); R.render(sc, cam);
  const el = document.createElement("div"); el.className = "l";
  el.style.left = x + CW / 2 + "px"; el.style.top = yTop + CH - 32 + "px";
  el.innerHTML = `<b>${d.label}</b><i>${d.id.replace("pk_", "")} · ${d.w.toFixed(1)}×${d.d.toFixed(1)} m</i>`; wrap.appendChild(el);
});
void rows;
document.getElementById("h")!.textContent = `${cat || "Todos"} — pág. ${page + 1}`;
(window as any).done = true;
