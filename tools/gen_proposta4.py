#!/usr/bin/env python3
"""Gera o layout da Proposta 4 (Pátio central) do VERKZ Office.
Planta em metros (0..64 x 0..44); mundo = planta - (32, 22). Uso: python3 tools/gen_proposta4.py > server/src/default_layout.json
"""
import json, math, random, sys

W, D = 64, 44
wx = lambda px: px - 32
wz = lambda py: py - 22
jsmod = lambda a, b: a - b * int(a / b)  # % do JavaScript (mantém o sinal)

items = []
_n = [0]
def uid():
    _n[0] += 1
    return f"i{_n[0]}"
def add(t, x, z, rot=0, **kw):
    it = {"id": uid(), "type": t, "x": round(x, 2), "z": round(z, 2), "rot": rot}
    it.update(kw)
    items.append(it)
    return it

# ---------------------------------------------------------------- salas (plan: x0,y0,x1,y1)
ROOMS = {
  "reuniao":  dict(b=(0, 0, 22, 13),   name="Sala de Reunião",        floor="carpete-grafite", priv=True),
  "ceo":      dict(b=(22, 0, 48, 14),  name="Sala do CEO",            floor="madeira-escura", priv=True, role="CEO", door="escura"),
  "head":     dict(b=(48, 0, 64, 13),  name="Sala do Head",           floor="madeira",         priv=True, role="Head"),
  "sdr":      dict(b=(0, 13, 14, 23),  name="Squad SDR",              floor="carpete-azul",    priv=True, role="SDR"),
  "closers":  dict(b=(0, 23, 14, 33),  name="Squad Closers",          floor="carpete-grafite", priv=True, role="Closer"),
  "editores": dict(b=(0, 33, 14, 44),  name="Squad Editores",         floor="carpete-lilas",   priv=True, role="Editor"),
  "gestores": dict(b=(51, 13, 64, 23), name="Squad Gestores",         floor="carpete-verde",   priv=True, role="Gestor"),
  "ouvidoria":dict(b=(51, 23, 64, 30), name="Ouvidoria do Cleiton",   floor="ceramica",        priv=True),
  "descanso": dict(b=(51, 30, 64, 44), name="Sala de Descanso",       floor="madeira-clara",   priv=True),
  "cozinha":  dict(b=(16, 34, 29, 44), name="Cozinha",                floor="porcelanato",     priv=True),
  "esportes": dict(b=(35, 34, 51, 44), name="Sala de Esportes",       floor="concreto",        priv=True),
}
# vãos de porta: (sala, lado, peças) em coordenadas da planta
DOORS = {
  "reuniao":  ("s", [17, 18]),
  "ceo":      ("s", [34, 35, 36]),
  "head":     ("s", [49, 50]),
  "sdr":      ("e", [17, 18]),
  "closers":  ("e", [27, 28]),
  "editores": ("e", [38, 39]),
  "gestores": ("w", [17, 18]),
  "ouvidoria":("w", [26, 27]),
  "descanso": ("w", [31, 32]),
  "cozinha":  ("n", [22, 23]),
  "esportes": ("n", [42, 43, 44]),
}

# ---------------------------------------------------------------- paredes
walls = {}
def put(x, z, t="wall", glass=False, color=None):
    it = {"id": uid(), "type": t, "x": x, "z": z, "rot": 0}
    if glass: it["cfg"] = {"glass": True}
    if color: it["color"] = color
    walls[(x, z)] = it

# perímetro (mesma regra do editor), entrada embaixo no meio
Wh, Dh = W // 2, D // 2
for x in range(-Wh, Wh + 1):
    put(x, -Dh, "window_wall" if jsmod(x, 4) == 2 and abs(x) < Wh - 1 else "wall")
    if abs(x) > 3:
        put(x, Dh, "window_wall" if jsmod(x, 5) == 0 and abs(x) > 4 and abs(x) < Wh - 1 else "wall")
