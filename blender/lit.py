"""
LIT: a late-night smoke session for Blender.

After the stunt show in backflip.py, Cubey kicks back on a velvet couch in
a dark apartment. Rain on the window, city lights out of focus, a neon sign
buzzing on the wall. He takes a slow pull (the ember lights up his face),
holds it, and blows a cloud and a string of smoke rings.

Run it:
  * Blender > Scripting tab > Open > lit.py > Run Script (Alt+P)
  * or from a terminal:  blender --python blender/lit.py
  * or render the MP4 headless:
        blender -b --python blender/lit.py -S LIT -a

Renders with Cycles by default: real volumetric smoke, glass and light
bounce. Set ENGINE = "EEVEE" below for a real-time version.
Everything is procedural: no downloads, no add-ons, no textures.
Needs Blender 4.2 or newer.
"""

import math
import os
import random

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

SCENE_NAME = "LIT"
ENGINE = "CYCLES"        # or "EEVEE" for real-time
SAMPLES = 256            # Cycles samples for the final render
FPS = 24
FRAME_END = 192          # 8 seconds
SEED = 420

TAU = math.tau

# The session, in frames.
RAISE, AT_MOUTH = 24, 44           # bring the blunt up
INHALE_END = 80                    # long pull, ember glowing
LOWERED = 96                       # arm back down, holding it in
EXHALE = 96                        # big cloud
RINGS = (122, 136, 150)            # then smoke rings
SHOW_FRAME = 140                   # frame shown when the script finishes


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def rgb(hex_str, alpha=1.0):
    """sRGB hex -> linear RGBA, which is what Blender's color sockets expect."""
    h = hex_str.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, alpha)


GOLD = "#ffc800"
PINK = "#ff2e97"
NEON_GREEN = "#39ff14"


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def ease_out(t):
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


def lerp(a, b, t):
    return a + (b - a) * t


def feed(nt, sock, value):
    """Link a socket or set a constant, whichever `value` is."""
    if value is None:
        return
    if isinstance(value, bpy.types.NodeSocket):
        nt.links.new(value, sock)
    else:
        sock.default_value = value


def set_in(n, name, value):
    sock = n.inputs.get(name)
    if sock is not None:
        feed(n.id_data, sock, value)
    return sock


def node(nt, kind, **inputs):
    n = nt.nodes.new(kind)
    for name, value in inputs.items():
        set_in(n, name.replace("_", " "), value)
    return n


def math_op(nt, op, a, b=None, c=None):
    n = nt.nodes.new("ShaderNodeMath")
    n.operation = op
    for sock, value in zip(n.inputs, (a, b, c)):
        feed(nt, sock, value)
    return n.outputs[0]


def remap(nt, value, from_min, from_max, to_min=0.0, to_max=1.0, smoothstep=False):
    n = node(nt, "ShaderNodeMapRange")
    if smoothstep:
        n.interpolation_type = "SMOOTHSTEP"
    feed(nt, n.inputs["Value"], value)
    feed(nt, n.inputs["From Min"], from_min)
    feed(nt, n.inputs["From Max"], from_max)
    feed(nt, n.inputs["To Min"], to_min)
    feed(nt, n.inputs["To Max"], to_max)
    return n.outputs["Result"]


def noise(nt, vector=None, w=None, dims="3D", scale=1.0, detail=2.0, roughness=0.5):
    n = node(nt, "ShaderNodeTexNoise", Scale=scale, Detail=detail, Roughness=roughness)
    n.noise_dimensions = dims
    if vector is not None:
        feed(nt, n.inputs["Vector"], vector)
    if w is not None:
        feed(nt, n.inputs["W"], w)
    return n


def xyz(nt, vector):
    n = node(nt, "ShaderNodeSeparateXYZ")
    feed(nt, n.inputs[0], vector)
    return n.outputs["X"], n.outputs["Y"], n.outputs["Z"]


def combine(nt, x=0.0, y=0.0, z=0.0):
    n = node(nt, "ShaderNodeCombineXYZ")
    for sock, value in zip(n.inputs, (x, y, z)):
        feed(nt, sock, value)
    return n.outputs[0]


def ramp(nt, fac, stops):
    n = node(nt, "ShaderNodeValToRGB")
    elements = n.color_ramp.elements
    while len(elements) < len(stops):
        elements.new(0.5)
    for el, (pos, col) in zip(elements, stops):
        el.position = pos
        el.color = rgb(col) if isinstance(col, str) else col
    feed(nt, n.inputs["Fac"], fac)
    return n.outputs["Color"]


def bump(nt, height, strength=0.3, distance=0.02):
    n = node(nt, "ShaderNodeBump", Strength=strength, Distance=distance)
    feed(nt, n.inputs["Height"], height)
    return n.outputs["Normal"]


def tidy(nt):
    """Lay nodes out in columns by distance from the output, so the node editor is readable."""
    depth = {n: 0 for n in nt.nodes}
    for _ in range(len(nt.nodes)):
        changed = False
        for lk in nt.links:
            d = depth[lk.to_node] + 1
            if depth[lk.from_node] < d:
                depth[lk.from_node] = d
                changed = True
        if not changed:
            break
    columns = {}
    for n in nt.nodes:
        columns.setdefault(depth[n], []).append(n)
    for d, nodes in columns.items():
        for i, n in enumerate(nodes):
            n.location = (-d * 240, (len(nodes) / 2 - i) * 200)


def new_material(name):
    mat = bpy.data.materials.new(name)
    if bpy.app.version < (5, 0, 0):
        mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = node(nt, "ShaderNodeOutputMaterial")
    return mat, nt, out


def principled(name, color, roughness=0.5, **extra):
    """Principled BSDF material. Extra kwargs map to inputs, e.g. Coat_Weight=1."""
    mat, nt, out = new_material(name)
    bsdf = node(nt, "ShaderNodeBsdfPrincipled", Roughness=roughness)
    set_in(bsdf, "Base Color", rgb(color) if isinstance(color, str) else color)
    for key_name, value in extra.items():
        set_in(bsdf, key_name.replace("_", " "), rgb(value) if isinstance(value, str) else value)
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    mat.diffuse_color = rgb(color) if isinstance(color, str) else (0.5, 0.5, 0.5, 1)
    return mat, nt, bsdf


def glow(name, color, strength):
    mat, nt, out = new_material(name)
    em = node(nt, "ShaderNodeEmission", Strength=strength)
    em.inputs["Color"].default_value = rgb(color)
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    mat.diffuse_color = rgb(color)
    return mat, em


def key(target, path, frame, value, index=-1):
    """Set a property and keyframe it in one go."""
    if index >= 0:
        getattr(target, path)[index] = value
        target.keyframe_insert(path, index=index, frame=frame)
    else:
        setattr(target, path, value)
        target.keyframe_insert(path, frame=frame)


def key_socket(sock, frame, value):
    sock.default_value = value
    sock.keyframe_insert("default_value", frame=frame)


def add_object(name, data, coll, location=(0, 0, 0), rotation=(0, 0, 0), scale=(1, 1, 1)):
    ob = bpy.data.objects.new(name, data)
    coll.objects.link(ob)
    ob.location = location
    ob.rotation_euler = rotation
    ob.scale = scale
    return ob


def add_empty(name, coll, location=(0, 0, 0), size=0.2):
    ob = add_object(name, None, coll, location)
    ob.empty_display_size = size
    return ob


def mesh_from_bmesh(name, bm, smooth_shade=True):
    if smooth_shade:
        for f in bm.faces:
            f.smooth = True
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


def mesh_from_data(name, verts, faces, smooth_shade=False, fix_normals=False):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    if fix_normals:
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
    if smooth_shade:
        me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    return me


def rounded_box(bm, dims, radius, segments, center=(0, 0, 0)):
    geom = bmesh.ops.create_cube(bm, size=1.0)
    verts = geom["verts"]
    bmesh.ops.scale(bm, vec=Vector(dims), verts=verts)
    bmesh.ops.translate(bm, vec=Vector(center), verts=verts)
    edges = list({e for v in verts for e in v.link_edges})
    bmesh.ops.bevel(bm, geom=edges, offset=radius, segments=segments,
                    profile=0.5, affect="EDGES", clamp_overlap=True)


def box_mesh(name, dims, radius=0.0, segments=3, center=(0, 0, 0)):
    bm = bmesh.new()
    if radius > 0:
        rounded_box(bm, dims, radius, segments, center)
    else:
        verts = bmesh.ops.create_cube(bm, size=1.0)["verts"]
        bmesh.ops.scale(bm, vec=Vector(dims), verts=verts)
        bmesh.ops.translate(bm, vec=Vector(center), verts=verts)
    return mesh_from_bmesh(name, bm, smooth_shade=radius > 0)


