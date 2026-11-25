import * as THREE from "three";
import { ball, box, c, cyl, cylX, grp } from "./lib";
import { anim, ledBox, joint, Joint, mk } from "./x";

const CAT = "Robôs e braços robóticos";
const COLS: [string, string][] = [["laranja", "#f08a2e"], ["amarelo", "#f2c14e"], ["branco", "#f2f0ea"], ["preto", "#2a2d38"], ["vermelho", "#d9534f"], ["azul", "#3b6fc0"], ["verde", "#4fae4a"], ["lima", "#c8f501"], ["prata", "#b9bcc8"], ["roxo", "#8a6cc9"]];
const J = c("#3d4460");

// ---- braços robóticos (animados: juntas balançam, mais rápido ao clicar)
type ArmFn = (m: THREE.Material, J: Joint[], leds: THREE.MeshBasicMaterial[]) => THREE.Object3D;
const ARMS: [string, string, number, number, ArmFn][] = [
  ["industrial6", "Braço industrial 6 eixos", 0.5, 0.5, (m, js) => {
    const g = grp(cyl(0.2, 0.22, 0.08, c("#2a2d38"), 0, 0, 0, 12), cyl(0.14, 0.14, 0.18, m, 0, 0.08, 0, 12));
    const a1 = grp(box(0.12, 0.5, 0.1, m, 0, 0, 0)); a1.position.set(0, 0.24, 0);
    const a2 = grp(box(0.1, 0.4, 0.09, m, 0, 0, 0), ball(0.07, J, 0, 0.4, 0)); a2.position.set(0, 0.5, 0.02);
    const a3 = grp(box(0.07, 0.07, 0.22, m, 0, 0, 0), cylX(0.04, 0.12, J, 0, 0.03, 0.22)); a3.position.set(0, 0.4, 0);
    a3.add(box(0.025, 0.12, 0.02, c("#8e93a3"), -0.04, -0.07, 0.24), box(0.025, 0.12, 0.02, c("#8e93a3"), 0.04, -0.07, 0.24));
    a2.add(a3); a1.add(a2); g.add(a1);
    joint(g.children[1], "y", 0.8, 0.7, 0, js); joint(a1, "z", 0.35, 0.9, 0.5, js); joint(a2, "x", 0.6, 1.3, 1.2, js); joint(a3, "z", 0.8, 2, 0, js);
    return g;
  }],
  ["scara", "Braço SCARA", 0.5, 0.4, (m, js) => {
    const g = grp(box(0.18, 0.1, 0.18, c("#2a2d38"), 0, 0), cyl(0.07, 0.07, 0.28, m, 0, 0.1));
    const a1 = grp(box(0.34, 0.06, 0.08, m, 0.14, 0, 0)); a1.position.set(0, 0.36, 0);
    const a2 = grp(box(0.28, 0.05, 0.07, m, 0.12, 0, 0), cyl(0.012, 0.012, 0.18, c("#c9ced8"), 0.24, -0.16, 0, 6)); a2.position.set(0.3, 0.03, 0);
    a1.add(a2); g.add(a1);
    joint(a1, "y", 0.9, 0.8, 0, js); joint(a2, "y", 1.1, 1.3, 1, js);
    return g;
  }],
  ["delta", "Robô delta (aranha)", 0.5, 0.5, (m, js) => {
    const g = grp(box(0.42, 0.03, 0.42, c("#2a2d38"), 0, 0.5));
    const eff = grp(cyl(0.06, 0.06, 0.02, m, 0, 0, 0, 10), cyl(0.01, 0.01, 0.08, c("#c9ced8"), 0, -0.08, 0, 6)); eff.position.set(0, 0.2, 0);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const r = box(0.015, 0.34, 0.015, m, 0, 0, 0); r.position.set(Math.cos(a) * 0.1, 0.34, Math.sin(a) * 0.1); r.rotation.set(Math.sin(a) * 0.15, 0, -Math.cos(a) * 0.15); g.add(r); }
    g.add(eff);
    joint(eff, "y", 0.3, 1.6, 0, js); eff.position.y = 0.2;
    js.push({ o: eff, axis: "x", base: 0, amp: 0.15, speed: 1.2, phase: 0 });
    return g;
  }],
  ["cobot", "Cobot articulado", 0.4, 0.4, (m, js) => {
    const g = grp(cyl(0.12, 0.14, 0.05, c("#2a2d38"), 0, 0, 0, 12), cyl(0.07, 0.07, 0.14, m, 0, 0.05));
    const a1 = grp(cyl(0.05, 0.05, 0.3, m, 0, 0, 0, 10), ball(0.055, J, 0, 0.3, 0)); a1.position.set(0, 0.19, 0);
    const a2 = grp(cyl(0.045, 0.045, 0.28, m, 0, 0, 0, 10), ball(0.05, J, 0, 0.28, 0)); a2.position.set(0, 0.3, 0);
    const a3 = grp(cyl(0.035, 0.035, 0.12, m, 0, 0, 0, 10), box(0.08, 0.03, 0.06, c("#8e93a3"), 0, 0.12, 0)); a3.position.set(0, 0.28, 0);
    a2.add(a3); a1.add(a2); g.add(a1);
    joint(a1, "z", 0.5, 0.9, 0, js); joint(a2, "z", 0.9, 1.1, 1, js); joint(a3, "y", 1.5, 1.6, 2, js);
    return g;
  }],
  ["solda", "Braço de solda", 0.5, 0.5, (m, js, leds) => {
    const g = grp(box(0.3, 0.06, 0.3, c("#2a2d38"), 0, 0), cyl(0.07, 0.07, 0.2, m, 0, 0.06));
    const a1 = grp(box(0.07, 0.36, 0.07, m, 0, 0)); a1.position.set(0, 0.26, 0);
    const a2 = grp(box(0.06, 0.06, 0.3, m, 0, 0, 0.12), box(0.025, 0.14, 0.025, c("#c9ced8"), 0, -0.1, 0.28), ledBox(0.04, 0.04, 0.04, "#7ad2ff", 0, -0.2, 0.28, leds)); a2.position.set(0, 0.34, 0);
    a1.add(a2); g.add(a1);
    joint(g.children[1], "y", 0.7, 0.8, 0, js); joint(a1, "x", 0.25, 1.2, 0, js); joint(a2, "x", 0.4, 1.6, 1, js);
    return g;
  }],
  ["pintura", "Braço de pintura", 0.5, 0.5, (m, js, leds) => {
    const g = grp(cyl(0.16, 0.18, 0.06, c("#2a2d38"), 0, 0, 0, 12), cyl(0.06, 0.06, 0.24, m, 0, 0.06, 0, 10));
    const a1 = grp(box(0.06, 0.34, 0.06, m, 0, 0), ball(0.05, J, 0, 0.34, 0)); a1.position.set(0, 0.3, 0);
    const a2 = grp(box(0.05, 0.3, 0.05, m, 0, 0), cyl(0.03, 0.015, 0.1, c("#e8e6df"), 0, 0.3, 0.04, 8), ledBox(0.03, 0.03, 0.03, "#ff3cf0", 0, 0.42, 0.08, leds)); a2.position.set(0, 0.34, 0);
    a1.add(a2); g.add(a1);
    joint(g.children[1], "y", 0.9, 0.7, 0, js); joint(a1, "z", 0.4, 1.0, 0, js); joint(a2, "z", 1.1, 1.5, 2, js);
    return g;
  }],
  ["garra", "Garra mecânica", 0.4, 0.4, (m, js) => {
    const g = grp(box(0.32, 0.05, 0.32, c("#2a2d38"), 0, 0), cyl(0.04, 0.04, 0.4, m, 0, 0.05, 0, 8));
    const claw = grp(box(0.12, 0.04, 0.12, m, 0, 0)); claw.position.set(0, 0.46, 0);
    const f1 = box(0.02, 0.14, 0.03, c("#c9ced8"), -0.05, -0.14, 0), f2 = box(0.02, 0.14, 0.03, c("#c9ced8"), 0.05, -0.14, 0);
    claw.add(f1, f2); g.add(claw);
    joint(claw, "y", 1.2, 1.1, 0, js); joint(f1, "z", 0.4, 3, 0, js); joint(f2, "z", -0.4, 3, 0, js);
    return g;
  }],
  ["mesa", "Braço robótico de mesa", 0.3, 0.3, (m, js, leds) => {
    const g = grp(cyl(0.06, 0.07, 0.025, c("#2a2d38"), 0, 0, 0, 10), cyl(0.03, 0.03, 0.06, m, 0, 0.025, 0, 8));
    const a1 = grp(box(0.025, 0.14, 0.025, m, 0, 0)); a1.position.set(0, 0.09, 0);
    const a2 = grp(box(0.022, 0.12, 0.022, m, 0, 0), ledBox(0.02, 0.02, 0.02, "#c8f501", 0, 0.13, 0, leds)); a2.position.set(0, 0.14, 0);
    a1.add(a2); g.add(a1);
    joint(g.children[1], "y", 1, 1, 0, js); joint(a1, "z", 0.5, 1.4, 0, js); joint(a2, "z", 0.8, 1.8, 1, js);
    return g;
  }],
  ["camera", "Braço robótico de câmera", 0.5, 0.5, (m, js, leds) => {
    const g = grp(box(0.3, 0.05, 0.3, c("#2a2d38"), 0, 0), cyl(0.05, 0.05, 0.2, m, 0, 0.05));
    const a1 = grp(box(0.05, 0.34, 0.05, m, 0, 0)); a1.position.set(0, 0.25, 0);
    const a2 = grp(box(0.045, 0.045, 0.3, m, 0, 0, 0.12), box(0.1, 0.07, 0.1, c("#1d2029"), 0, -0.02, 0.3), cylX(0.025, 0.02, c("#9fd8ef"), 0, -0.02, 0.36), ledBox(0.014, 0.014, 0.014, "#ff3b3b", 0.04, 0.02, 0.35, leds)); a2.position.set(0, 0.34, 0);
    a1.add(a2); g.add(a1);
    joint(g.children[1], "y", 0.8, 0.5, 0, js); joint(a1, "x", 0.2, 1, 0, js); joint(a2, "y", 0.5, 1.2, 1, js);
    return g;
  }],
  ["pipeta", "Braço de laboratório", 0.4, 0.4, (m, js, leds) => {
    const g = grp(box(0.34, 0.03, 0.26, c("#e8e6df"), 0, 0), box(0.04, 0.3, 0.04, m, -0.12, 0.03));
    const a1 = grp(box(0.26, 0.03, 0.04, m, 0.12, 0, 0)); a1.position.set(-0.12, 0.3, 0);
    const a2 = grp(cyl(0.008, 0.002, 0.2, c("#d8e6ee"), 0, -0.1, 0, 6), ledBox(0.03, 0.03, 0.03, "#3cffd8", 0, 0.02, 0, leds)); a2.position.set(0.25, 0, 0);
    a1.add(a2); g.add(a1);
    for (let i = 0; i < 4; i++) g.add(cyl(0.012, 0.012, 0.06, c("#d8e6ee"), 0.0 + i * 0.05, 0.03, 0.05, 6));
    joint(a1, "y", 0.3, 0.8, 0, js); joint(a2, "y", 0.2, 0.8, 1, js);
    return g;
  }],
];
for (const [aid, an, w, d, fn] of ARMS)
  for (const [cn, ch] of COLS)
    mk("robo", CAT, `${aid}_${cn}`, `${an} ${cn}`, w, d, () => {
      const js: Joint[] = [];
      const leds: THREE.MeshBasicMaterial[] = [];
      const g = fn(c(ch), js, leds);
      return anim(g, { joints: js, leds, rainbow: false });
    }, { use: "screen" });