for z in range(-Dh + 1, Dh):
    put(-Wh, z, "window_wall" if jsmod(z, 4) == 0 else "wall")
    put(Wh, z, "window_wall" if jsmod(z, 4) == 0 else "wall")

def room_wall_pts(b):
    x0, y0, x1, y1 = b
    pts = []
    for x in range(x0, x1 + 1):
        pts += [(x, y0), (x, y1)]
    for y in range(y0, y1 + 1):
        pts += [(x0, y), (x1, y)]
    return set(pts)

for k, r in ROOMS.items():
    for (px, py) in room_wall_pts(r["b"]):
        if (wx(px), wz(py)) not in walls:
            put(wx(px), wz(py))

# reunião toda de vidro (inclusive o lado de fora)
for (px, py) in room_wall_pts(ROOMS["reuniao"]["b"]):
    put(wx(px), wz(py), "window_wall", glass=True)

# parede do fundo do CEO: escura, sem janelas no meio (a logo fica ali), janelas simétricas
cx0, _, cx1, _ = ROOMS["ceo"]["b"]
for px in range(cx0 + 1, cx1):
    X = wx(px)
    put(X, -22, "window_wall" if X in (-7, 13) else "wall", color="#23272f")

# vãos das portas
for k, (side, pcs) in DOORS.items():
    x0, y0, x1, y1 = ROOMS[k]["b"]
    for p in pcs:
        if side == "s": walls.pop((wx(p), wz(y1)), None)
        elif side == "n": walls.pop((wx(p), wz(y0)), None)
        elif side == "e": walls.pop((wx(x1), wz(p)), None)
        elif side == "w": walls.pop((wx(x0), wz(p)), None)

# ---------------------------------------------------------------- móveis
SIZE = {  # w, d
 "desk": (2, 1), "exec_chair": (.6, .6), "office_chair": (.6, .6), "chair": (.6, .6), "bookshelf": (2, .5), "sofa": (3, 1),
 "armchair": (1, 1), "coffee_table": (1.4, .8), "plant_big": (1, 1), "p_olive": (.8, .8), "p_monstera": (.8, .8),
 "p_bookcase_full": (1.4, .4), "p_trophy": (1.2, .4), "p_safe": (.6, .6), "p_aquarium": (1.2, .5), "p_floor_lamp": (1.2, .5),
 "p_side_table": (.5, .5), "p_fireplace": (1.4, .4), "p_jukebox": (.9, .6), "p_bar_table": (.7, .7), "p_coat_rack": (.5, .5),
 "table_round": (1.2, 1.2), "cabinet": (1.2, .5), "conf_table": (4, 1.6), "tv": (3, .3), "whiteboard": (2, .3),
 "neon_logo": (3, .4), "counter": (3, .8), "fridge": (.9, .8), "coffee": (2, .8), "water": (.6, .6), "stool": (.5, .5),
 "pool_table": (2.4, 1.4), "ping_pong": (2.6, 1.5), "arcade": (.8, .8), "beanbag": (.9, .9), "p_videogame": (1.6, .6),
 "p_foosball": (1.4, .8), "speaker": (.6, .6), "bed": (1.2, 2.1), "p_hammock": (2.4, .9), "cleiton": (.8, .8),
 "p_bench": (1.6, .5), "bamboo": (1.2, .6), "goal_panel": (1.8, .4), "fin_panel": (1.8, .4), "clock_panel": (1.8, .4),
 "p_planter_long": (1.6, .4), "tree": (1.6, 1.6), "pine": (1.2, 1.2), "bush": (1, 1), "flower": (.5, .5),
}
NOBLOCK = {"exec_chair", "office_chair", "chair", "beanbag", "stool", "p_floor_lamp", "p_coat_rack", "p_bench"}
HUNG = {"p_mirror", "p_clock_wall", "p_neon_ring", "frame_wide", "frame_medium", "p_dartboard", "ouvidoria_sign"}
foot = []  # (tipo, x0, z0, x1, z1) para validar