def lathe(name, profile, segments=48):
    """Spin a (radius, height) profile around Z into a mesh."""
    verts, rings = [], []
    for r, z in profile:
        if r < 1e-6:
            rings.append([len(verts)])
            verts.append((0.0, 0.0, z))
        else:
            ring = []
            for k in range(segments):
                a = TAU * k / segments
                ring.append(len(verts))
                verts.append((r * math.cos(a), r * math.sin(a), z))
            rings.append(ring)
    faces = []
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        for k in range(segments):
            k2 = (k + 1) % segments
            if len(a) == 1:
                faces.append((a[0], b[k], b[k2]))
            elif len(b) == 1:
                faces.append((a[k], a[k2], b[0]))
            else:
                faces.append((a[k], a[k2], b[k2], b[k]))
    return mesh_from_data(name, verts, faces, smooth_shade=True, fix_normals=True)


def aim(ob, target):
    """Point an object's -Z (lights, cameras) at a location."""
    ob.rotation_euler = (Vector(target) - Vector(ob.location)).to_track_quat("-Z", "Y").to_euler()


def area_light(coll, name, location, target, color, power, size, size_y=None):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = power
    data.color = rgb(color)[:3]
    if size_y is None:
        data.size = size
    else:
        data.shape = "RECTANGLE"
        data.size = size
        data.size_y = size_y
    lamp = add_object(name, data, coll, location=location)
    lamp.visible_camera = False          # light the scene, don't appear as white panels
    lamp.visible_glossy = False
    lamp.visible_transmission = False
    aim(lamp, target)
    return lamp


def point_light(coll, name, location, color, power, radius=0.05):
    data = bpy.data.lights.new(name, "POINT")
    data.energy = power
    data.color = rgb(color)[:3]
    data.shadow_soft_size = radius
    return add_object(name, data, coll, location=location)


# ---------------------------------------------------------------------------
# Scene
# ---------------------------------------------------------------------------

def fresh_scene():
    """Make a new LIT scene; re-running the script replaces the old one."""
    scene = bpy.data.scenes.new(SCENE_NAME + ".tmp")
    window = bpy.context.window
    if window is not None:
        window.scene = scene
    old = bpy.data.scenes.get(SCENE_NAME)
    if old is not None:
        for ob in list(old.objects):
            bpy.data.objects.remove(ob, do_unlink=True)
        for coll in list(old.collection.children_recursive):
            bpy.data.collections.remove(coll)
        bpy.data.scenes.remove(old)
    scene.name = SCENE_NAME
    return scene


def make_collection(scene, name):
    coll = bpy.data.collections.new(name)
    scene.collection.children.link(coll)
    return coll


def build_world(scene):
    world = bpy.data.worlds.new("LIT Night")
    scene.world = world
    if bpy.app.version < (5, 0, 0):
        world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    coords = node(nt, "ShaderNodeTexCoord")
    _, _, z = xyz(nt, coords.outputs["Generated"])
    sky = ramp(nt, remap(nt, z, -0.05, 0.6), [(0.0, "#2a1f4a"), (1.0, "#05060f")])
    bg = node(nt, "ShaderNodeBackground", Color=sky, Strength=0.6)
    out = node(nt, "ShaderNodeOutputWorld")
    nt.links.new(bg.outputs[0], out.inputs["Surface"])
    tidy(nt)


# ---------------------------------------------------------------------------
# The apartment
# ---------------------------------------------------------------------------

WALL_Y = 2.2
WINDOW = (-4.8, -0.8, 2.4, 5.4)          # x0, x1, z0, z1 of the window opening


def wood_floor():
    mat, nt, bsdf = principled("Wood Floor", "#5a3620", roughness=0.32)
    coords = node(nt, "ShaderNodeTexCoord").outputs["Object"]
    planks = node(nt, "ShaderNodeTexBrick", Vector=coords, Scale=1.0, Mortar_Size=0.004,
                  Mortar_Smooth=0.3, Brick_Width=2.2, Row_Height=0.22, Bias=0.0,
                  Color1=rgb("#6b4128"), Color2=rgb("#3d2414"), Mortar=rgb("#120a06"))
    grain_vec = node(nt, "ShaderNodeMapping", Vector=coords)
    grain_vec.inputs["Scale"].default_value = (0.4, 14.0, 1.0)
    grain = noise(nt, grain_vec.outputs[0], scale=6.0, detail=8.0, roughness=0.6)
    tone = math_op(nt, "MULTIPLY_ADD", grain.outputs["Fac"], 0.9, 0.55)
    color = node(nt, "ShaderNodeMix", Factor=1.0)
    color.data_type = "RGBA"
    color.blend_type = "MULTIPLY"
    feed(nt, color.inputs[6], planks.outputs["Color"])
    feed(nt, color.inputs[7], combine(nt, tone, tone, tone))
    nt.links.new(color.outputs[2], bsdf.inputs["Base Color"])
    feed(nt, bsdf.inputs["Roughness"], remap(nt, grain.outputs["Fac"], 0.3, 0.7, 0.22, 0.45))
    height = math_op(nt, "ADD", math_op(nt, "MULTIPLY", grain.outputs["Fac"], 0.3),
                     math_op(nt, "MULTIPLY", planks.outputs["Fac"], -1.0))
    nt.links.new(bump(nt, height, 0.25, 0.01), bsdf.inputs["Normal"])
    tidy(nt)
    return mat


def plaster(name, color):
    mat, nt, bsdf = principled(name, color, roughness=0.85)
    coords = node(nt, "ShaderNodeTexCoord").outputs["Object"]
    n = noise(nt, coords, scale=18.0, detail=6.0)
    nt.links.new(bump(nt, n.outputs["Fac"], 0.08), bsdf.inputs["Normal"])
    tidy(nt)
    return mat


def build_room(coll):
    floor = add_object("Floor", box_mesh("Floor", (24, 24, 0.1), center=(0, 0, -0.05)), coll)
    floor.data.materials.append(wood_floor())

    # Back wall with a window hole, built from four slabs around the opening.
    wall_mat = plaster("Wall Paint", "#241d33")
    x0, x1, z0, z1 = WINDOW
    thick, left, right, top = 0.2, -12.0, 12.0, 9.0
    slabs = [((left, x0), (0, top)), ((x1, right), (0, top)), ((x0, x1), (0, z0)),
             ((x0, x1), (z1, top))]
    for i, ((a, b), (c, d)) in enumerate(slabs):
        me = box_mesh(f"Wall.{i}", (b - a, thick, d - c),
                      center=((a + b) / 2, WALL_Y + thick / 2, (c + d) / 2))
        me.materials.append(wall_mat)
        add_object(f"Wall.{i}", me, coll)

    # Window frame and a cross mullion.
    frame_mat, _, _ = principled("Window Frame", "#0d0c12", roughness=0.4)
    cx, cz, w = (x0 + x1) / 2, (z0 + z1) / 2, 0.09
    bars = [((x1 - x0 + w, w, w), (cx, WALL_Y, z0)), ((x1 - x0 + w, w, w), (cx, WALL_Y, z1)),
            ((w, w, z1 - z0), (x0, WALL_Y, cz)), ((w, w, z1 - z0), (x1, WALL_Y, cz)),
            ((w * 0.6, w * 0.6, z1 - z0), (cx, WALL_Y, cz)),
            ((x1 - x0, w * 0.6, w * 0.6), (cx, WALL_Y, cz))]
    for i, (dims, center) in enumerate(bars):
        me = box_mesh(f"Window Frame.{i}", dims, center=center)
        me.materials.append(frame_mat)
        add_object(f"Window Frame.{i}", me, coll)

    # Glass with rain drops (a Voronoi bump) so the city lights smear through it.
    glass, nt, bsdf = principled("Rainy Glass", "#ffffff", roughness=0.0, IOR=1.45,
                                 Transmission_Weight=1.0)
    coords = node(nt, "ShaderNodeTexCoord").outputs["Object"]
    drops = node(nt, "ShaderNodeTexVoronoi", Vector=coords, Scale=26.0)
    beads = remap(nt, drops.outputs["Distance"], 0.0, 0.35, 1.0, 0.0, smoothstep=True)
    which = noise(nt, coords, scale=9.0, detail=1.0)
    mask = remap(nt, which.outputs["Fac"], 0.5, 0.56)
    nt.links.new(bump(nt, math_op(nt, "MULTIPLY", beads, mask), 0.6, 0.01),
                 bsdf.inputs["Normal"])
    tidy(nt)
    pane = add_object("Window Glass", mesh_from_data(
        "Window Glass", [(x0, 0, z0), (x1, 0, z0), (x1, 0, z1), (x0, 0, z1)], [(0, 1, 2, 3)]),
        coll, location=(0, WALL_Y + 0.12, 0))
    pane.data.materials.append(glass)

    # Rug under the couch.
    rug, nt, bsdf = principled("Rug", "#3a1030", roughness=0.95, Sheen_Weight=1.0)
    coords = node(nt, "ShaderNodeTexCoord").outputs["Object"]
    rings = node(nt, "ShaderNodeTexWave", Vector=coords, Scale=1.4, Distortion=2.0)
    rings.wave_type = "RINGS"
    color = ramp(nt, rings.outputs["Fac"], [(0.0, "#2b0d2a"), (0.5, "#4a1745"),
                                            (1.0, "#1b0a22")])
    nt.links.new(color, bsdf.inputs["Base Color"])
    fuzz = noise(nt, coords, scale=90.0, detail=2.0)
    nt.links.new(bump(nt, fuzz.outputs["Fac"], 0.35), bsdf.inputs["Normal"])
    tidy(nt)
    me = box_mesh("Rug", (7.5, 4.6, 0.03), radius=0.012, segments=2, center=(0.2, -1.6, 0.015))
    me.materials.append(rug)
    add_object("Rug", me, coll)