// ---- robôs completos (animados)
type BotFn = (m: THREE.Material, a: THREE.Material, js: Joint[], leds: THREE.MeshBasicMaterial[]) => THREE.Object3D;
const BOTS: [string, string, number, number, BotFn][] = [
  ["humanoide", "Robô humanoide", 0.6, 0.4, (m, a, js, leds) => {
    const g = grp(box(0.1, 0.34, 0.07, m, -0.05, 0.02, 0), box(0.1, 0.34, 0.07, m, 0.05, 0.02, 0), box(0.26, 0.3, 0.14, m, 0, 0.34), box(0.2, 0.2, 0.18, a, 0, 0.66));
    g.add(ledBox(0.14, 0.04, 0.01, "#c8f501", 0, 0.74, 0.092, leds), box(0.01, 0.1, 0.01, a, 0.06, 0.86), ball(0.02, a, 0.06, 0.95, 0));
    const l = grp(box(0.07, 0.3, 0.07, a, 0, -0.3)); l.position.set(-0.17, 0.62, 0); const r = grp(box(0.07, 0.3, 0.07, a, 0, -0.3)); r.position.set(0.17, 0.62, 0);
    g.add(l, r);
    joint(l, "x", 0.7, 1.4, 0, js); joint(r, "x", 0.7, 1.4, Math.PI, js);
    return g;
  }],
  ["esfera", "Robô esfera rolante", 0.4, 0.4, (m, a, js, leds) => {
    const g = grp(ball(0.14, m, 0, 0.14, 0), ball(0.08, a, 0, 0.3, 0), ledBox(0.08, 0.02, 0.01, "#4fb7d9", 0, 0.3, 0.075, leds));
    js.push({ o: g.children[1], axis: "y", base: 0, amp: 0.6, speed: 1.2, phase: 0 });
    return g;
  }],
  ["aspirador", "Robô aspirador", 0.4, 0.4, (m, a, js, leds) => {
    const g = grp(cyl(0.17, 0.17, 0.07, m, 0, 0, 0, 16), cyl(0.05, 0.05, 0.02, a, 0, 0.07, 0.04, 10), ledBox(0.03, 0.01, 0.01, "#3cff6e", 0, 0.072, -0.08, leds));
    js.push({ o: g, axis: "y", base: 0, amp: 0.5, speed: 0.6, phase: 0 });
    return g;
  }],
  ["entrega", "Robô de entrega", 0.5, 0.4, (m, a, js, leds) => {
    const g = grp(box(0.34, 0.2, 0.26, m, 0, 0.08), box(0.3, 0.08, 0.22, a, 0, 0.28), ledBox(0.1, 0.03, 0.01, "#ffd23c", 0, 0.34, 0.12, leds));
    for (const [x, z] of [[-0.14, -0.1], [0.14, -0.1], [-0.14, 0.1], [0.14, 0.1]]) g.add(cylX(0.05, 0.04, c("#1d2029"), x, 0.05, z, 10));
    js.push({ o: g.children[1], axis: "z", base: 0, amp: 0.03, speed: 3, phase: 0 });
    return g;
  }],
  ["pet", "Robô cachorro", 0.5, 0.3, (m, a, js, leds) => {
    const g = grp(box(0.3, 0.12, 0.14, m, 0, 0.16), box(0.12, 0.12, 0.12, a, 0.2, 0.24), ledBox(0.04, 0.02, 0.01, "#c8f501", 0.26, 0.28, 0.062, leds), box(0.02, 0.1, 0.02, a, -0.16, 0.22));
    for (const [x, z] of [[-0.1, -0.05], [0.1, -0.05], [-0.1, 0.05], [0.1, 0.05]]) { const l = grp(box(0.04, 0.16, 0.04, a, 0, -0.16)); l.position.set(x, 0.16, z); g.add(l); joint(l, "z", 0.5, 4, x * 20 + z * 10, js); }
    return g;
  }],
  ["wall", "Robô compactador", 0.4, 0.4, (m, a, js, leds) => {
    const g = grp(box(0.26, 0.24, 0.24, m, 0, 0.06), box(0.14, 0.06, 0.02, a, 0, 0.22, 0.13), ledBox(0.03, 0.03, 0.01, "#7ad2ff", -0.05, 0.22, 0.145, leds), ledBox(0.03, 0.03, 0.01, "#7ad2ff", 0.05, 0.22, 0.145, leds));
    for (const s of [-1, 1]) g.add(box(0.07, 0.07, 0.3, c("#2a2d38"), s * 0.16, 0, 0));
    js.push({ o: g.children[1], axis: "z", base: 0, amp: 0.2, speed: 1.4, phase: 0 });
    return g;
  }],
  ["mecha", "Mini mecha", 0.6, 0.5, (m, a, js, leds) => {
    const g = grp(box(0.1, 0.18, 0.12, a, -0.1, 0), box(0.1, 0.18, 0.12, a, 0.1, 0), box(0.34, 0.2, 0.22, m, 0, 0.2), box(0.14, 0.1, 0.14, a, 0, 0.42), ledBox(0.1, 0.03, 0.01, "#ff3b3b", 0, 0.46, 0.075, leds));
    const l = grp(box(0.07, 0.26, 0.08, m, 0, -0.14)); l.position.set(-0.24, 0.36, 0); const r = grp(box(0.07, 0.26, 0.08, m, 0, -0.14)); r.position.set(0.24, 0.36, 0);
    g.add(l, r, box(0.07, 0.07, 0.2, a, 0.24, 0.12, 0.12)); joint(l, "x", 0.5, 1.2, 0, js); joint(r, "x", 0.5, 1.2, 2, js);
    return g;
  }],
  ["drone", "Drone mesa", 0.5, 0.5, (m, a, js, leds) => {
    const g = grp(box(0.1, 0.04, 0.1, m, 0, 0.12), ledBox(0.03, 0.02, 0.01, "#ff3b3b", 0, 0.13, 0.052, leds));
    for (const [x, z] of [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]]) { const arm = box(0.2, 0.012, 0.012, a, x / 2, 0.14, z / 2); arm.rotation.y = Math.atan2(-z, x); g.add(arm); const rot = box(0.16, 0.004, 0.02, c("#2f3240"), 0, 0, 0); const rg = grp(rot); rg.position.set(x, 0.18, z); g.add(rg); js.push({ o: rg, axis: "y", base: 0, amp: 6.28, speed: 7, phase: x * 9 }); }
    g.position.y = 0.0;
    return g;
  }],
];
for (const [bid, bn, w, d, fn] of BOTS)
  for (const [cn, ch] of COLS.slice(0, 7))
    mk("robo", CAT, `${bid}_${cn}`, `${bn} ${cn}`, w, d, () => {
      const js: Joint[] = [];
      const leds: THREE.MeshBasicMaterial[] = [];
      const g = fn(c(ch), c("#2f3240"), js, leds);
      return anim(g, { joints: js, leds, rainbow: false });
    }, { use: "screen" });
