import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { toon } from "./toon";

/**
 * Modelos 3D prontos (CC0):
 *  - KayKit Furniture Bits e Restaurant Bits — Kay Lousberg (kaylousberg.com)
 *  - Kenney Furniture Kit — kenney.nl (rádio, caixas de som e TV antiga)
 *  - Kenney Nature Kit — kenney.nl (cópias otimizadas do pacote @netforge/asset-library-files)
 * Licenças em public/models/*.
 */
export const MODEL_FILES: Record<string, string> = {
  couch: "kaykit/couch_pillows.gltf",
  armchair: "kaykit/armchair_pillows.gltf",
  chair_blue: "kaykit/chair_A.gltf",
  chair_wood: "kaykit/chair_A_wood.gltf",
  chair_b: "kaykit/chair_B.gltf",
  stool: "kaykit/chair_stool.gltf",
  table_long: "kaykit/table_medium_long.gltf",
  table_medium: "kaykit/table_medium.gltf",
  table_small: "kaykit/table_small.gltf",
  table_low: "kaykit/table_low.gltf",
  cactus: "kaykit/cactus_medium_A.gltf",
  cactus_small: "kaykit/cactus_small_A.gltf",
  rug_stripes: "kaykit/rug_rectangle_stripes_A.gltf",
  rug_oval: "kaykit/rug_oval_A.gltf",
  rug_rect: "kaykit/rug_rectangle_A.gltf",
  lamp_standing: "kaykit/lamp_standing.gltf",
  lamp_table: "kaykit/lamp_table.gltf",
  shelf_decorated: "kaykit/shelf_B_large_decorated.gltf",
  shelf_big: "kaykit/shelf_A_big.gltf",
  cabinet: "kaykit/cabinet_medium_decorated.gltf",
  books: "kaykit/book_set.gltf",
  frame: "kaykit/pictureframe_large_A.gltf",
  // ---- mais mobília (KayKit Furniture Bits)
  armchair_plain: "kaykit/armchair.gltf",
  couch_plain: "kaykit/couch.gltf",
  bed_double_a: "kaykit/bed_double_A.gltf",
  bed_double_b: "kaykit/bed_double_B.gltf",
  bed_single: "kaykit/bed_single_A.gltf",
  cabinet_plain: "kaykit/cabinet_medium.gltf",
  cabinet_small: "kaykit/cabinet_small.gltf",
  cabinet_small_dec: "kaykit/cabinet_small_decorated.gltf",
  cactus_b: "kaykit/cactus_medium_B.gltf",
  cactus_small_b: "kaykit/cactus_small_B.gltf",
  chair_b_wood: "kaykit/chair_B_wood.gltf",
  chair_c: "kaykit/chair_C.gltf",
  stool_wood: "kaykit/chair_stool_wood.gltf",
  frame_wide: "kaykit/pictureframe_large_B.gltf",
  frame_medium: "kaykit/pictureframe_medium.gltf",
  frame_standing: "kaykit/pictureframe_standing_A.gltf",
  pillow_a: "kaykit/pillow_A.gltf",
  pillow_b: "kaykit/pillow_B.gltf",
  rug_oval_b: "kaykit/rug_oval_B.gltf",
  rug_rect_b: "kaykit/rug_rectangle_B.gltf",
  rug_stripes_b: "kaykit/rug_rectangle_stripes_B.gltf",
  shelf_small: "kaykit/shelf_A_small.gltf",
  shelf_long: "kaykit/shelf_B_large.gltf",
  shelf_small_dec: "kaykit/shelf_B_small_decorated.gltf",
  book_single: "kaykit/book_single.gltf",
  // ---- cozinha e refeitório (KayKit Restaurant Bits)
  k_fridge: "kaykit-restaurant/fridge_A.gltf",
  k_fridge_dec: "kaykit-restaurant/fridge_A_decorated.gltf",
  k_oven: "kaykit-restaurant/oven.gltf",
  k_stove: "kaykit-restaurant/stove_multi.gltf",
  k_counter: "kaykit-restaurant/kitchencounter_straight_A.gltf",
  k_counter_dec: "kaykit-restaurant/kitchencounter_straight_A_decorated.gltf",
  k_sink: "kaykit-restaurant/kitchencounter_sink.gltf",
  k_cabinet: "kaykit-restaurant/kitchencabinet.gltf",
  k_table: "kaykit-restaurant/kitchentable_A.gltf",
  k_table_dec: "kaykit-restaurant/kitchentable_A_large_decorated.gltf",
  k_round: "kaykit-restaurant/table_round_A.gltf",
  k_round_dec: "kaykit-restaurant/table_round_A_decorated.gltf",
  k_round_small: "kaykit-restaurant/table_round_A_small.gltf",
  k_chair_a: "kaykit-restaurant/chair_A.gltf",
  k_chair_b: "kaykit-restaurant/chair_B.gltf",
  k_crate_tomato: "kaykit-restaurant/crate_tomatoes.gltf",
  k_crate: "kaykit-restaurant/crate.gltf",
  k_shelf_paper: "kaykit-restaurant/shelf_papertowel_decorated.gltf",
  k_pillar: "kaykit-restaurant/pillar_A.gltf",
  k_towelrail: "kaykit-restaurant/towelrail.gltf",
  k_jar: "kaykit-restaurant/jar_A_large.gltf",
  k_dishrack: "kaykit-restaurant/dishrack_plates.gltf",
  // ---- som (Kenney Furniture Kit, CC0)
  kf_radio: "kenney-furniture/radio.glb",
  kf_speaker: "kenney-furniture/speaker.glb",
  kf_speaker_small: "kenney-furniture/speakerSmall.glb",
  kf_tv_vintage: "kenney-furniture/televisionVintage.glb",
  kf_tv_antenna: "kenney-furniture/televisionAntenna.glb",
  tree_oak: "kenney/tree_oak.glb",
  tree_fat: "kenney/tree_fat.glb",
  tree_pine: "kenney/tree_pine.glb",
  tree_pine_tall: "kenney/tree_pine_tall.glb",
  bush: "kenney/bush.glb",
  bush_large: "kenney/bush_large.glb",
  flower: "kenney/flower_red.glb",
  rock: "kenney/rock_small.glb",
  stump: "kenney/stump.glb",
  log: "kenney/log.glb",
};