def build_city(coll):
    """Skyline far behind the window: stepped buildings, random lit windows."""
    me = mesh_from_data("City", [(-70, 0, -2), (70, 0, -2), (70, 0, 34), (-70, 0, 34)],
                        [(0, 1, 2, 3)])
    city = add_object("City", me, coll, location=(0, 42, 0))
    mat, nt, out = new_material("City Lights")
    coords = node(nt, "ShaderNodeTexCoord").outputs["Object"]
    x, _, z = xyz(nt, coords)
    lot = math_op(nt, "SNAP", x, 4.2)
    skyline = noise(nt, w=math_op(nt, "MULTIPLY", lot, 0.61), dims="1D", scale=1.0, detail=0.0)
    height = math_op(nt, "MULTIPLY_ADD", skyline.outputs["Fac"], 24.0, -4.0)
    inside = math_op(nt, "LESS_THAN", z, height)

    windows = node(nt, "ShaderNodeTexBrick", Vector=combine(nt, x, z, 0.0), Scale=1.0,
                   Mortar_Size=0.28, Brick_Width=0.9, Row_Height=0.7, Bias=0.0,
                   Color1=(0.0, 0.0, 0.0, 1.0), Color2=(1.0, 1.0, 1.0, 1.0))
    windows.offset = 0.0
    bw = node(nt, "ShaderNodeRGBToBW")
    feed(nt, bw.inputs[0], windows.outputs["Color"])
    lit = math_op(nt, "GREATER_THAN", bw.outputs[0], 0.62)
    glass = math_op(nt, "SUBTRACT", 1.0, windows.outputs["Fac"])
    warmth = noise(nt, combine(nt, lot, 0.0, 0.0), scale=0.35, detail=0.0)
    tint = ramp(nt, warmth.outputs["Fac"], [(0.35, "#ffb35c"), (0.65, "#9fd3ff")])
    power = math_op(nt, "MULTIPLY", math_op(nt, "MULTIPLY", lit, glass), 5.0)
    em = node(nt, "ShaderNodeEmission", Color=tint, Strength=power)
    body = node(nt, "ShaderNodeBsdfDiffuse", Color=rgb("#07060d"))
    lights = node(nt, "ShaderNodeAddShader")
    nt.links.new(em.outputs[0], lights.inputs[0])
    nt.links.new(body.outputs[0], lights.inputs[1])
    clear = node(nt, "ShaderNodeBsdfTransparent")
    mix = node(nt, "ShaderNodeMixShader", Fac=inside)
    nt.links.new(clear.outputs[0], mix.inputs[1])
    nt.links.new(lights.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    for attr, value in (("surface_render_method", "DITHERED"), ("blend_method", "HASHED")):
        if hasattr(mat, attr):
            setattr(mat, attr, value)
    tidy(nt)
    city.data.materials.append(mat)

    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=64, radius=2.2)
    moon = add_object("Moon", mesh_from_bmesh("Moon", bm, smooth_shade=False), coll,
                      location=(-22, 70, 19.5), rotation=(math.radians(90), 0, 0))
    moon.data.materials.append(glow("Moon", "#fff1d6", 2.5)[0])


def velvet(name, color):
    mat, nt, bsdf = principled(name, color, roughness=0.75, Sheen_Weight=1.0,
                               Sheen_Roughness=0.35, Sheen_Tint="#9fe7ff")
    coords = node(nt, "ShaderNodeTexCoord").outputs["Object"]
    nap = noise(nt, coords, scale=40.0, detail=4.0)
    nt.links.new(bump(nt, nap.outputs["Fac"], 0.12), bsdf.inputs["Normal"])
    tidy(nt)
    return mat


def build_couch(coll):
    mat = velvet("Velvet", "#0e4a58")
    parts = [
        ("Couch Base", (6.2, 2.9, 0.45), 0.1, (0, 0.25, 0.42)),
        ("Seat Cushion.L", (2.6, 2.1, 0.42), 0.16, (-1.33, -0.1, 0.76)),
        ("Seat Cushion.R", (2.6, 2.1, 0.42), 0.16, (1.33, -0.1, 0.76)),
        ("Back Cushion", (5.4, 0.7, 1.75), 0.3, (0, 1.3, 1.52)),
        ("Armrest.L", (0.55, 2.9, 1.1), 0.22, (-2.85, 0.25, 1.0)),
        ("Armrest.R", (0.55, 2.9, 1.1), 0.22, (2.85, 0.25, 1.0)),
    ]
    for name, dims, radius, center in parts:
        me = box_mesh(name, dims, radius=radius, segments=5, center=center)
        me.materials.append(mat)
        add_object(name, me, coll)
    brass, _, _ = principled("Brass", "#c9a24a", roughness=0.25, Metallic=1.0)
    for i, (x, y) in enumerate(((-2.8, -1.0), (2.8, -1.0), (-2.8, 1.5), (2.8, 1.5))):
        me = lathe(f"Couch Leg.{i}", [(0, 0), (0.07, 0), (0.1, 0.22), (0, 0.22)], 24)
        me.materials.append(brass)
        add_object(f"Couch Leg.{i}", me, coll, location=(x, y, 0))


def side_table(coll, name, location):
    me = lathe(name, [(0, 0), (0.34, 0), (0.34, 0.04), (0.06, 0.12), (0.05, 1.22),
                      (0.52, 1.22), (0.52, 1.28), (0, 1.28)])
    lacquer, _, _ = principled("Black Lacquer", "#08080c", roughness=0.18, Coat_Weight=1.0)
    me.materials.append(lacquer)
    return add_object(name, me, coll, location=location)