def put_item(t, x, z, rot=0, **kw):
    it = add(t, x, z, rot, **kw)
    if t in SIZE and t not in HUNG:
        w, d = SIZE[t]
        if rot in (90, 270): w, d = d, w
        foot.append((t, x - w / 2, z - d / 2, x + w / 2, z + d / 2, it["id"]))
    return it

def interior(k):
    x0, y0, x1, y1 = ROOMS[k]["b"]
    return (wx(x0) + .5, wz(y0) + .5, wx(x1) - .5, wz(y1) - .5)

def pods(xs, cz, chair="office_chair"):
    for cx in xs:
        put_item("desk", cx, cz - 2.1, 0)
        put_item(chair, cx - .5, cz - 1.0, 180); put_item(chair, cx + .5, cz - 1.0, 180)
        put_item("desk", cx, cz + 2.1, 180)
        put_item(chair, cx - .5, cz + 1.0, 0); put_item(chair, cx + .5, cz + 1.0, 0)

# ---- Sala do CEO (destaque): x -9.5..15.5, z -21.5..-8.5, eixo x=3
AX = 3
rugc = lambda t, x, z, p, c, f, rot=0: put_item(t, x, z, rot, cfg={"rs": {"p": p, "c": c, "f": f}})
RUG_SIZE = {"rugc_xl": (6, 4), "rugc_oval": (3.2, 2.2), "rugc_round": (2.4, 2.4), "rugc_l": (4, 3), "rugc_m": (3, 2)}
def rug(t, x, z, p, c, f, rot=0):
    return add(t, x, z, rot, cfg={"rs": {"p": p, "c": c, "f": f}})
add("neon_logo", AX, -21.7, 0)
for dx in (2.5, 4.0, 7.0, 8.6, 5.6, 7.2):
    pass
for sgn in (-1, 1):
    put_item("p_bookcase_full", AX + sgn * 2.5, -21.3, 0)
    put_item("p_bookcase_full", AX + sgn * 4.0, -21.3, 0)
    put_item("p_trophy", AX + sgn * 5.6, -21.3, 0)
    put_item("p_bookcase_full", AX + sgn * 7.2, -21.3, 0)
put_item("p_olive", -9.0, -21.0); put_item("p_olive", 15.0, -21.0)
rug("rugc_xl", AX, -16.9, 23, 0, "r")
put_item("desk", AX - 1, -18.2, 180); put_item("desk", AX + 1, -18.2, 180)
put_item("exec_chair", AX, -19.4, 0)
put_item("cabinet", AX - .8, -20.75, 0); put_item("cabinet", AX + .8, -20.75, 0)
put_item("armchair", AX - 1.1, -15.2, 180); put_item("armchair", AX + 1.1, -15.2, 180)
put_item("p_floor_lamp", -1.2, -18.0, 0); put_item("p_floor_lamp", 7.2, -18.0, 180)
put_item("p_side_table", -.4, -15.2); put_item("p_side_table", 6.4, -15.2)
# lounge leste
rug("rugc_oval", 12.2, -13.5, 17, 0, "o", 90)
put_item("sofa", 10.4, -13.5, 270)
put_item("coffee_table", 12.2, -13.5, 90)
put_item("armchair", 12.4, -16.6, 0); put_item("armchair", 12.4, -10.4, 180)
put_item("p_fireplace", 15.3, -13.5, 90)
add("p_mirror", 15.85, -13.5, 90); add("p_clock_wall", 15.85, -17.5, 90); add("frame_wide", 15.65, -10.0, 90)
put_item("p_jukebox", 15.1, -19.6, 90)
put_item("p_olive", 14.9, -9.0)
# canto de reunião informal (oeste)
rug("rugc_round", -5.3, -13.5, 1, 3, "c")
put_item("table_round", -5.3, -13.5)
put_item("exec_chair", -5.3, -14.6, 0); put_item("exec_chair", -5.3, -12.4, 180)
put_item("exec_chair", -6.4, -13.5, 270); put_item("exec_chair", -4.2, -13.5, 90)
put_item("p_aquarium", -9.1, -17.0, 270)
put_item("p_bar_table", -8.5, -11.2); put_item("p_bar_table", -8.5, -9.9)
put_item("p_safe", -9.0, -9.0)
add("frame_wide", -9.65, -19.8, 270); add("p_neon_ring", -9.85, -11.5, 270)
put_item("p_coat_rack", 6.4, -9.0); put_item("p_coat_rack", -.4, -9.0)

