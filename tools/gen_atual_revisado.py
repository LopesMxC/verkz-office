#!/usr/bin/env python3
"""Layout "atual revisado": parte do mapa antigo (default_layout_antigo.json, 50x26 m) e muda:
 - sala do CEO vira suíte grande no canto esquerdo (onde ficam as placas), ocupando a antiga reunião 1 + ponta do salão
 - 2 salas de SDR (antiga sala do CEO e antiga biblioteca)
 - salão do meio sem mesas, só decoração
 - janelas modernas (vidro grande, moldura grafite)
 - fica uma só sala de reunião (a mediana, de baixo à direita)
Uso: python3 tools/gen_atual_revisado.py > server/src/default_layout.json  (preview em /tmp/preview.json)
"""
import json, sys

base = json.load(open("server/src/default_layout_antigo.json"))
WALLT = ("wall", "window_wall")
walls = {(i["x"], i["z"]): i for i in base["items"] if i["type"] in WALLT}
others = [i for i in base["items"] if i["type"] not in WALLT]
zones = {z["id"]: z for z in base["zones"]}
_n = [0]
def uid():
    _n[0] += 1
    return f"n{_n[0]}"

# ------------------------------------------------------------ limpeza de móveis
def inside(i, x0, z0, x1, z1): return x0 <= i["x"] <= x1 and z0 <= i["z"] <= z1
PANELS = {"neon_logo", "clock_panel", "fin_panel"}
keep, panels = [], []
for i in others:
    if i["type"] in PANELS and i["x"] < -24: panels.append(i); continue
    drop = (inside(i, -25, -13, -9, -5)            # antiga reunião 1 + antiga sala do CEO
            or (inside(i, -25, -5, 25, 4) and i["type"] != "cactus_small")   # salão do meio
            or inside(i, -11, 4, -3, 13))           # antiga biblioteca
    if not drop: keep.append(i)
items = keep
old = list(keep)

SIZE = {"desk": (2, 1), "exec_chair": (.6, .6), "office_chair": (.6, .6), "chair": (.6, .6), "bookshelf": (2, .5), "sofa": (3, 1),
 "armchair": (1, 1), "coffee_table": (1.4, .8), "plant_big": (1, 1), "p_olive": (.8, .8), "p_monstera": (.8, .8),
 "p_bookcase_full": (1.4, .4), "p_trophy": (1.2, .4), "p_aquarium": (1.2, .5), "p_floor_lamp": (1.2, .5), "p_side_table": (.5, .5),
 "p_fireplace": (1.4, .4), "p_jukebox": (.9, .6), "p_bar_table": (.7, .7), "table_round": (1.2, 1.2), "cabinet": (1.2, .5),
 "whiteboard": (2, .3), "stool": (.5, .5), "p_planter_long": (1.6, .4), "neon_logo": (3, .4), "clock_panel": (1.8, .4),
 "fin_panel": (1.8, .4), "cactus_small": (.3, .3), "p_coat_rack": (.5, .5), "p_safe": (.6, .6)}
NOBLOCK = {"exec_chair", "office_chair", "chair", "stool", "p_floor_lamp", "p_coat_rack"}
HUNG = {"p_mirror", "p_clock_wall", "p_neon_ring", "frame_wide", "frame_medium"}
foot = []
def put(t, x, z, rot=0, **kw):
    it = {"id": uid(), "type": t, "x": round(x, 2), "z": round(z, 2), "rot": rot}; it.update(kw); items.append(it)
    if t in SIZE and t not in HUNG:
        w, d = SIZE[t]
        if rot in (90, 270): w, d = d, w
        foot.append((t, x - w / 2, z - d / 2, x + w / 2, z + d / 2, it["id"]))
    return it
def rug(t, x, z, p, c, f, rot=0):
    it = {"id": uid(), "type": t, "x": x, "z": z, "rot": rot, "cfg": {"rs": {"p": p, "c": c, "f": f}}}; items.append(it)
def tab(t, x, z, rot=0):
    items.append({"id": uid(), "type": t, "x": round(x, 2), "z": round(z, 2), "rot": rot})