def build_props(coll):
    # Lava lamp on the left table.
    side_table(coll, "Side Table.L", (-3.65, -0.55, 0))
    base = (-3.65, -0.55, 1.28)
    chrome, _, _ = principled("Chrome", "#d8d8e0", roughness=0.12, Metallic=1.0)
    for name, profile in (("Lamp Base", [(0, 0), (0.24, 0), (0.26, 0.04), (0.13, 0.5),
                                          (0, 0.5)]),
                          ("Lamp Cap", [(0, 1.62), (0.14, 1.62), (0.09, 1.84), (0, 1.84)])):
        me = lathe(name, profile, 40)
        me.materials.append(chrome)
        add_object(name, me, coll, location=base)
    me = lathe("Lamp Glass", [(0, 0.5), (0.14, 0.5), (0.21, 0.95), (0.15, 1.62), (0, 1.62)], 48)
    glass, _, _ = principled("Lamp Glass", "#ff7aa8", roughness=0.03, IOR=1.33,
                             Transmission_Weight=1.0)
    me.materials.append(glass)
    add_object("Lamp Glass", me, coll, location=base)

    mb = bpy.data.metaballs.new("Lava")
    mb.resolution = 0.05
    mb.render_resolution = 0.02
    rng = random.Random(SEED)
    add_object("Lava", mb, coll, location=base)
    for i in range(6):
        el = mb.elements.new()
        el.radius = rng.uniform(0.09, 0.14)
        el.co = (rng.uniform(-0.04, 0.04), rng.uniform(-0.04, 0.04), 1.0)
        period = rng.choice((96, 192))       # divides the loop so the wax loops too
        phase = rng.uniform(0, TAU)
        fc = mb.driver_add(f"elements[{i}].co", 2)
        fc.driver.type = "SCRIPTED"
        fc.driver.expression = f"1.05 + 0.42*sin(frame*{TAU / period:.5f} + {phase:.3f})"
    wax, _, _ = principled("Lava Wax", "#ff5a36", roughness=0.4, Emission_Color="#ff4a2a",
                           Emission_Strength=6.0)
    mb.materials.append(wax)
    lamp = point_light(coll, "Lava Glow", (base[0], base[1], base[2] + 1.0), "#ff5e3a", 45.0,
                       radius=0.15)
    lamp.data.use_shadow = False

    # Ashtray and a lighter on the right table.
    side_table(coll, "Side Table.R", (3.65, -0.55, 0))
    ceramic, _, _ = principled("Ashtray Ceramic", "#1d1d22", roughness=0.25, Coat_Weight=1.0)
    me = lathe("Ashtray", [(0, 0), (0.3, 0), (0.33, 0.03), (0.34, 0.11), (0.3, 0.12),
                           (0.25, 0.05), (0, 0.045)], 48)
    me.materials.append(ceramic)
    add_object("Ashtray", me, coll, location=(3.55, -0.45, 1.28))
    plastic, _, _ = principled("Lighter", "#d4202b", roughness=0.3, Coat_Weight=0.6)
    me = box_mesh("Lighter", (0.1, 0.24, 0.05), radius=0.02, segments=3)
    me.materials.append(plastic)
    add_object("Lighter", me, coll, location=(3.95, -0.8, 1.305),
               rotation=(0, 0, math.radians(-25)))

    # Snake plant in the corner.
    terracotta, _, _ = principled("Terracotta", "#9a4a2c", roughness=0.8)
    me = lathe("Pot", [(0, 0), (0.3, 0), (0.4, 0.75), (0.43, 0.8), (0, 0.78)], 40)
    me.materials.append(terracotta)
    add_object("Pot", me, coll, location=(4.55, 1.35, 0))
    leaf, nt, bsdf = principled("Snake Plant", "#1f4d24", roughness=0.35)
    coords = node(nt, "ShaderNodeTexCoord").outputs["Object"]
    bands = node(nt, "ShaderNodeTexWave", Vector=coords, Scale=6.0, Distortion=6.0)
    nt.links.new(ramp(nt, bands.outputs["Fac"], [(0.3, "#12361a"), (0.7, "#3f7a3a")]),
                 bsdf.inputs["Base Color"])
    tidy(nt)
    verts, faces = [], []
    for b in range(9):
        spin = rng.uniform(0, TAU)
        side = Vector((math.cos(spin), math.sin(spin), 0))
        lean = Vector((-side.y, side.x, 0)) * rng.uniform(0.05, 0.3)
        root = Vector((rng.uniform(-0.18, 0.18), rng.uniform(-0.18, 0.18), 0.7))
        height, width, steps = rng.uniform(1.1, 2.1), rng.uniform(0.12, 0.2), 12
        start = len(verts)
        for i in range(steps + 1):
            t = i / steps
            spine = root + Vector((0, 0, height * t)) + lean * height * t * t
            w = width * (1 - t) ** 0.6 * min(1.0, 0.4 + t * 4)
            verts += [tuple(spine - side * w / 2), tuple(spine + side * w / 2)]
        for i in range(steps):
            a = start + 2 * i
            faces.append((a, a + 1, a + 3, a + 2))
    me = mesh_from_data("Snake Plant", verts, faces, smooth_shade=True)
    me.materials.append(leaf)
    plant = add_object("Snake Plant", me, coll, location=(4.55, 1.35, 0))
    plant.modifiers.new("Thickness", "SOLIDIFY").thickness = 0.012