# ---- Sala de reunião (vidro): x -31.5..-10.5, z -21.5..-9.5
for tx in (-23, -19, -15):
    put_item("conf_table", tx, -15.5, 0)
    for ox in (-1.5, -.5, .5, 1.5):
        put_item("exec_chair", tx + ox, -16.65, 0); put_item("exec_chair", tx + ox, -14.35, 180)
put_item("exec_chair", -25.4, -15.5, 270); put_item("exec_chair", -12.6, -15.5, 90)
rug("rugc_xl", -22, -15.5, 23, 3, "r"); rug("rugc_xl", -16, -15.5, 23, 3, "r")
put_item("tv", -26, -21.3, 0); put_item("tv", -18, -21.3, 0)
put_item("whiteboard", -31.2, -12.5, 270)
put_item("plant_big", -30.8, -21.0); put_item("plant_big", -11.2, -21.0)
put_item("p_olive", -30.9, -10.2); put_item("p_olive", -11.1, -10.2)

# ---- Squads
pods([-30.0, -27.25, -24.5, -21.75], -4.0)                         # SDR   z -8.5..0.5
put_item("bookshelf", -30.2, -8.2, 0); put_item("bookshelf", -27.7, -8.2, 0)
put_item("whiteboard", -24.0, 0.3, 180); put_item("plant_big", -19.1, -8.0)
pods([-30.0, -27.25, -24.5, -21.75], 6.0)                          # Closers z 1.5..10.5
put_item("bookshelf", -30.2, 10.2, 180); put_item("bookshelf", -27.7, 10.2, 180)
put_item("whiteboard", -24.0, 1.7, 0); put_item("plant_big", -19.1, 10.0)
pods([-30.0, -27.25, -24.5, -21.75], 16.5)                         # Editores z 11.5..21.5
put_item("bookshelf", -30.2, 21.2, 180); put_item("bookshelf", -27.7, 21.2, 180)
put_item("tv", -24.0, 11.8, 0); put_item("plant_big", -19.1, 20.8)
pods([23.0, 25.75, 28.5], -4.0)                                    # Gestores x 19.5..31.5
put_item("bookshelf", 21.5, -8.2, 0); put_item("bookshelf", 24.0, -8.2, 0)
put_item("table_round", 30.5, -4.0)
put_item("chair", 30.5, -5.1, 0); put_item("chair", 30.5, -2.9, 180)
put_item("whiteboard", 26.0, 0.3, 180); put_item("plant_big", 30.8, -8.0)

# ---- Head: x 16.5..31.5, z -21.5..-9.5
rug("rugc_l", 24, -17.0, 23, 7, "r")
put_item("desk", 24, -18.2, 180); put_item("exec_chair", 24, -19.4, 0)
put_item("armchair", 22.9, -15.2, 180); put_item("armchair", 25.1, -15.2, 180)
put_item("bookshelf", 18.2, -21.2, 0); put_item("bookshelf", 30.0, -21.2, 0)
add("frame_wide", 24, -21.75, 0)
put_item("sofa", 30.9, -14.0, 90); put_item("coffee_table", 28.6, -14.0, 90)
put_item("p_olive", 16.9, -12.5); put_item("plant_big", 30.9, -10.3)

# ---- Ouvidoria: x 19.5..31.5, z 1.5..7.5
add("ouvidoria_sign", 25.5, 2.2, 0); put_item("cleiton", 25.5, 3.2, 0)
put_item("chair", 24.8, 5.2, 180); put_item("chair", 26.2, 5.2, 180)
put_item("bookshelf", 30.2, 1.9, 0); put_item("plant_big", 20.2, 6.8); put_item("plant_big", 30.9, 6.9)
add("frame_wide", 31.65, 4.5, 90)