const cache = new Map<string, THREE.Object3D>();
/** Materiais das árvores e arbustos (o clima e a estação mudam a cor deles). */
export const foliageMaterials: THREE.Material[] = [];
let loading: Promise<void> | null = null;
/** Progresso do carregamento (para a tela de entrada). */
export const modelProgress = { done: 0, total: Object.keys(MODEL_FILES).length };

/** Troca os materiais PBR dos modelos pelo sombreamento em tons do mundo (mesma luz para tudo). */
function toToon(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.userData.model = true; // compartilhada entre as cópias do modelo
    const conv = (m: THREE.Material) => {
      const std = m as THREE.MeshStandardMaterial;
      const map = std.map ?? undefined;
      if (map) {
        map.magFilter = THREE.NearestFilter;
        map.minFilter = THREE.NearestFilter;
        map.generateMipmaps = false;
        map.colorSpace = THREE.SRGBColorSpace;
        map.needsUpdate = true;
      }
      return toon(std.color ?? 0xffffff, { map });
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(conv) : conv(mesh.material);
    // alguns modelos (Kenney) guardam as cores por vértice
    if (mesh.geometry.getAttribute("color")) {
      const withVc = (m: THREE.Material) => {
        const c = m.clone() as THREE.MeshToonMaterial;
        c.vertexColors = true;
        return c;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(withVc) : withVc(mesh.material);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}

export function loadModels(base = "./models/"): Promise<void> {
  if (loading) return loading;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loading = Promise.all(
    Object.entries(MODEL_FILES).map(async ([key, file]) => {
      try {
        const gltf = await loader.loadAsync(base + file);
        const root = gltf.scene;
        toToon(root);
        // puxa a vegetação da Kenney (verde-água) para um verde mais quente, como o resto do cenário
        if (/^(tree|bush)/.test(key)) {
          root.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (!mesh.isMesh) return;
            const tint = (mm: THREE.Material) => {
              const c = mm.clone() as THREE.MeshToonMaterial;
              c.color.multiply(new THREE.Color(0.95, 1.0, 0.62));
              foliageMaterials.push(c);
              return c;
            };
            mesh.material = Array.isArray(mesh.material) ? mesh.material.map(tint) : tint(mesh.material);
          });
        }
        cache.set(key, root);
      } catch (e) {
        console.warn("modelo não carregou:", file, e);
      } finally {
        modelProgress.done++;
      }
    }),
  ).then(() => undefined);
  return loading;
}

export function hasModel(key: string) {
  return cache.has(key);
}

/**
 * Cópia do modelo ajustada ao espaço do móvel (w x d em metros), apoiada no chão e centralizada.
 * `height` limita a altura quando informada.
 */
export function model(key: string, w: number, d: number, opts: { height?: number; fit?: "contain" | "width" } = {}): THREE.Object3D | null {
  const src = cache.get(key);
  if (!src) return null;
  const obj = src.clone(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  let s = opts.fit === "width" ? w / Math.max(size.x, 1e-3) : Math.min(w / Math.max(size.x, 1e-3), d / Math.max(size.z, 1e-3));
  if (opts.height) s = Math.min(s, opts.height / Math.max(size.y, 1e-3));
  obj.scale.setScalar(s);
  const center = box.getCenter(new THREE.Vector3());
  obj.position.set(-center.x * s, -box.min.y * s, -center.z * s);
  const g = new THREE.Group();
  g.add(obj);
  return g;
}