def pods(xs, cz, chair="office_chair"):
    for cx in xs:
        put("desk", cx, cz - 2.1, 0); put(chair, cx - .5, cz - 1.0, 180); put(chair, cx + .5, cz - 1.0, 180)
        put("desk", cx, cz + 2.1, 180); put(chair, cx - .5, cz + 1.0, 0); put(chair, cx + .5, cz + 1.0, 0)

# ------------------------------------------------------------ paredes
def wall(x, z, t="wall", color=None, glass=False):
    it = {"id": uid(), "type": t, "x": x, "z": z, "rot": 0}
    if color: it["color"] = color
    if glass: it["cfg"] = {"glass": True}
    walls[(x, z)] = it
for k, w in list(walls.items()):                 # janelas antigas viram parede lisa
    if w["type"] == "window_wall": w["type"] = "wall"
for x in range(-23, -17): walls.pop((x, -5), None)          # abre a suíte (reunião 1 + ponta do salão)
DARK = "#2b2f38"
for z in range(-4, 2):                                       # parede leste da suíte (porta de 3 m em z -2..0)
    if z not in (-2, -1, 0): wall(-16, z, color=DARK)
for x in range(-24, -16): wall(x, 1, color=DARK)             # fundo da suíte
wall(-16, 1, color=DARK); wall(-16, -5, color=DARK)
def windows(side, pieces):
    for p in pieces:
        k = (p, -13) if side == "n" else (p, 13) if side == "s" else (-25, p) if side == "w" else (25, p)
        if k in walls: walls[k]["type"] = "window_wall"; walls[k]["cfg"] = {"glass": True}
windows("n", [-22, -21, -20, -19, -14, -13, -12, -7, -6, -5, 0, 1, 2, 7, 8, 9, 14, 15, 16, 21, 22, 23])
windows("s", [-22, -21, -20, -8, -7, -6, 0, 1, 2, 9, 10, 11, 17, 21, 22, 23])
windows("e", [-10, -9, -8, 6, 7, 8]); windows("w", [8, 9, 10])

# ------------------------------------------------------------ suíte do CEO (x -24.5..-16.5, z -12.5..0.5)
for p in panels:                                              # as placas ficam na parede do fundo
    p["z"] = {"neon_logo": -2.0, "fin_panel": -8.8, "clock_panel": -6.2}[p["type"]]
    foot.append((p["type"], p["x"] - .2, p["z"] - .9 if p["type"] != "neon_logo" else p["z"] - 1.5, p["x"] + .2, p["z"] + (.9 if p["type"] != "neon_logo" else 1.5), p["id"]))
items += panels
rug("rugc_xxl", -20.5, -6.0, 0, 0, "r")
put("desk", -21.5, -10.0, 180); put("desk", -19.5, -10.0, 180); put("exec_chair", -20.5, -11.2, 0)
tab("pk_ultra_38_curvo1800R_preto_0", -21.5, -9.9, 180); tab("pk_pcg_setup_0_lima", -19.3, -10.0, 180)
put("cabinet", -21.2, -12.1, 0); put("cabinet", -19.8, -12.1, 0)
put("armchair", -21.3, -7.4, 180); put("armchair", -19.7, -7.4, 180)
put("p_floor_lamp", -23.0, -10.0, 0); put("p_floor_lamp", -17.8, -10.0, 180)
put("p_fireplace", -16.7, -9.0, 90); put("p_mirror", -16.15, -9.0, 90); put("frame_wide", -16.35, -6.4, 90)
put("p_jukebox", -16.8, -11.4, 90); put("p_aquarium", -17.2, -12.2, 0)
put("p_olive", -24.0, -10.9); put("p_olive", -17.2, -4.1)
put("p_bookcase_full", -23.5, -12.3, 0)
put("sofa", -20.5, -0.1, 180); put("coffee_table", -20.5, -2.0, 0)
put("armchair", -23.4, -3.6, 270); put("armchair", -23.4, 0.0, 270)
put("p_side_table", -17.6, 0.1)