# ---- Cozinha: x -15.5..-3.5, z 12.5..21.5
put_item("fridge", -15.0, 21.1, 180)
put_item("counter", -13.0, 21.1, 180); put_item("coffee", -10.5, 21.1, 180)
put_item("counter", -8.0, 21.1, 180); put_item("water", -5.9, 21.1, 180)
put_item("counter", -9.5, 17.5, 0)
for sx in (-10.9, -9.5, -8.1): put_item("stool", sx, 16.5, 180)
put_item("table_round", -13.8, 15.4)
for (cx_, cz_, r_) in ((-13.8, 14.3, 0), (-13.8, 16.5, 180), (-14.9, 15.4, 270), (-12.7, 15.4, 90)): put_item("chair", cx_, cz_, r_)
put_item("plant_big", -4.1, 13.1)
add("frame_wide", -15.65, 18.0, 270)

# ---- Esportes: x 3.5..18.5, z 12.5..21.5
put_item("pool_table", 7.0, 16.6, 0); put_item("ping_pong", 13.2, 16.6, 0)
put_item("p_foosball", 16.9, 19.9, 0)
put_item("p_videogame", 10.5, 21.1, 180)
for bx in (9.3, 10.5, 11.7): put_item("beanbag", bx, 19.7)
put_item("arcade", 4.2, 18.3, 270); put_item("arcade", 4.2, 19.3, 270)
add("p_dartboard", 18.85, 16.6, 90)
put_item("speaker", 4.3, 21.0); put_item("plant_big", 18.0, 13.2); put_item("plant_big", 4.4, 13.2)

# ---- Descanso: x 19.5..31.5, z 8.5..21.5
rug("rugc_oval", 25, 18.2, 22, 12, "o")
put_item("sofa", 25, 21.0, 180); put_item("coffee_table", 25, 18.4, 0)
put_item("beanbag", 22.5, 18.4); put_item("beanbag", 27.5, 18.4)
put_item("armchair", 29.6, 15.3, 90)
put_item("bed", 29.0, 10.0, 0); put_item("bed", 30.6, 10.0, 0)
put_item("p_hammock", 24.0, 9.4, 0)
put_item("p_monstera", 20.4, 20.8); put_item("p_olive", 31.0, 18.8)
put_item("p_aquarium", 31.1, 13.2, 90)

# ---- Pátio central: x -17.5..18.5, z -8.5..11.5
rug("rugc_xl", .5, 2.0, 21, 8, "r")
put_item("table_round", .5, 2.0)
for (cx_, cz_, r_) in ((.5, .9, 0), (.5, 3.1, 180), (-.6, 2.0, 270), (1.6, 2.0, 90)): put_item("chair", cx_, cz_, r_)
for (x_, z_) in ((-12, -6.4), (-6, -6.4), (10, -6.4), (13.5, -6.4), (-12, 9.0), (13.5, 9.0)): put_item("p_olive", x_, z_)
put_item("p_planter_long", -9, -7.6, 0); put_item("p_planter_long", 8, -7.6, 0)
put_item("p_bench", -10.5, 1.0, 270); put_item("p_bench", -10.5, 3.2, 270)
put_item("p_bench", 11.5, 1.0, 90); put_item("p_bench", 11.5, 3.2, 90)
put_item("p_bar_table", -6, 7.5); put_item("stool", -6.7, 7.5); put_item("stool", -5.3, 7.5)
put_item("p_bar_table", 7, 7.5); put_item("stool", 6.3, 7.5); put_item("stool", 7.7, 7.5)
put_item("bamboo", -16.7, 0.0, 270); put_item("bamboo", 17.9, 1.0, 90); put_item("bamboo", 17.9, 7.0, 90)
put_item("p_planter_long", -4, 10.8, 0); put_item("p_planter_long", 5, 10.8, 0)
put_item("tree", -13.6, 2.6); put_item("tree", 14.8, 2.6)
for (x_, z_) in ((-13.6, 0.2), (-13.6, 5.0), (14.8, 0.2), (14.8, 5.0), (-3.2, -7.4)): put_item("bush", x_, z_)
for (x_, z_) in ((-14.6, 3.4), (-12.6, 1.8), (15.8, 3.4), (13.8, 1.8), (-1.5, 9.6), (2.5, 9.8)): add("flower", x_, z_, 0)

