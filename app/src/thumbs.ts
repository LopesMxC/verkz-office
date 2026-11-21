import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPixelatedPass } from "three/addons/postprocessing/RenderPixelatedPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { buildItem, PALETTE } from "./furniture";

let cache: Record<string, string> | null = null;

/** Miniaturas em pixel art de cada móvel (renderizadas uma vez, na primeira abertura do editor). */
export function furnitureThumbs(): Record<string, string> {
  if (cache) return cache;
  const W = 192;
  const H = 144;
  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8070, 1.45));
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.35);
  sun.position.set(6, 10, 4);
  scene.add(sun);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPixelatedPass(1, scene, cam, { normalEdgeStrength: 0.1, depthEdgeStrength: 0.4 }));
  composer.addPass(new OutputPass());
  composer.setSize(W, H);

  cache = {};
  for (const type of PALETTE) {
    const obj = buildItem({ id: "thumb", type, x: 0, z: 0, rot: 0 });
    scene.add(obj);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z, 0.6) * 0.75;
    Object.assign(cam, { left: -r * (W / H), right: r * (W / H), top: r, bottom: -r });
    cam.position.set(center.x + 8, center.y + 7, center.z + 8);
    cam.lookAt(center);
    cam.updateProjectionMatrix();
    composer.render();
    cache[type] = canvas.toDataURL("image/png");
    scene.remove(obj);
  }
  composer.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return cache;
}