# ------------------------------------------------------------ SDR 1 (antiga sala do CEO) e SDR 2 (antiga biblioteca)
put("desk", -12.5, -11.0, 0); put("office_chair", -12.5, -9.9, 180)
tab("pk_ultra_34_curvo1800R_preto_0", -13.0, -11.2, 0); tab("pk_mac_Pro14_prata_cod", -11.8, -10.8, 0); tab("pk_pc_kb_preto", -13.0, -10.7, 0)
put("whiteboard", -12.5, -12.3, 0); put("plant_big", -15.0, -5.9)
put("desk", -5.0, 11.0, 180); put("office_chair", -5.0, 9.9, 0)
tab("pk_ultra_34_curvo1800R_grafite_0", -5.5, 11.2, 180); tab("pk_mac_Air15_meianoite_cod".replace("meianoite", "meia-noite"), -4.3, 10.8, 180); tab("pk_pc_kb_branco", -5.5, 10.7, 180)
put("whiteboard", -7.0, 12.3, 180); put("plant_big", -10.0, 12.0)

# ------------------------------------------------------------ salão do meio: lounge organizado
# Regra: nada na frente das portas. Vãos norte (z=-5): x -13,-6,1,8,15,22; sul (z=4): x -14,-7,1,10.5,17,22; porta leste do CEO (x=-16, z -2..0).
# Itens de parede ficam só entre os vãos (a 1,6 m de cada porta); os grupos de sofás ficam no eixo do meio, com corredor livre dos dois lados.
SIZE.update({"pk_ori_torii_vermelho": (1.8, .4), "pk_ori_byobu_pretoeouro": (1.4, .4), "pk_tec_rack_preto": (.6, .6),
 "pk_robo_industrial6_laranja": (.5, .5), "pk_robo_humanoide_branco": (.6, .4), "pk_robo_cobot_branco": (.4, .4),
 "pk_tec_quantum_branco": (.5, .5), "pk_ori_mahjong_madeira": (1.0, 1.0)})
NORTH_DOORS = (-13, -6, 1, 8, 15, 22); SOUTH_DOORS = (-14, -7, 1, 10.5, 17, 22)
rug("rugc_l", -8.5, -0.5, 14, 3, "r"); rug("rugc_l", 9.0, -0.5, 14, 3, "r"); rug("rugc_round", 0.5, -0.5, 1, 5, "c")
for cx in (-8.5, 9.0):
    put("sofa", cx, -1.9, 0); put("sofa", cx, 1.2, 180); put("coffee_table", cx, -0.3, 0)
put("table_round", 0.5, -0.5)
for (x, z, r) in ((0.5, -1.7, 0), (0.5, 0.7, 180), (-0.7, -0.5, 270), (1.7, -0.5, 90)): put("chair", x, z, r)
# lado norte (parede z=-5), entre as portas
put("bookshelf", -9.5, -4.2, 0); put("pk_ori_torii_vermelho", -2.5, -4.2, 0); put("bookshelf", 4.5, -4.2, 0)
put("pk_ori_byobu_pretoeouro", 11.5, -4.2, 0); put("bookshelf", 18.5, -4.2, 0)
# lado sul (parede z=4), entre as portas
put("p_bookcase_full", -10.5, 3.3, 180); put("p_aquarium", -3.0, 3.3, 180)
put("desk", 5.75, 3.3, 180); tab("pk_ori_bonsai_madeira", 5.2, 3.3, 180); tab("pk_ori_neko_vermelho", 6.2, 3.3, 180)
put("p_bookcase_full", 13.75, 3.3, 180); put("p_trophy", 19.5, 3.3, 180)
# bar alto e mahjong na ponta leste
put("pk_ori_mahjong_madeira", 13.4, -0.5, 0)
for (x, z, r) in ((13.4, -1.5, 0), (13.4, 0.5, 180), (12.4, -0.5, 270), (14.4, -0.5, 90)): put("chair", x, z, r)
put("p_bar_table", 17.0, -0.5); put("p_bar_table", 19.4, -0.5)
for (x, z) in ((16.3, -0.5), (17.7, -0.5), (18.7, -0.5), (20.1, -0.5)): put("stool", x, z)
put("p_planter_long", 18.2, 1.7, 0)
# coluna tecnológica na parede leste do salão
put("pk_robo_industrial6_laranja", 24.3, -3.8); put("pk_tec_rack_preto", 24.3, -2.5); put("pk_robo_humanoide_branco", 24.3, -0.9, 270)
put("pk_robo_cobot_branco", 24.3, 0.6); put("pk_tec_quantum_branco", 24.3, 2.0)
tab("pk_tec_holo_grafite", 18.8, 3.3, 180) if False else None
# plantas: laterais do grupo central e cantos
for (x, z) in ((-15.2, -4.0), (-16.3, 3.0), (-2.6, -0.5), (3.6, -0.5)): put("p_olive", x, z)