# ---- Corredor do Editores e hall de entrada
put_item("plant_big", -17.0, 13.3); put_item("plant_big", -17.0, 20.8)
add("neon_logo", -2.65, 16.0, 270)
add("clock_panel", -2.65, 19.4, 270)
add("goal_panel", 2.65, 15.5, 90); add("fin_panel", 2.65, 18.0, 90)
put_item("plant_big", -1.9, 13.2); put_item("plant_big", 1.9, 13.2)

# ---- Árvores e jardim ao redor (fora do prédio)
rnd = random.Random(44)
for i in range(-38, 39, 4):
    for z in (-27.5, 27.5):
        if z > 0 and abs(i) < 5: continue
        add(rnd.choice(["tree", "tree", "pine"]), i + rnd.uniform(-1, 1), z + rnd.uniform(-1.2, 1.2), 0)
for j in range(-24, 25, 4):
    for x in (-37.5, 37.5):
        add(rnd.choice(["tree", "pine", "bush"]), x + rnd.uniform(-1, 1), j + rnd.uniform(-1, 1), 0)
for i in range(14):
    add("flower", rnd.uniform(-8, 8), 25 + rnd.uniform(-1, 1.5), 0)
for i in (-6, 6): add("bush", i, 24.6, 0)

# ---------------------------------------------------------------- zonas
zones = []
for k, r in ROOMS.items():
    x0, y0, x1, y1 = r["b"]
    z = {"id": "z-" + k, "name": r["name"], "x": (x0 + x1) / 2 - 32, "z": (y0 + y1) / 2 - 22,
         "w": x1 - x0 - 1, "d": y1 - y0 - 1, "private": r["priv"], "floor": r["floor"]}
    if "role" in r: z["role"] = r["role"]
    if "door" in r: z["door"] = r["door"]
    zones.append(z)
zones.append({"id": "z-patio", "name": "Pátio", "x": .5, "z": 1.5, "w": 36, "d": 20, "private": False, "floor": "madeira-clara"})

out_items = list(walls.values()) + items
layout = {
  "version": 9, "size": {"w": W, "d": D}, "spawn": {"x": 0, "z": 18.5},
  "items": out_items, "zones": zones,
  "style": {"wall": "#efe9de", "window": "ampla", "frame": "#2e3139", "door": "madeira", "floor": "porcelanato"},
}

# ---------------------------------------------------------------- validação
def inside_room(it):
    for k in ROOMS:
        a, b, c, d = interior(k)
        if a - .01 <= it[1] and it[3] <= c + .01 and b - .01 <= it[2] and it[4] <= d + .01: return k
    return None
problems = []
solid = [f for f in foot if f[0] not in NOBLOCK]
for f in foot:
    if f[0] in ("tree", "pine", "bush", "flower"): continue
    in_room = inside_room(f)
    if not in_room:
        # pátio?
        if not (-17.5 <= f[1] and f[3] <= 18.5 and -8.5 <= f[2] and f[4] <= 11.5) and not (f[1] >= -16 and f[3] <= 4 and f[2] >= 12 and False):
            problems.append(("fora de sala/pátio", f))
for i in range(len(solid)):
    for j in range(i + 1, len(solid)):
        a, b = solid[i], solid[j]
        if a[1] < b[3] - .02 and a[3] > b[1] + .02 and a[2] < b[4] - .02 and a[4] > b[2] + .02:
            problems.append(("sobreposto", a, b))
for p in problems: print(p, file=sys.stderr)
print(f"itens={len(out_items)} paredes={len(walls)} problemas={len(problems)}", file=sys.stderr)
json.dump(layout, sys.stdout, ensure_ascii=False, separators=(",", ":"))