def neon_leaf_curve(name, scale=1.0):
    """Seven serrated leaflets fanned out from a stem: the classic leaf, as neon tubing."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    leaflets = [(0, 1.0), (24, 0.84), (-24, 0.84), (50, 0.62), (-50, 0.62), (80, 0.36),
                (-80, 0.36)]
    for angle, length in leaflets:
        a = math.radians(angle)
        axis = Vector((math.sin(a), 0, math.cos(a)))
        across = Vector((math.cos(a), 0, -math.sin(a)))
        n = 22
        outline = []
        for side in (1, -1):
            idx = range(n + 1) if side > 0 else range(n, -1, -1)
            for i in idx:
                t = i / n
                w = 0.14 * length * math.sin(math.pi * t) ** 0.9
                if 0.1 < t < 0.95 and i % 2:
                    w *= 1.25                      # serrated edge
                outline.append(axis * (length * t) + across * (w * side))
        spline = cu.splines.new("POLY")
        spline.points.add(len(outline) - 1)
        for p, co in zip(spline.points, outline):
            p.co = (*(co * scale), 1.0)
        spline.use_cyclic_u = True
    stem = cu.splines.new("POLY")
    stem.points.add(1)
    stem.points[0].co = (0, 0, 0, 1)
    stem.points[1].co = (0, 0, -0.32 * scale, 1)
    cu.bevel_depth = 0.018
    cu.bevel_resolution = 3
    return cu


def build_neon(coll):
    tube_green, _ = glow("Neon Green", NEON_GREEN, 9.0)
    tube_pink, _ = glow("Neon Pink", PINK, 9.0)
    leaf = add_object("Neon Leaf", neon_leaf_curve("Neon Leaf", 0.95), coll,
                      location=(1.55, WALL_Y - 0.08, 3.5))
    leaf.data.materials.append(tube_green)

    cu = bpy.data.curves.new("Neon Text", "FONT")
    cu.body = "chill"
    cu.size = 0.95
    cu.align_x = "LEFT"
    cu.align_y = "CENTER"
    cu.fill_mode = "NONE"                     # outlines only: reads as bent glass tubing
    cu.bevel_depth = 0.02
    cu.bevel_resolution = 3
    text = add_object("Neon Text", cu, coll, location=(2.35, WALL_Y - 0.08, 3.9),
                      rotation=(math.radians(90), 0, 0))
    cu.materials.append(tube_pink)

    # Neon throws colored light onto the wall and the smoke.
    area_light(coll, "Neon Spill Green", (1.55, WALL_Y - 0.6, 3.9), (1.55, WALL_Y, 3.9),
               NEON_GREEN, 40.0, 1.0)
    area_light(coll, "Neon Spill Pink", (3.3, WALL_Y - 0.6, 3.9), (3.3, WALL_Y, 3.9),
               PINK, 40.0, 1.2)
    area_light(coll, "Neon Fill", (2.4, WALL_Y - 0.3, 3.8), (1.4, -1.0, 2.0), PINK, 60.0, 1.5)
    return text


# ---------------------------------------------------------------------------
# Cubey
# ---------------------------------------------------------------------------

CUBEY_HOME = Vector((0.0, -0.05, 1.97))
LEAN_BACK = math.radians(-6)


def cubey_matrix():
    return Matrix.LocRotScale(CUBEY_HOME, Euler((LEAN_BACK, 0, 0)), Vector((1, 1, 1)))


def mouth_world():
    return cubey_matrix() @ Vector((0.0, -1.0, -0.24))


def chill(f):
    """How much head-nodding is allowed: none while the blunt is at his face."""
    return 1.0 - smooth((f - (RAISE - 6)) / 10) + smooth((f - (LOWERED + 4)) / 14)


def body_pose(f):
    """(pitch, stretch) for Cubey at frame f."""
    nod = 0.035 * math.sin(TAU * f / 48) * min(1.0, chill(f))
    breath = 1.0
    if AT_MOUTH <= f < INHALE_END:
        breath = 1 + 0.05 * smooth((f - AT_MOUTH) / (INHALE_END - AT_MOUTH))
    elif INHALE_END <= f < EXHALE:
        breath = 1.05
    elif EXHALE <= f < EXHALE + 40:
        k = (f - EXHALE) / 40
        breath = 1.05 - 0.09 * math.sin(math.pi * min(1.0, k * 1.6)) * (1 - k) - 0.05 * k
        breath = max(breath, 0.95)
        breath = lerp(breath, 1.0, smooth((k - 0.6) / 0.4))
    push = 0.0
    for start in RINGS:
        u = f - start
        if 0 <= u < 8:
            push += 0.07 * math.sin(math.pi * u / 8)   # little forward pop per ring
    return LEAN_BACK + nod + push, breath


def build_cubey(coll):
    bm = bmesh.new()
    rounded_box(bm, (2, 2, 2), 0.32, 8)
    cubey = add_object("Cubey", mesh_from_bmesh("Cubey", bm), coll, location=CUBEY_HOME,
                       rotation=(LEAN_BACK, 0, 0))
    body, _, _ = principled("Cubey Candy", GOLD, roughness=0.3, Coat_Weight=1.0,
                            Coat_Roughness=0.05)
    cubey.data.materials.append(body)
    ink, _, _ = principled("Cubey Ink", "#050308", roughness=0.12, Coat_Weight=1.0)
    blush_mat, _, _ = principled("Blush", PINK, roughness=0.5, Emission_Color=PINK,
                                 Emission_Strength=0.4)

    def child(name, me, loc, scale=(1, 1, 1), mat=None, parent=cubey, rot=(0, 0, 0)):
        ob = add_object(name, me, coll, location=loc, scale=scale, rotation=rot)
        if mat:
            ob.data.materials.append(mat)
        ob.parent = parent
        return ob

    def sphere_mesh(name, radius, segs=(24, 14), keep_top=False):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=segs[0], v_segments=segs[1], radius=radius)
        if keep_top:
            bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:],
                                   plane_co=(0, 0, 0), plane_no=(0, 0, 1), clear_inner=True)
        return mesh_from_bmesh(name, bm)

    # Eyes with lids (a hemisphere in body color that rotates down over the eye).
    lids = []
    for side in (-1, 1):
        eye = child("Eye", sphere_mesh("Eye", 0.17), (0.36 * side, -1.0, 0.22),
                    (1.0, 0.5, 1.3), ink)
        child("Eye Shine", sphere_mesh("Eye Shine", 0.04, (12, 8)), (0.05, -0.15, -0.05),
              mat=glow("Eye Shine", "#ffffff", 6.0)[0], parent=eye)
        lid = child("Eyelid", sphere_mesh("Eyelid", 0.215, keep_top=True), (0, 0, 0),
                    mat=body, parent=eye)
        lids.append(lid)
        child("Blush", sphere_mesh("Blush", 0.12, (16, 10)), (0.64 * side, -0.99, -0.1),
              (1.3, 0.25, 0.7), blush_mat)

    # Mouth: a lazy smile, swapped for an "O" when he blows smoke.
    cu = bpy.data.curves.new("Smile", "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = 0.032
    cu.bevel_resolution = 4
    spline = cu.splines.new("NURBS")
    pts = [(-0.18, 0, 0.03), (-0.07, 0, -0.05), (0.07, 0, -0.05), (0.18, 0, 0.03)]
    spline.points.add(len(pts) - 1)
    for p, co in zip(spline.points, pts):
        p.co = (*co, 1.0)
    spline.order_u = 3
    spline.use_endpoint_u = True
    cu.materials.append(ink)
    smile = child("Smile", cu, (0.0, -1.0, -0.24))
    ring_me = mesh_from_data("O Mouth", *torus_data(0.075, 0.03), smooth_shade=True)
    o_mouth = child("O Mouth", ring_me, (0.0, -1.0, -0.24), mat=ink,
                    rot=(math.radians(90), 0, 0))

    build_beanie(coll, cubey)

    # Body: lean back, nod to the beat, breathe with the hit.
    for f in range(1, FRAME_END + 1):
        pitch, stretch = body_pose(f)
        side = 1 / math.sqrt(stretch)
        key(cubey, "rotation_euler", f, pitch, index=0)
        key(cubey, "scale", f, side, index=0)
        key(cubey, "scale", f, side, index=1)
        key(cubey, "scale", f, stretch, index=2)
        key(cubey, "location", f, CUBEY_HOME.z + (stretch - 1.0), index=2)

    # Eyelids: 0 = half-mast (the default mood), +90 degrees = shut.
    lid_keys = [(1, 18), (10, 18), (12, 90), (14, 18), (RAISE + 8, 25), (AT_MOUTH + 4, 90),
                (INHALE_END, 90), (INHALE_END + 6, 55), (EXHALE, 55), (EXHALE + 8, 30),
                (160, 30), (176, 18), (FRAME_END, 18)]
    for frame, deg in lid_keys:
        for lid in lids:
            key(lid, "rotation_euler", frame, math.radians(deg), index=0)

    # Cheeks puff while he holds it in.
    for frame, s in ((1, 1.0), (INHALE_END - 4, 1.0), (INHALE_END + 4, 1.45), (EXHALE, 1.45),
                     (EXHALE + 5, 1.0), (FRAME_END, 1.0)):
        for ob in coll.objects:
            if ob.name.startswith("Blush"):
                key(ob, "scale", frame, 1.3 * s, index=0)
                key(ob, "scale", frame, 0.7 * s, index=2)

    # Mouth swap: smile <-> O for the exhale and the rings.
    blow = [(1, 0), (EXHALE - 2, 0), (EXHALE, 1), (EXHALE + 16, 1), (EXHALE + 20, 0),
            (RINGS[0] - 3, 0), (RINGS[0], 1), (RINGS[-1] + 10, 1), (RINGS[-1] + 14, 0),
            (FRAME_END, 0)]
    for frame, on in blow:
        for axis in range(3):
            key(o_mouth, "scale", frame, max(on, 0.001), index=axis)
            key(smile, "scale", frame, max(1 - on, 0.001), index=axis)
    return cubey


def torus_data(major, minor, n=40, m=12):
    verts, faces = [], []
    for i in range(n):
        a = TAU * i / n
        for j in range(m):
            b = TAU * j / m
            r = major + minor * math.cos(b)
            verts.append((r * math.cos(a), r * math.sin(a), minor * math.sin(b)))
    for i in range(n):
        for j in range(m):
            i2, j2 = (i + 1) % n, (j + 1) % m
            faces.append((i * m + j, i2 * m + j, i2 * m + j2, i * m + j2))
    return verts, faces


def build_beanie(coll, cubey):
    knit, nt, bsdf = principled("Knit", "#1f6b3a", roughness=0.9, Sheen_Weight=0.8,
                                Sheen_Tint="#b8ffcf")
    coords = node(nt, "ShaderNodeTexCoord").outputs["Object"]
    ribs = node(nt, "ShaderNodeTexWave", Vector=coords, Scale=9.0, Distortion=0.5,
                Detail=0.0)
    ribs.bands_direction = "X"
    stitches = noise(nt, coords, scale=60.0, detail=3.0)
    height = math_op(nt, "ADD", ribs.outputs["Fac"],
                     math_op(nt, "MULTIPLY", stitches.outputs["Fac"], 0.5))
    nt.links.new(bump(nt, height, 0.45, 0.02), bsdf.inputs["Normal"])
    tidy(nt)

    bm = bmesh.new()
    rounded_box(bm, (2.14, 2.14, 2.14), 0.45, 6)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:],
                           plane_co=(0, 0, 0.6), plane_no=(0, 0, 1), clear_inner=True)
    hat = add_object("Beanie", mesh_from_bmesh("Beanie", bm), coll)
    hat.data.materials.append(knit)
    hat.parent = cubey
    cuff = add_object("Beanie Cuff", box_mesh("Beanie Cuff", (2.22, 2.22, 0.3), radius=0.12,
                                              segments=4, center=(0, 0, 0.72)), coll)
    cuff.data.materials.append(knit)
    cuff.parent = cubey
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=0.28)
    pom = add_object("Pom Pom", mesh_from_bmesh("Pom Pom", bm), coll, location=(0, 0, 1.12))
    pom.data.materials.append(knit)
    pom.parent = cubey


# ---------------------------------------------------------------------------
# The arm, the hand and the blunt
# ---------------------------------------------------------------------------

BLUNT_BUTT, BLUNT_TIP = -0.10, 0.44     # along the hand's local X


def hand_targets():
    rest_pos = Vector((2.5, -0.62, 1.66))
    rest_dir = Vector((0.35, -0.85, 0.42)).normalized()
    mouth_dir = Vector((0.8, -0.5, 0.2)).normalized()
    mouth_pos = mouth_world() + Vector((0, -0.02, 0)) - mouth_dir * BLUNT_BUTT
    rest_q = rest_dir.to_track_quat("X", "Z")
    mouth_q = mouth_dir.to_track_quat("X", "Z")
    if rest_q.dot(mouth_q) < 0:
        mouth_q.negate()
    return (rest_pos, rest_q), (mouth_pos, mouth_q)


def hand_pose(f):
    """(position, rotation, raised) of the hand; raised goes 0 (resting) -> 1 (at the mouth)."""
    (rest_pos, rest_q), (mouth_pos, mouth_q) = hand_targets()
    if f < RAISE or f >= LOWERED:
        t = 0.0
    elif f < AT_MOUTH:
        t = smooth((f - RAISE) / (AT_MOUTH - RAISE))
    elif f < INHALE_END:
        t = 1.0
    else:
        t = 1 - smooth((f - INHALE_END) / (LOWERED - INHALE_END))
    arc = Vector((0.0, -0.3, 0.25)) * math.sin(math.pi * t)
    pos = rest_pos.lerp(mouth_pos, t) + arc
    if t == 0.0:
        pos = pos + Vector((0, 0, 0.02 * math.sin(TAU * f / 48)))   # tapping to the beat
    return pos, rest_q.slerp(mouth_q, t), t


def arm_points(shoulder, hand_pos, hand_q, raised):
    """Rubber-hose control points; the elbow swings out front so the arm clears the body."""
    wrist = hand_pos + hand_q @ Vector((-0.06, 0.0, -0.1))
    mid = (shoulder + wrist) / 2
    reach = (wrist - shoulder).length
    rest_sag = Vector((0.25, -0.15, -0.3)) * max(0.0, 1.6 - reach)
    elbow = mid + rest_sag.lerp(Vector((0.6, -0.8, -0.45)), smooth(raised))
    out = shoulder + Vector((0.3, -0.05, -0.05)).lerp(Vector((0.35, -0.3, -0.1)), raised)
    return [shoulder, out, elbow, wrist]


def build_arm_and_blunt(coll, cubey):
    body = cubey.data.materials[0]
    glove, _, _ = principled("Glove", "#f4f1ea", roughness=0.55, Sheen_Weight=0.5)

    hand = add_empty("Hand", coll, size=0.15)
    hand.rotation_mode = "QUATERNION"
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=16, radius=0.14)
    mitt = add_object("Glove", mesh_from_bmesh("Glove", bm), coll, location=(-0.04, 0.0, -0.1),
                      scale=(1.0, 0.8, 0.8))
    mitt.data.materials.append(glove)
    mitt.parent = hand
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=0.055)
    thumb = add_object("Thumb", mesh_from_bmesh("Thumb", bm), coll, location=(0.03, -0.07, 0.0),
                       scale=(1.3, 1.0, 1.0))
    thumb.data.materials.append(glove)
    thumb.parent = hand

    # The blunt: a slightly lumpy, tapered wrap. Burnt end at +X.
    profile = [(0.0, BLUNT_BUTT), (0.032, BLUNT_BUTT), (0.036, 0.0), (0.042, 0.15),
               (0.043, 0.3), (0.041, 0.39), (0.036, BLUNT_TIP - 0.01), (0.024, BLUNT_TIP),
               (0.0, BLUNT_TIP + 0.004)]
    me = lathe("Blunt", [(r, x) for r, x in profile], 32)
    me.transform(Matrix.Rotation(math.radians(90), 4, "Y"))   # lathe axis Z -> hand X
    blunt = add_object("Blunt", me, coll)
    blunt.parent = hand
    mat, heat = blunt_material()
    me.materials.append(mat)

    ember = add_empty("Ember", coll, location=(BLUNT_TIP + 0.01, 0, 0), size=0.05)
    ember.parent = hand
    glow_light = point_light(coll, "Ember Glow", (BLUNT_TIP + 0.03, 0, 0), "#ff6a1a", 2.0,
                             radius=0.06)
    glow_light.parent = hand

    # Arms: rubber-hose curves. The right one follows the hand every frame.
    def hose(name, points):
        cu = bpy.data.curves.new(name, "CURVE")
        cu.dimensions = "3D"
        cu.bevel_depth = 0.075
        cu.bevel_resolution = 4
        cu.use_fill_caps = True
        sp = cu.splines.new("NURBS")
        sp.points.add(len(points) - 1)
        for p, co in zip(sp.points, points):
            p.co = (*co, 1.0)
        sp.order_u = 3
        sp.use_endpoint_u = True
        cu.materials.append(body)
        add_object(name, cu, coll)
        return cu

    m = cubey_matrix()
    shoulder_r = m @ Vector((0.96, -0.1, -0.15))
    shoulder_l = m @ Vector((-0.96, -0.1, -0.15))
    arm = hose("Arm.R", arm_points(shoulder_r, *hand_pose(1)))
    rest_l = Vector((-1.55, -0.75, 1.02))
    hose("Arm.L", [shoulder_l, shoulder_l + Vector((-0.28, -0.05, -0.1)),
                   (shoulder_l + rest_l) / 2 + Vector((-0.15, 0.0, -0.1)), rest_l])
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=16, radius=0.14)
    left = add_object("Glove.L", mesh_from_bmesh("Glove.L", bm), coll,
                      location=rest_l + Vector((0, -0.05, 0.03)), scale=(1.0, 1.1, 0.7))
    left.data.materials.append(glove)

    rng = random.Random(SEED)
    for f in range(1, FRAME_END + 1):
        pos, q, raised = hand_pose(f)
        for axis in range(3):
            key(hand, "location", f, pos[axis], index=axis)
        for axis in range(4):
            key(hand, "rotation_quaternion", f, q[axis], index=axis)
        for i, co in enumerate(arm_points(shoulder_r, pos, q, raised)):
            arm.splines[0].points[i].co = (*co, 1.0)
            arm.keyframe_insert(f"splines[0].points[{i}].co", frame=f)

        # Ember heat: a lazy smolder, roaring while he pulls on it.
        if AT_MOUTH <= f < INHALE_END:
            base = lerp(1.0, 5.0, smooth((f - AT_MOUTH) / 8))
        elif INHALE_END <= f < INHALE_END + 16:
            base = lerp(5.0, 1.0, smooth((f - INHALE_END) / 16))
        else:
            base = 1.0
        flicker = 1 + 0.18 * math.sin(f * 1.7) * math.sin(f * 0.61 + 1) + rng.uniform(-0.06, 0.06)
        key_socket(heat, f, base * flicker)
        key(glow_light.data, "energy", f, 2.5 * base ** 1.4 * flicker)
    return ember


def blunt_material():
    mat, nt, bsdf = principled("Blunt Wrap", "#5a3a1e", roughness=0.6, Sheen_Weight=0.3)
    coords = node(nt, "ShaderNodeTexCoord").outputs["Object"]
    x, _, _ = xyz(nt, coords)
    along = remap(nt, x, BLUNT_BUTT, BLUNT_TIP)
    zones = ramp(nt, along, [(0.0, "#3b2412"), (0.86, "#6b4524"), (0.885, "#b9b2a8"),
                             (0.95, "#5f5a55"), (0.975, "#2b0a03")])
    leaf = noise(nt, coords, scale=55.0, detail=6.0)
    tone = math_op(nt, "MULTIPLY_ADD", leaf.outputs["Fac"], 0.8, 0.6)
    mix = node(nt, "ShaderNodeMix", Factor=1.0)
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    feed(nt, mix.inputs[6], zones)
    feed(nt, mix.inputs[7], combine(nt, tone, tone, tone))
    nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    veins = node(nt, "ShaderNodeTexWave", Vector=coords, Scale=14.0, Distortion=5.0,
                 Detail=3.0)
    veins.bands_direction = "DIAGONAL"
    nt.links.new(bump(nt, math_op(nt, "ADD", veins.outputs["Fac"], leaf.outputs["Fac"]),
                      0.35, 0.005), bsdf.inputs["Normal"])

    # Ember: glowing cells with dark ash cracks, only at the burnt tip.
    tip = remap(nt, along, 0.965, 0.99, smoothstep=True)
    cells = node(nt, "ShaderNodeTexVoronoi", Vector=coords, Scale=70.0)
    cells.feature = "DISTANCE_TO_EDGE"
    cracks = remap(nt, cells.outputs["Distance"], 0.0, 0.12, 0.1, 1.0)
    heat_node = node(nt, "ShaderNodeValue")
    heat_node.name = heat_node.label = "Heat"
    heat = heat_node.outputs[0]
    hot = math_op(nt, "MULTIPLY", math_op(nt, "MULTIPLY", tip, cracks), heat)
    color = ramp(nt, math_op(nt, "MULTIPLY", hot, 0.25), [(0.0, "#6b0a00"), (0.35, "#ff3c00"),
                                                         (1.0, "#ffd27a")])
    nt.links.new(color, bsdf.inputs["Emission Color"])
    feed(nt, bsdf.inputs["Emission Strength"], math_op(nt, "MULTIPLY", hot, 14.0))
    tidy(nt)
    return mat, heat


# ---------------------------------------------------------------------------
# Smoke: procedural volumes, no simulation or baking needed
# ---------------------------------------------------------------------------

def smoke_time(nt):
    t = node(nt, "ShaderNodeValue")
    t.name = t.label = "Time"
    fc = t.outputs[0].driver_add("default_value")
    fc.driver.type = "SCRIPTED"
    fc.driver.expression = f"frame/{FPS}"
    return t.outputs[0]


def smoke_shader(nt, out, density):
    vol = node(nt, "ShaderNodeVolumePrincipled", Density=density, Anisotropy=0.45)
    vol.inputs["Color"].default_value = (0.78, 0.8, 0.86, 1.0)
    nt.links.new(vol.outputs[0], out.inputs["Volume"])
    tidy(nt)


def wisp_material():
    """A thin ribbon of smoke curling up off the ember."""
    mat, nt, out = new_material("Smoke Wisp")
    t = smoke_time(nt)
    coords = node(nt, "ShaderNodeTexCoord").outputs["Object"]
    x, y, z = xyz(nt, coords)
    drift = math_op(nt, "MULTIPLY_ADD", z, 0.9, math_op(nt, "MULTIPLY", t, -0.55))
    swing = math_op(nt, "MULTIPLY", z, 0.42)
    offsets = []
    for seed in (0.0, 17.3):
        n = noise(nt, w=math_op(nt, "ADD", drift, seed), dims="1D", scale=1.0, detail=2.0)
        offsets.append(math_op(nt, "MULTIPLY", math_op(nt, "SUBTRACT", n.outputs["Fac"], 0.5),
                               math_op(nt, "MULTIPLY", swing, 2.0)))
    dx = math_op(nt, "SUBTRACT", x, offsets[0])
    dy = math_op(nt, "SUBTRACT", y, offsets[1])
    length = node(nt, "ShaderNodeVectorMath")
    length.operation = "LENGTH"
    feed(nt, length.inputs[0], combine(nt, dx, dy, 0.0))
    width = math_op(nt, "MULTIPLY_ADD", z, 0.085, 0.012)
    core = remap(nt, length.outputs["Value"], 0.0, width, 1.0, 0.0, smoothstep=True)

    rise = combine(nt, math_op(nt, "MULTIPLY", x, 4.0), math_op(nt, "MULTIPLY", y, 4.0),
                   math_op(nt, "MULTIPLY_ADD", t, -1.6, math_op(nt, "MULTIPLY", z, 2.2)))
    turb = noise(nt, rise, w=math_op(nt, "MULTIPLY", t, 0.25), dims="4D", scale=1.6,
                 detail=6.0, roughness=0.55)
    breakup = remap(nt, turb.outputs["Fac"], 0.38, 0.72, smoothstep=True)
    fade = math_op(nt, "MULTIPLY", remap(nt, z, 1.4, 2.7, 1.0, 0.0),
                   remap(nt, z, 0.0, 0.04))
    amount = node(nt, "ShaderNodeValue")
    amount.name = amount.label = "Amount"
    amount.outputs[0].default_value = 1.0
    density = math_op(nt, "MULTIPLY", math_op(nt, "MULTIPLY", core, breakup),
                      math_op(nt, "MULTIPLY", fade, math_op(nt, "MULTIPLY", amount.outputs[0],
                                                             9.0)))
    smoke_shader(nt, out, density)
    return mat, amount.outputs[0]


def blob_material(name, ring=False):
    """A puff (soft ball) or a smoke ring (torus), both torn up by animated noise.

    Each object fades through its own Object color alpha, so one material
    serves every puff and every ring.
    """
    mat, nt, out = new_material(name)
    t = smoke_time(nt)
    coords = node(nt, "ShaderNodeTexCoord").outputs["Object"]
    info = node(nt, "ShaderNodeObjectInfo")
    x, y, z = xyz(nt, coords)
    if ring:
        # Ring lies in the XZ plane and flies along its local Y axis.
        radial = node(nt, "ShaderNodeVectorMath")
        radial.operation = "LENGTH"
        feed(nt, radial.inputs[0], combine(nt, x, 0.0, z))
        q = math_op(nt, "SUBTRACT", radial.outputs["Value"], 0.62)
        tube = node(nt, "ShaderNodeVectorMath")
        tube.operation = "LENGTH"
        feed(nt, tube.inputs[0], combine(nt, q, y, 0.0))
        shape = remap(nt, tube.outputs["Value"], 0.0, 0.26, 1.0, 0.0, smoothstep=True)
        scale, lo, hi = 2.6, 0.22, 0.55
    else:
        dist = node(nt, "ShaderNodeVectorMath")
        dist.operation = "LENGTH"
        feed(nt, dist.inputs[0], coords)
        shape = remap(nt, dist.outputs["Value"], 0.15, 0.95, 1.0, 0.0, smoothstep=True)
        scale, lo, hi = 1.8, 0.4, 0.75
    swirl = math_op(nt, "MULTIPLY_ADD", info.outputs["Random"], 50.0,
                    math_op(nt, "MULTIPLY", t, 0.6))
    turb = noise(nt, coords, w=swirl, dims="4D", scale=scale, detail=6.0, roughness=0.6)
    breakup = remap(nt, turb.outputs["Fac"], lo, hi, smoothstep=True)
    density = math_op(nt, "MULTIPLY", math_op(nt, "MULTIPLY", shape, breakup),
                      math_op(nt, "MULTIPLY", info.outputs["Alpha"], 18.0 if ring else 8.0))
    smoke_shader(nt, out, density)
    return mat


def cube_domain(name, lo, hi):
    bm = bmesh.new()
    verts = bmesh.ops.create_cube(bm, size=1.0)["verts"]
    lo, hi = Vector(lo), Vector(hi)
    bmesh.ops.scale(bm, vec=hi - lo, verts=verts)
    bmesh.ops.translate(bm, vec=(hi + lo) / 2, verts=verts)
    return mesh_from_bmesh(name, bm, smooth_shade=False)


def fly(ob, start, life, origin, direction, distance, s0, s1, spin=0.0, alpha=1.0):
    """Keyframe a puff/ring: shoot out, slow down, grow, fade. Hidden when not alive."""
    end = start + life
    key(ob, "hide_render", 1, True)
    key(ob, "hide_viewport", 1, True)
    key(ob, "hide_render", start, False)
    key(ob, "hide_viewport", start, False)
    key(ob, "hide_render", min(end + 1, FRAME_END), True)
    key(ob, "hide_viewport", min(end + 1, FRAME_END), True)
    base_rot = ob.rotation_euler.copy()
    for f in range(start, min(end, FRAME_END) + 1):
        u = (f - start) / life
        travel = ease_out(u)
        pos = origin + direction * distance * travel
        pos.z += 0.35 * u * u                          # warm smoke keeps rising
        s = lerp(s0, s1, ease_out(u) ** 0.8)
        for axis in range(3):
            key(ob, "location", f, pos[axis], index=axis)
            key(ob, "scale", f, s, index=axis)
        key(ob, "rotation_euler", f, base_rot.x + spin * u, index=0)
        fade = smooth(u / 0.08) * (1 - smooth((u - 0.45) / 0.55))
        key(ob, "color", f, alpha * fade, index=3)


def build_smoke(coll, ember):
    wisp_mat, wisp_amount = wisp_material()
    wisp = add_object("Smoke Wisp", cube_domain("Smoke Wisp", (-1.0, -1.0, -0.02),
                                                 (1.0, 1.0, 2.8)), coll)
    wisp.data.materials.append(wisp_mat)
    follow = wisp.constraints.new("COPY_LOCATION")
    follow.target = ember
    # Thin the wisp while the blunt is at his face.
    for frame, v in ((1, 1.0), (RAISE + 6, 1.0), (AT_MOUTH, 0.3), (INHALE_END + 6, 0.3),
                     (LOWERED + 6, 1.0), (FRAME_END, 1.0)):
        key_socket(wisp_amount, frame, v)

    mouth = mouth_world() + Vector((0, -0.12, 0))
    puff_mat = blob_material("Smoke Puff")
    for i, (start, direction, dist, s1) in enumerate((
            (EXHALE, Vector((0.25, -1.0, 0.35)), 1.3, 0.85),
            (EXHALE + 5, Vector((-0.1, -1.0, 0.55)), 1.0, 0.7))):
        ob = add_object(f"Smoke Puff.{i}", cube_domain("Smoke Puff", (-1, -1, -1), (1, 1, 1)),
                        coll)
        ob.data.materials.append(puff_mat)
        ob.color = (1, 1, 1, 0)
        fly(ob, start, 60, mouth, direction.normalized(), dist, 0.12, s1, alpha=1.0 - 0.3 * i)

    ring_mat = blob_material("Smoke Ring", ring=True)
    heading = Vector((-0.55, -0.25, 0.8)).normalized()    # up and across, in front of the window
    facing = Vector((-0.2, -0.95, 0.25)).normalized()    # hole turned toward the camera
    for i, start in enumerate(RINGS):
        ob = add_object(f"Smoke Ring.{i}", cube_domain("Smoke Ring", (-1, -1, -1), (1, 1, 1)),
                        coll)
        ob.data.materials.append(ring_mat)
        ob.rotation_euler = facing.to_track_quat("Y", "Z").to_euler()
        ob.color = (1, 1, 1, 0)
        fly(ob, start, 48, mouth, heading, 2.8, 0.1, 0.8, spin=0.4)


# ---------------------------------------------------------------------------
# Camera, lights, render
# ---------------------------------------------------------------------------

def build_camera(coll):
    target = add_empty("Focus", coll, location=(0.3, -1.0, 2.15), size=0.2)
    data = bpy.data.cameras.new("Camera")
    data.lens = 35
    data.dof.use_dof = True
    data.dof.focus_object = target
    data.dof.aperture_fstop = 2.0
    cam = add_object("Camera", data, coll)
    look = cam.constraints.new("TRACK_TO")
    look.target = target
    look.track_axis = "TRACK_NEGATIVE_Z"
    look.up_axis = "UP_Y"
    # Slow handheld-ish drift that loops.
    for f in range(1, FRAME_END + 1):
        a = TAU * (f - 1) / FRAME_END
        key(cam, "location", f, 0.45 + 0.25 * math.sin(a), index=0)
        key(cam, "location", f, -8.7 + 0.35 * math.cos(a), index=1)
        key(cam, "location", f, 2.45 + 0.08 * math.sin(2 * a), index=2)
    return cam


def build_lights(coll):
    x0, x1, z0, z1 = WINDOW
    # Sits flush inside the window, pointing straight into the room.
    moon_at = Vector(((x0 + x1) / 2, WALL_Y - 0.15, (z0 + z1) / 2))
    area_light(coll, "Moonlight", moon_at, moon_at + Vector((0, -1, 0)), "#8fb0ff", 160.0,
               x1 - x0, z1 - z0)
    area_light(coll, "Warm Key", (-3.5, -5.5, 5.0), (0.0, -0.5, 2.0), "#ffc38a", 220.0, 2.5)
    area_light(coll, "Smoke Rim", (3.8, 1.4, 4.4), (1.8, -0.8, 2.6), "#6fd6ff", 420.0, 1.2)
    area_light(coll, "Floor Bounce", (0.5, -3.0, 0.3), (0.0, -0.8, 2.0), "#6a3cff", 40.0, 3.0)


def setup_render(scene, camera):
    scene.camera = camera
    scene.frame_start = 1
    scene.frame_end = FRAME_END
    scene.render.fps = FPS
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100

    if ENGINE.upper() == "CYCLES":
        scene.render.engine = "CYCLES"
    else:
        for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
            try:
                scene.render.engine = engine
                break
            except TypeError:
                continue

    cycles = scene.cycles
    cycles.samples = SAMPLES
    cycles.preview_samples = 64
    cycles.use_denoising = True
    cycles.use_preview_denoising = True
    cycles.adaptive_threshold = 0.02
    cycles.max_bounces = 10
    cycles.transmission_bounces = 10
    cycles.volume_bounces = 2
    cycles.volume_step_rate = 1.5
    cycles.caustics_reflective = False
    cycles.caustics_refractive = False
    cycles.blur_glossy = 1.0
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        if prefs.compute_device_type not in ("", "NONE"):
            cycles.device = "GPU"                  # only if a GPU is already set up
    except (KeyError, AttributeError):
        pass

    eevee = scene.eevee
    for attr, value in (("taa_render_samples", 128), ("use_raytracing", True),
                        ("volumetric_tile_size", "2"), ("volumetric_samples", 128),
                        ("volumetric_end", 30.0), ("use_volumetric_shadows", True),
                        ("use_bloom", True), ("use_ssr", True), ("use_gtao", True)):
        if hasattr(eevee, attr):
            try:
                setattr(eevee, attr, value)
            except TypeError:
                pass

    view = scene.view_settings
    try:
        view.view_transform = "AgX"
        for look in ("AgX - Medium High Contrast", "Medium High Contrast"):
            try:
                view.look = look
                break
            except TypeError:
                continue
    except TypeError:
        pass

    folder = "//" if bpy.data.filepath else os.path.expanduser("~") + os.sep
    scene.render.filepath = folder + "lit_"
    settings = scene.render.image_settings
    try:
        if hasattr(settings, "media_type"):
            settings.media_type = "VIDEO"
        settings.file_format = "FFMPEG"
        scene.render.ffmpeg.format = "MPEG4"
        scene.render.ffmpeg.codec = "H264"
        scene.render.ffmpeg.constant_rate_factor = "HIGH"
    except TypeError:
        settings.file_format = "PNG"


def set_socket_or_prop(n, sock_name, sock_value, prop, prop_value):
    """Compositor options moved from node properties to input sockets in 4.4/5.0."""
    sock = n.inputs.get(sock_name)
    if sock is not None:
        try:
            sock.default_value = sock_value
            return
        except (TypeError, ValueError):
            pass
    if hasattr(n, prop):
        try:
            setattr(n, prop, prop_value)
        except (TypeError, ValueError):
            pass


def setup_compositor(scene):
    """Soft bloom on the neon and ember, plus a hint of lens fringing."""
    if hasattr(scene, "compositing_node_group"):          # Blender 5.0+
        tree = bpy.data.node_groups.new("LIT Post", "CompositorNodeTree")
        scene.compositing_node_group = tree
        tree.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        out = tree.nodes.new("NodeGroupOutput")
        out_socket = out.inputs[0]
    else:                                                 # Blender 4.x
        scene.use_nodes = True
        tree = scene.node_tree
        tree.nodes.clear()
        out = tree.nodes.new("CompositorNodeComposite")
        out_socket = out.inputs["Image"]
    layers = tree.nodes.new("CompositorNodeRLayers")
    layers.scene = scene
    bloom = tree.nodes.new("CompositorNodeGlare")
    set_socket_or_prop(bloom, "Type", "Bloom", "glare_type", "BLOOM")
    set_socket_or_prop(bloom, "Quality", "High", "quality", "HIGH")
    set_socket_or_prop(bloom, "Threshold", 1.2, "threshold", 1.2)
    set_socket_or_prop(bloom, "Strength", 0.55, "mix", -0.3)
    set_socket_or_prop(bloom, "Size", 0.55, "size", 8)
    lens = tree.nodes.new("CompositorNodeLensdist")
    set_in(lens, "Dispersion", 0.01)
    tree.links.new(layers.outputs["Image"], bloom.inputs["Image"])
    tree.links.new(bloom.outputs["Image"], lens.inputs["Image"])
    tree.links.new(lens.outputs["Image"], out_socket)
    for i, n in enumerate((layers, bloom, lens, out)):
        n.location = (i * 300, 0)
    scene.render.use_compositing = True


def show_off(scene):
    """When run from the UI: camera view, rendered shading, parked on the smoke rings."""
    scene.frame_set(SHOW_FRAME)
    context = bpy.context
    window = context.window
    if bpy.app.background or window is None:
        return
    window.scene = scene
    for area in window.screen.areas:
        if area.type != "VIEW_3D":
            continue
        space = area.spaces.active
        space.shading.type = "RENDERED"
        if hasattr(space.shading, "use_compositor"):
            space.shading.use_compositor = "ALWAYS"
        space.region_3d.view_perspective = "CAMERA"
        space.overlay.show_overlays = False

    def draw(self, _context):
        self.layout.label(text="F12: render this frame    Ctrl+F12: render the MP4")
        self.layout.label(text="Space: play (set ENGINE = \"EEVEE\" for real-time playback)")
    context.window_manager.popup_menu(draw, title="LIT loaded.", icon="LIGHT")


def main():
    scene = fresh_scene()
    room = make_collection(scene, "Apartment")
    outside = make_collection(scene, "Outside")
    cast = make_collection(scene, "Cubey")
    smoke = make_collection(scene, "Smoke")
    rig = make_collection(scene, "Camera + Lights")

    build_world(scene)
    build_room(room)
    build_city(outside)
    build_couch(room)
    build_props(room)
    build_neon(room)
    cubey = build_cubey(cast)
    ember = build_arm_and_blunt(cast, cubey)
    build_smoke(smoke, ember)
    build_lights(rig)
    camera = build_camera(rig)
    setup_render(scene, camera)
    setup_compositor(scene)
    show_off(scene)
    print(f"[LIT] Scene built in Blender {bpy.app.version_string}.")
    return scene


if __name__ == "__main__":
    main()