# ------------------------------------------------------------ zonas
def Z(id, name, x, z, w, d, floor, priv=True, **kw):
    zones[id] = {"id": id, "name": name, "x": x, "z": z, "w": w, "d": d, "private": priv, "floor": floor, **kw}
zones.pop("z-reuniao", None)
Z("z-ceo", "Sala do CEO", -20.5, -6.0, 8, 13, "madeira", role="CEO", door="escura")
Z("z-sdr1", "Sala SDR 1", -12.5, -9.0, 6, 7, "carpete-azul", role="SDR")
Z("z-sdr2", "Sala SDR 2", -7.0, 8.5, 7, 8, "carpete-azul", role="SDR")
zones.pop("z-biblioteca", None)
Z("z-sdr", "Área de convivência", 4.5, -0.5, 40, 8, "madeira", priv=False)
zones["z-reuniao2"]["name"] = "Sala de Reunião"
# pisos: salas privadas voltam aos carpetes originais; salão/convivência e ouvidoria em madeira; cozinha e banheiros em porcelanato
for z in zones.values():
    if z["name"] in ("Cozinha", "Banheiros"):
        z["floor"] = "porcelanato"; z["w"] += 1; z["d"] += 1   # piso até o eixo das paredes (sem margem de madeira)
    elif z["name"] in ("Ouvidoria do Cleiton", "Área de convivência", "Área de Lazer"):
        z["floor"] = "madeira"
out_zones = list(zones.values())

layout = {**base, "version": 10, "items": list(walls.values()) + items, "zones": out_zones,
          "style": {"wall": "#efe9de", "window": "ampla", "frame": "#23272f", "door": "madeira", "floor": "madeira"},
          "env": {**(base.get("env") or {}), "weather": "sol"}}

# ------------------------------------------------------------ validação
problems = []
solid = [f for f in foot if f[0] not in NOBLOCK and f[0] not in PANELS]
for i in range(len(solid)):
    for j in range(i + 1, len(solid)):
        a, b = solid[i], solid[j]
        if a[1] < b[3] - .02 and a[3] > b[1] + .02 and a[2] < b[4] - .02 and a[4] > b[2] + .02: problems.append(("sobreposto", a, b))
# contra móveis antigos que ficaram
for o in old:
    t = o["type"]
    if t in SIZE and t not in HUNG:
        w, d = SIZE[t]
        if o["rot"] in (90, 270): w, d = d, w
        for a in solid:
            if a[1] < o["x"] + w / 2 - .02 and a[3] > o["x"] - w / 2 + .02 and a[2] < o["z"] + d / 2 - .02 and a[4] > o["z"] - d / 2 + .02: problems.append(("sobre antigo", a, t, o["x"], o["z"]))
# nada (nem cadeira) na frente das portas do salão
lanes = [(x - 1.3, -5.0, x + 1.3, -2.6) for x in NORTH_DOORS] + [(x - 1.3, 2.6, x + 1.3, 4.0) for x in SOUTH_DOORS] + [(-16.0, -2.8, -13.6, 0.8)]
for f in foot:
    if f[0] in PANELS: continue
    for l in lanes:
        if f[1] < l[2] and f[3] > l[0] and f[2] < l[3] and f[4] > l[1]: problems.append(("na frente da porta", f, l))
for p in problems: print(p, file=sys.stderr)
print(f"itens={len(layout['items'])} problemas={len(problems)}", file=sys.stderr)
json.dump(layout, sys.stdout, ensure_ascii=False, separators=(",", ":"))
json.dump({"walls": [[w["x"], w["z"], w["type"]] for w in walls.values()],
           "items": [[i["type"], i["x"], i["z"], i["rot"]] for i in items if i["type"] not in ("tree", "pine", "bush", "flower")],
           "zones": [[z["name"], z["x"], z["z"], z["w"], z["d"], z.get("role", ""), z["private"], z["floor"]] for z in out_zones]},
          open("/tmp/preview.json", "w"), ensure_ascii=False, separators=(",", ":"))
