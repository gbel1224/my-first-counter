"""
BACKFLIP: a one-click synthwave stunt show for Blender.

Run it:
  * Blender > Scripting tab > Open > backflip.py > Run Script (Alt+P)
  * or from a terminal:  blender --python blender/backflip.py
  * or render the MP4 headless:
        blender -b --python blender/backflip.py -S BACKFLIP -a

It builds a brand-new scene called "BACKFLIP" (your other scenes are left
alone), drops the viewport into the camera and hits play: a glossy little
cube hero crouches, launches, lands a clean backflip, and the crowd loses it.
Everything is procedural: no downloads, no add-ons, no textures.

Needs Blender 4.2 or newer.
"""

import math
import os
import random

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

SCENE_NAME = "BACKFLIP"
FPS = 30
FRAME_END = 120              # 4 second seamless loop
LAND = 68                    # frame the hero sticks the landing
HERO_YAW = math.radians(35)  # turn the hero so the camera sees the flip in 3/4
SEED = 7

TAU = math.tau


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def rgb(hex_str, alpha=1.0):
    """sRGB hex -> linear RGBA, which is what Blender's color sockets expect."""
    h = hex_str.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, alpha)


PINK = "#ff2e97"
CYAN = "#00e5ff"
YELLOW = "#ffd319"
ORANGE = "#ff8a00"
VIOLET = "#9d4dff"
LIME = "#7cff4f"
GOLD = "#ffc800"


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def ease_out(t):
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 2


def lerp(a, b, t):
    return a + (b - a) * t


def set_in(node, name, value):
    """Set a node input if this Blender version has it (socket names drift)."""
    sock = node.inputs.get(name)
    if sock is not None:
        sock.default_value = value
    return sock


def set_prop_or_input(node, prop, sock_name, prop_value, sock_value):
    """Compositor options moved from node properties to input sockets in 4.4/5.0.

    Prefer the socket: 4.5 keeps the old properties around, but they do nothing.
    """
    sock = node.inputs.get(sock_name)
    if sock is not None:
        try:
            sock.default_value = sock_value
            return
        except (TypeError, ValueError):
            pass
    if hasattr(node, prop):
        try:
            setattr(node, prop, prop_value)
        except (TypeError, ValueError):
            pass


def key(target, path, frame, value, index=-1):
    """Set a property and keyframe it in one go."""
    if index >= 0:
        getattr(target, path)[index] = value
        target.keyframe_insert(path, index=index, frame=frame)
    else:
        setattr(target, path, value)
        target.keyframe_insert(path, frame=frame)


def drive(target, path, index, expression):
    """Attach a 'simple expression' driver (these run without enabling Python auto-exec)."""
    fc = target.driver_add(path, index)
    fc.driver.type = "SCRIPTED"
    fc.driver.expression = expression
    return fc


def link(nt, a, b):
    nt.links.new(a, b)


def node(nt, kind, x=0, y=0, **inputs):
    n = nt.nodes.new(kind)
    n.location = (x, y)
    for name, value in inputs.items():
        set_in(n, name.replace("_", " "), value)
    return n


def new_material(name):
    mat = bpy.data.materials.new(name)
    if bpy.app.version < (5, 0, 0):
        mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = node(nt, "ShaderNodeOutputMaterial", 600, 0)
    return mat, nt, out


def principled(name, color, roughness=0.35, coat=0.0,
               emission=None, emission_strength=0.0, thin_film=0.0):
    mat, nt, out = new_material(name)
    bsdf = node(nt, "ShaderNodeBsdfPrincipled", 200, 0)
    set_in(bsdf, "Base Color", rgb(color))
    set_in(bsdf, "Roughness", roughness)
    set_in(bsdf, "Coat Weight", coat)
    set_in(bsdf, "Coat Roughness", 0.03)
    set_in(bsdf, "Thin Film Thickness", thin_film)
    if emission:
        set_in(bsdf, "Emission Color", rgb(emission))
        set_in(bsdf, "Emission Strength", emission_strength)
    link(nt, bsdf.outputs["BSDF"], out.inputs["Surface"])
    mat.diffuse_color = rgb(color)
    return mat, nt, bsdf


def glow(name, color, strength):
    mat, nt, out = new_material(name)
    em = node(nt, "ShaderNodeEmission", 200, 0, Strength=strength)
    em.inputs["Color"].default_value = rgb(color)
    link(nt, em.outputs[0], out.inputs["Surface"])
    mat.diffuse_color = rgb(color)
    return mat, em


def add_object(name, data, coll, location=(0, 0, 0), rotation=(0, 0, 0), scale=(1, 1, 1)):
    ob = bpy.data.objects.new(name, data)
    coll.objects.link(ob)
    ob.location = location
    ob.rotation_euler = rotation
    ob.scale = scale
    return ob


def add_empty(name, coll, location=(0, 0, 0), display="PLAIN_AXES", size=1.0):
    ob = add_object(name, None, coll, location)
    ob.empty_display_type = display
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


def mesh_from_data(name, verts, faces, smooth_shade=False):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    if smooth_shade:
        me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    return me


def rounded_cube(bm, half, radius, segments):
    geom = bmesh.ops.create_cube(bm, size=half * 2)
    edges = list({e for v in geom["verts"] for e in v.link_edges})
    bmesh.ops.bevel(bm, geom=edges, offset=radius, segments=segments,
                    profile=0.5, affect="EDGES", clamp_overlap=True)


def add_sphere(bm, radius, matrix, material_index=0, segments=(20, 12)):
    res = bmesh.ops.create_uvsphere(bm, u_segments=segments[0], v_segments=segments[1],
                                    radius=radius, matrix=matrix)
    for f in {f for v in res["verts"] for f in v.link_faces}:
        f.material_index = material_index


def torus_mesh(name, major, minor, n=96, m=12):
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
    return mesh_from_data(name, verts, faces, smooth_shade=True)


def aim(ob, target):
    """Point an object's -Z (lights, cameras) at a location."""
    direction = Vector(target) - Vector(ob.location)
    ob.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


# ---------------------------------------------------------------------------
# Scene
# ---------------------------------------------------------------------------

def fresh_scene():
    """Make a new BACKFLIP scene; re-running the script replaces the old one."""
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


# ---------------------------------------------------------------------------
# World: synthwave sky with stars
# ---------------------------------------------------------------------------

def build_world(scene):
    world = bpy.data.worlds.new("BACKFLIP Sky")
    scene.world = world
    if bpy.app.version < (5, 0, 0):
        world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()

    coords = node(nt, "ShaderNodeTexCoord", -1200, 0)
    xyz = node(nt, "ShaderNodeSeparateXYZ", -1000, 150)
    link(nt, coords.outputs["Generated"], xyz.inputs[0])

    # Sky gradient: hot pink horizon fading to deep space.
    height = node(nt, "ShaderNodeMapRange", -800, 250)
    height.inputs["From Min"].default_value = -0.02
    height.inputs["From Max"].default_value = 0.5
    link(nt, xyz.outputs["Z"], height.inputs["Value"])
    ramp = node(nt, "ShaderNodeValToRGB", -580, 250)
    stops = [(0.0, "#ff3d8b", 0.9), (0.12, "#7b2cbf", 0.55), (0.45, "#240046", 0.5),
             (1.0, "#05010f", 1.0)]
    elements = ramp.color_ramp.elements
    while len(elements) < len(stops):
        elements.new(0.5)
    for el, (pos, col, dim) in zip(elements, stops):
        el.position = pos
        el.color = tuple(c * dim for c in rgb(col)[:3]) + (1.0,)
    link(nt, height.outputs["Result"], ramp.inputs["Fac"])
    sky = node(nt, "ShaderNodeBackground", -250, 250, Strength=1.0)
    link(nt, ramp.outputs["Color"], sky.inputs["Color"])

    # Stars: tiny Voronoi dots, only some of them lit, only above the horizon.
    vor = node(nt, "ShaderNodeTexVoronoi", -800, -150, Scale=160.0)
    link(nt, coords.outputs["Generated"], vor.inputs["Vector"])
    dot = node(nt, "ShaderNodeMapRange", -580, -100)
    dot.inputs["From Max"].default_value = 0.09
    dot.inputs["To Min"].default_value = 1.0
    dot.inputs["To Max"].default_value = 0.0
    link(nt, vor.outputs["Distance"], dot.inputs["Value"])
    lucky = node(nt, "ShaderNodeMath", -580, -300)
    lucky.operation = "GREATER_THAN"
    lucky.inputs[1].default_value = 0.62
    link(nt, vor.outputs["Color"], lucky.inputs[0])
    above = node(nt, "ShaderNodeMapRange", -580, -480)
    above.inputs["From Min"].default_value = 0.04
    above.inputs["From Max"].default_value = 0.3
    link(nt, xyz.outputs["Z"], above.inputs["Value"])
    m1 = node(nt, "ShaderNodeMath", -380, -150)
    m1.operation = "MULTIPLY"
    link(nt, dot.outputs["Result"], m1.inputs[0])
    link(nt, lucky.outputs[0], m1.inputs[1])
    m2 = node(nt, "ShaderNodeMath", -220, -150)
    m2.operation = "MULTIPLY"
    link(nt, m1.outputs[0], m2.inputs[0])
    link(nt, above.outputs["Result"], m2.inputs[1])
    m3 = node(nt, "ShaderNodeMath", -60, -150)
    m3.operation = "MULTIPLY"
    m3.inputs[1].default_value = 6.0
    link(nt, m2.outputs[0], m3.inputs[0])
    stars = node(nt, "ShaderNodeBackground", 120, -150)
    stars.inputs["Color"].default_value = (0.85, 0.9, 1.0, 1.0)
    link(nt, m3.outputs[0], stars.inputs["Strength"])

    add = node(nt, "ShaderNodeAddShader", 300, 100)
    link(nt, sky.outputs[0], add.inputs[0])
    link(nt, stars.outputs[0], add.inputs[1])
    out = node(nt, "ShaderNodeOutputWorld", 500, 100)
    link(nt, add.outputs[0], out.inputs["Surface"])


# ---------------------------------------------------------------------------
# Stage: neon grid floor, striped sunset, wireframe mountains
# ---------------------------------------------------------------------------

def build_floor(coll):
    size = 130
    me = mesh_from_data("Neon Grid", [(-size, -size, 0), (size, -size, 0), (size, size, 0),
                                      (-size, size, 0)], [(0, 1, 2, 3)])
    floor = add_object("Neon Grid", me, coll)

    mat, nt, bsdf = principled("Neon Grid", "#07030f", roughness=0.22)
    set_in(bsdf, "Specular IOR Level", 0.35)
    me.materials.append(mat)
    tex = node(nt, "ShaderNodeTexCoord", -1300, 0)
    bricks = node(nt, "ShaderNodeTexBrick", -1000, 200, Scale=0.5, Mortar_Size=0.035,
                  Mortar_Smooth=0.35, Brick_Width=1.0, Row_Height=1.0)
    bricks.offset = 0.0
    bricks.squash = 1.0
    link(nt, tex.outputs["Object"], bricks.inputs["Vector"])

    dist = node(nt, "ShaderNodeVectorMath", -1000, -200)
    dist.operation = "LENGTH"
    link(nt, tex.outputs["Object"], dist.inputs[0])
    fade = node(nt, "ShaderNodeMapRange", -780, -200)
    fade.inputs["From Min"].default_value = 18.0
    fade.inputs["From Max"].default_value = 110.0
    fade.inputs["To Min"].default_value = 1.0
    fade.inputs["To Max"].default_value = 0.0
    link(nt, dist.outputs["Value"], fade.inputs["Value"])

    hue = node(nt, "ShaderNodeMapRange", -780, -450)
    hue.inputs["From Max"].default_value = 60.0
    link(nt, dist.outputs["Value"], hue.inputs["Value"])
    ramp = node(nt, "ShaderNodeValToRGB", -560, -450)
    ramp.color_ramp.elements[0].color = rgb(CYAN)
    ramp.color_ramp.elements[1].color = rgb(PINK)
    link(nt, hue.outputs["Result"], ramp.inputs["Fac"])
    link(nt, ramp.outputs["Color"], bsdf.inputs["Emission Color"])

    lines = node(nt, "ShaderNodeMath", -560, 100)
    lines.operation = "MULTIPLY"
    link(nt, bricks.outputs["Fac"], lines.inputs[0])
    link(nt, fade.outputs["Result"], lines.inputs[1])
    # A single "Pulse" value drives the grid brightness so it can flash on the landing.
    pulse = node(nt, "ShaderNodeValue", -560, -100)
    pulse.name = pulse.label = "Pulse"
    strength = node(nt, "ShaderNodeMath", -300, 0)
    strength.operation = "MULTIPLY"
    link(nt, lines.outputs[0], strength.inputs[0])
    link(nt, pulse.outputs[0], strength.inputs[1])
    link(nt, strength.outputs[0], bsdf.inputs["Emission Strength"])

    out = pulse.outputs[0]
    for frame, value in ((1, 3.0), (LAND - 1, 3.0), (LAND, 8.0), (LAND + 14, 3.0),
                         (FRAME_END, 3.0)):
        out.default_value = value
        out.keyframe_insert("default_value", frame=frame)

    # Confetti bounces off the floor.
    floor.modifiers.new("Collision", "COLLISION")
    floor.collision.damping_factor = 0.6
    floor.collision.friction_factor = 0.8
    return floor


def build_sun(coll):
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=128, radius=17)
    sun = add_object("Sunset", mesh_from_bmesh("Sunset", bm, smooth_shade=False), coll,
                     location=(0, 100, 6.5), rotation=(math.radians(90), 0, 0))

    mat, nt, out = new_material("Sunset")
    for attr, value in (("surface_render_method", "DITHERED"), ("blend_method", "HASHED")):
        if hasattr(mat, attr):
            setattr(mat, attr, value)
    tex = node(nt, "ShaderNodeTexCoord", -1100, 0)
    xyz = node(nt, "ShaderNodeSeparateXYZ", -900, 0)
    link(nt, tex.outputs["Generated"], xyz.inputs[0])

    ramp = node(nt, "ShaderNodeValToRGB", -650, 200)
    ramp.color_ramp.elements[0].color = rgb(PINK)
    ramp.color_ramp.elements[1].color = rgb(YELLOW)
    ramp.color_ramp.elements.new(0.6).color = rgb(ORANGE)
    ramp.color_ramp.elements[0].position = 0.32
    ramp.color_ramp.elements[1].position = 0.95
    link(nt, xyz.outputs["Y"], ramp.inputs["Fac"])
    em = node(nt, "ShaderNodeEmission", -350, 200, Strength=1.8)
    link(nt, ramp.outputs["Color"], em.inputs["Color"])

    # The classic retro stripes: gaps that get fatter toward the bottom.
    bands = node(nt, "ShaderNodeMath", -650, -100)
    bands.operation = "MULTIPLY"
    bands.inputs[1].default_value = 16.0
    link(nt, xyz.outputs["Y"], bands.inputs[0])
    frac = node(nt, "ShaderNodeMath", -480, -100)
    frac.operation = "FRACT"
    link(nt, bands.outputs[0], frac.inputs[0])
    width = node(nt, "ShaderNodeMapRange", -650, -300)
    width.inputs["From Min"].default_value = 0.72
    width.inputs["From Max"].default_value = 0.3
    width.inputs["To Max"].default_value = 0.75
    link(nt, xyz.outputs["Y"], width.inputs["Value"])
    gap = node(nt, "ShaderNodeMath", -300, -150)
    gap.operation = "LESS_THAN"
    link(nt, frac.outputs[0], gap.inputs[0])
    link(nt, width.outputs["Result"], gap.inputs[1])

    clear = node(nt, "ShaderNodeBsdfTransparent", -300, -350)
    mix = node(nt, "ShaderNodeMixShader", 200, 0)
    link(nt, gap.outputs[0], mix.inputs[0])
    link(nt, em.outputs[0], mix.inputs[1])
    link(nt, clear.outputs[0], mix.inputs[2])
    link(nt, mix.outputs[0], out.inputs["Surface"])
    sun.data.materials.append(mat)
    return sun


def build_mountains(coll):
    nx, ny = 72, 14
    x0, x1, y0, y1 = -110.0, 110.0, 52.0, 82.0
    verts, faces = [], []
    for j in range(ny + 1):
        v = j / ny
        for i in range(nx + 1):
            x = lerp(x0, x1, i / nx)
            y = lerp(y0, y1, v)
            valley = smooth((abs(x) - 9) / 30)       # keep the middle open for the sun
            ridge = math.sin(math.pi * v) ** 0.8     # zero at the front and back edges
            bumps = 0.55 + 0.45 * noise.noise(Vector((x * 0.045, y * 0.06, 3.1)))
            jag = 0.25 * noise.noise(Vector((x * 0.21, y * 0.21, 8.7)))
            z = max(0.0, valley * ridge * (bumps + jag) * 22.0)
            verts.append((x, y, z))
    for j in range(ny):
        for i in range(nx):
            a = j * (nx + 1) + i
            faces.append((a, a + 1, a + nx + 2, a + nx + 1))
    me = mesh_from_data("Mountains", verts, faces)
    mountains = add_object("Mountains", me, coll)

    body, _, _ = principled("Mountain Body", "#0a0314", roughness=0.8)
    wire, _ = glow("Mountain Neon", PINK, 6.0)
    me.materials.append(body)
    me.materials.append(wire)
    mod = mountains.modifiers.new("Neon Wire", "WIREFRAME")
    mod.thickness = 0.16
    mod.use_replace = False
    mod.use_even_offset = True
    mod.material_offset = 1
    return mountains


# ---------------------------------------------------------------------------
# The hero
# ---------------------------------------------------------------------------

def hero_pose(f):
    """(height, pitch, stretch, bulk) of the hero at frame f.

    stretch squashes/stretches along Z while preserving volume, bulk scales
    uniformly (the tuck).  Keeping the whole stunt in one function makes the
    timing easy to play with.
    """
    crouch, launch, takeoff = 16, 30, 34
    apex_height = 4.3
    if f < crouch or f >= 100:                     # idle breathing, loops through f=120
        p = ((f - 100) % FRAME_END) / 36
        s = 1 + 0.035 * math.sin(TAU * 2 * p)
        return s, 0.0, s, 1.0
    if f < launch:                                 # anticipation: crouch and lean in
        t = smooth((f - crouch) / (launch - crouch))
        s = 1 - 0.4 * t
        return s, 0.14 * t, s, 1.0
    if f < takeoff:                                # explode upward
        e = ease_out((f - launch) / (takeoff - launch))
        s = lerp(0.6, 1.35, e)
        return s, lerp(0.14, 0.0, e), s, 1.0
    if f < LAND:                                   # airborne: parabola + full backward rotation
        t = (f - takeoff) / (LAND - takeoff)
        height = lerp(1.35, 1.18, t) + 4 * apex_height * t * (1 - t)
        pitch = -TAU * (0.5 - 0.5 * math.cos(math.pi * t))
        if t < 0.22:
            k = smooth(t / 0.22)
            stretch, bulk = lerp(1.35, 1.0, k), lerp(1.0, 0.86, k)
        elif t < 0.75:
            stretch, bulk = 1.0, 0.86
        else:
            k = smooth((t - 0.75) / 0.25)
            stretch, bulk = lerp(1.0, 1.18, k), lerp(0.86, 1.0, k)
        return height, pitch, stretch, bulk
    if f < LAND + 6:                               # SLAM: squash into the floor
        s = lerp(1.18, 0.55, ease_out((f - LAND) / 6))
        return s, -TAU, s, 1.0
    tau = f - (LAND + 6)                           # jelly wobble back to rest
    s = 1 - 0.45 * math.exp(-0.17 * tau) * math.cos(0.55 * tau)
    return s, -TAU, s, 1.0


def build_hero(coll):
    bm = bmesh.new()
    rounded_cube(bm, 1.0, 0.32, 8)
    hero = add_object("Cubey", mesh_from_bmesh("Cubey", bm), coll)
    body, _, _ = principled("Cubey Candy", GOLD, roughness=0.22, coat=1.0, thin_film=90.0)
    hero.data.materials.append(body)

    ink, _, _ = principled("Cubey Ink", "#050308", roughness=0.12, coat=1.0)
    shine, _ = glow("Eye Shine", "#ffffff", 8.0)
    blush_mat, _, _ = principled("Blush", PINK, roughness=0.5, emission=PINK,
                                 emission_strength=0.6)

    eyes = []
    for side in (-1, 1):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=14, radius=0.17)
        eye = add_object("Eye.L" if side < 0 else "Eye.R", mesh_from_bmesh("Eye", bm), coll,
                         location=(0.36 * side, -1.0, 0.25), scale=(1.0, 0.5, 1.3))
        eye.data.materials.append(ink)
        eye.parent = hero
        eyes.append(eye)

        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.045)
        spark = add_object("Eye Shine", mesh_from_bmesh("Eye Shine", bm), coll,
                           location=(0.06, -0.16, 0.07))
        spark.data.materials.append(shine)
        spark.parent = eye

        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=0.12)
        cheek = add_object("Blush", mesh_from_bmesh("Blush", bm), coll,
                           location=(0.64 * side, -0.99, -0.06), scale=(1.3, 0.25, 0.7))
        cheek.data.materials.append(blush_mat)
        cheek.parent = hero

    cu = bpy.data.curves.new("Smile", "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = 0.035
    cu.bevel_resolution = 4
    cu.resolution_u = 16
    spline = cu.splines.new("NURBS")
    pts = [(-0.2, 0, 0.05), (-0.08, 0, -0.08), (0.08, 0, -0.08), (0.2, 0, 0.05)]
    spline.points.add(len(pts) - 1)
    for p, co in zip(spline.points, pts):
        p.co = (*co, 1.0)
    spline.order_u = 3
    spline.use_endpoint_u = True
    smile = add_object("Smile", cu, coll, location=(0, -1.0, -0.2))
    cu.materials.append(ink)
    smile.parent = hero

    # The stunt, baked one key per frame so it's visible (and tweakable) in the Graph Editor.
    for f in range(1, FRAME_END + 1):
        height, pitch, stretch, bulk = hero_pose(f)
        side = bulk / math.sqrt(stretch)
        key(hero, "location", f, height * bulk, index=2)
        key(hero, "rotation_euler", f, pitch, index=0)
        key(hero, "scale", f, side, index=0)
        key(hero, "scale", f, side, index=1)
        key(hero, "scale", f, stretch * bulk, index=2)
    hero.rotation_euler[2] = HERO_YAW

    # Blink, squeeze the eyes shut mid-flip, then happy ^_^ eyes after sticking it.
    for frame, openness in ((1, 1.0), (6, 1.0), (8, 0.1), (10, 1.0), (36, 1.0), (42, 0.45),
                            (60, 0.45), (66, 1.0), (LAND + 1, 1.0), (LAND + 4, 0.22),
                            (96, 0.22), (101, 1.0), (FRAME_END, 1.0)):
        for eye in eyes:
            key(eye, "scale", frame, 1.3 * openness, index=2)
    return hero


# ---------------------------------------------------------------------------
# The crowd: a ring of mini cubes doing the wave, then going wild on the landing
# ---------------------------------------------------------------------------

def build_crowd(coll):
    half = 0.38
    bm = bmesh.new()
    rounded_cube(bm, half, 0.13, 4)
    for side in (-1, 1):
        add_sphere(bm, 0.07, Matrix.Translation((0.14 * side, -half, 0.1)) @
                   Matrix.Diagonal((1.0, 0.5, 1.3, 1.0)), material_index=1)
    me = mesh_from_bmesh("Mini Cube", bm)

    body, nt, bsdf = principled("Crowd Candy", "#ffffff", roughness=0.3, coat=1.0)
    info = node(nt, "ShaderNodeObjectInfo", -500, 0)
    link(nt, info.outputs["Color"], bsdf.inputs["Base Color"])
    link(nt, info.outputs["Color"], bsdf.inputs["Emission Color"])
    hype = node(nt, "ShaderNodeMath", -250, -200)
    hype.operation = "MULTIPLY_ADD"
    hype.inputs[1].default_value = 2.5
    hype.inputs[2].default_value = 0.35
    link(nt, info.outputs["Alpha"], hype.inputs[0])
    link(nt, hype.outputs[0], bsdf.inputs["Emission Strength"])
    ink = bpy.data.materials.get("Cubey Ink")
    me.materials.append(body)
    me.materials.append(ink)

    palette = [PINK, CYAN, YELLOW, LIME, ORANGE, VIOLET]
    count, radius = 15, 7.0
    a0, a1 = math.radians(-18), math.radians(198)
    mid = (count - 1) / 2
    for i in range(count):
        a = lerp(a0, a1, i / (count - 1))
        yaw = a - math.pi / 2                      # face the hero
        ob = add_object(f"Fan.{i:02d}", me, coll,
                        location=(radius * math.cos(a), radius * math.sin(a), half),
                        rotation=(0, 0, yaw))
        ob.color = rgb(palette[i % len(palette)], alpha=0.0)

        wave = f"{0.45:.2f}*max(0, sin(frame*{TAU / 40:.5f} - {i * 0.55:.3f}))"
        cheer_at = LAND + 7 + abs(i - mid) * 1.3   # the celebration ripples outward
        jump = f"1.6*max(0, 1 - (frame - {cheer_at:.1f})*(frame - {cheer_at:.1f})/81)"
        drive(ob, "location", 2, f"{half} + {wave} + {jump}")
        spin = f"{TAU:.5f}*min(1, max(0, (frame - {cheer_at - 8:.1f})/16))"
        drive(ob, "rotation_euler", 2, f"{yaw:.5f} + {spin}")
        drive(ob, "color", 3,
              f"max(0, 1 - (frame - {cheer_at:.1f})*(frame - {cheer_at:.1f})/260)")


# ---------------------------------------------------------------------------
# FX: confetti cannon, shockwave, title card
# ---------------------------------------------------------------------------

def build_fx(coll, camera):
    # Confetti pieces live in their own (unlinked) collection used for instancing.
    confetti = bpy.data.collections.new("Confetti Pieces")
    w, h = 0.12, 0.065
    for i, col in enumerate([PINK, CYAN, YELLOW, LIME, ORANGE, VIOLET, "#ffffff"]):
        me = mesh_from_data(f"Confetti.{i}", [(-w, -h, 0), (w, -h, 0), (w, h, 0), (-w, h, 0)],
                            [(0, 1, 2, 3)])
        mat, _, _ = principled(f"Confetti.{i}", col, roughness=0.4, emission=col,
                               emission_strength=1.5)
        me.materials.append(mat)
        piece = bpy.data.objects.new(f"Confetti.{i}", me)
        confetti.objects.link(piece)

    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=32, radius=1.3)
    emitter = add_object("Confetti Cannon", mesh_from_bmesh("Confetti Cannon", bm), coll,
                         location=(0, 0, 0.15))
    emitter.show_instancer_for_render = False
    emitter.show_instancer_for_viewport = False
    emitter.modifiers.new("Confetti", "PARTICLE_SYSTEM")
    psys = emitter.particle_systems[0]
    psys.seed = SEED
    ps = psys.settings
    ps.name = "Confetti"
    ps.count = 900
    ps.frame_start = LAND
    ps.frame_end = LAND + 4
    ps.lifetime = 44
    ps.lifetime_random = 0.35
    ps.emit_from = "FACE"
    ps.normal_factor = 11.0
    ps.factor_random = 5.0
    ps.drag_factor = 0.45
    ps.brownian_factor = 1.2
    ps.effector_weights.gravity = 0.55
    ps.use_rotations = True
    ps.rotation_factor_random = 1.0
    ps.phase_factor_random = 2.0
    ps.angular_velocity_mode = "RAND"
    ps.angular_velocity_factor = 14.0
    ps.render_type = "COLLECTION"
    ps.instance_collection = confetti
    ps.use_collection_pick_random = True
    ps.particle_size = 1.0
    ps.size_random = 0.5

    # Shockwave ring that rips across the floor on impact.
    ring = add_object("Shockwave", torus_mesh("Shockwave", 1.0, 0.07), coll,
                      location=(0, 0, 0.04))
    ring_mat, ring_em = glow("Shockwave", CYAN, 0.0)
    ring.data.materials.append(ring_mat)
    for frame, s, glow_strength in ((1, 0.0, 0.0), (LAND - 1, 0.0, 0.0), (LAND, 0.8, 14.0),
                                    (LAND + 22, 13.0, 0.0), (FRAME_END, 13.0, 0.0)):
        key(ring, "scale", frame, s, index=0)
        key(ring, "scale", frame, s, index=1)
        ring_em.inputs["Strength"].default_value = glow_strength
        ring_em.inputs["Strength"].keyframe_insert("default_value", frame=frame)

    # A permanent neon stage ring under the hero.
    stage = add_object("Stage Ring", torus_mesh("Stage Ring", 2.5, 0.05), coll,
                       location=(0, 0, 0.02), scale=(1, 1, 0.4))
    stage.data.materials.append(glow("Stage Ring", PINK, 8.0)[0])

    # Title card that pops when the hero sticks it.
    cu = bpy.data.curves.new("Title", "FONT")
    cu.body = "BACKFLIP!"
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    cu.size = 2.6
    cu.extrude = 0.16
    cu.bevel_depth = 0.035
    cu.bevel_resolution = 3
    cu.space_character = 1.05
    title = add_object("Title", cu, coll, location=(0, 12, 7.8))
    title_mat, _ = glow("Title Neon", CYAN, 3.5)
    cu.materials.append(title_mat)
    track = title.constraints.new("TRACK_TO")
    track.target = camera
    track.track_axis = "TRACK_Z"
    track.up_axis = "UP_Y"
    for frame, s in ((1, 0.0), (LAND + 1, 0.0), (LAND + 7, 1.3), (LAND + 11, 0.92),
                     (LAND + 15, 1.0), (108, 1.0), (113, 1.15), (118, 0.0), (FRAME_END, 0.0)):
        for axis in range(3):
            key(title, "scale", frame, s, index=axis)
    return emitter


# ---------------------------------------------------------------------------
# Lights and camera
# ---------------------------------------------------------------------------

def build_lights(coll):
    rig = [
        ("Key", (-4.0, -6.0, 13.0), "#ffe7d6", 2200, 4.0),
        ("Rim Cyan", (8.0, 7.0, 7.0), CYAN, 3200, 3.0),
        ("Rim Pink", (-8.0, 7.0, 7.0), PINK, 3200, 3.0),
    ]
    for name, loc, col, power, size in rig:
        data = bpy.data.lights.new(name, "AREA")
        data.energy = power
        data.color = rgb(col)[:3]
        data.size = size
        lamp = add_object(name, data, coll, location=loc)
        aim(lamp, (0, 0, 1.5))


def build_camera(coll):
    pivot = add_empty("Camera Orbit", coll, display="CIRCLE", size=2.0)
    # A slow, seamless side-to-side sweep (one full sine per loop).
    drive(pivot, "rotation_euler", 2, f"radians(11)*sin(frame*{TAU / FRAME_END:.6f})")

    target = add_empty("Camera Target", coll, location=(0, 0, 2.2), display="SPHERE", size=0.3)
    data = bpy.data.cameras.new("Camera")
    data.lens = 35
    data.dof.use_dof = True
    data.dof.focus_object = target
    data.dof.aperture_fstop = 2.8
    cam = add_object("Camera", data, coll)
    cam.parent = pivot
    look = cam.constraints.new("TRACK_TO")
    look.target = target
    look.track_axis = "TRACK_NEGATIVE_Z"
    look.up_axis = "UP_Y"

    base = Vector((0.0, -17.0, 3.2))
    rng = random.Random(SEED)
    for f in range(1, FRAME_END + 1):
        height = hero_pose(f)[0]
        key(target, "location", f, 2.2 + 0.35 * (height - 1.0), index=2)
        # Impact shake that dies out fast.
        k = f - LAND
        amp = 0.16 * math.exp(-k / 3.0) if k >= 0 else 0.0
        shake = Vector((amp * math.sin(1.9 * k + rng.random()),
                        0.0,
                        amp * math.cos(2.3 * k + 0.5)))
        loc = base + shake
        for axis in range(3):
            key(cam, "location", f, loc[axis], index=axis)
    return cam


# ---------------------------------------------------------------------------
# Render settings and post
# ---------------------------------------------------------------------------

def setup_render(scene, camera):
    scene.camera = camera
    scene.frame_start = 1
    scene.frame_end = FRAME_END
    scene.render.fps = FPS
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100

    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    eevee = scene.eevee
    for attr, value in (("taa_render_samples", 64), ("use_raytracing", True),
                        ("use_bloom", True), ("use_ssr", True), ("use_gtao", True)):
        if hasattr(eevee, attr):
            setattr(eevee, attr, value)
    if hasattr(scene, "cycles"):
        scene.cycles.samples = 128
        scene.cycles.use_denoising = True

    view = scene.view_settings
    try:
        view.view_transform = "AgX"
        for look in ("AgX - Punchy", "Punchy"):
            try:
                view.look = look
                break
            except TypeError:
                continue
    except TypeError:
        pass

    # Next to the .blend if it's saved, otherwise in the home folder.
    folder = "//" if bpy.data.filepath else os.path.expanduser("~") + os.sep
    scene.render.filepath = folder + "backflip_"
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


def setup_compositor(scene):
    """Bloom + a touch of chromatic aberration, for that neon smear."""
    if hasattr(scene, "compositing_node_group"):          # Blender 5.0+
        tree = bpy.data.node_groups.new("BACKFLIP Post", "CompositorNodeTree")
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
    out.location = (900, 0)

    layers = tree.nodes.new("CompositorNodeRLayers")
    layers.scene = scene
    layers.location = (0, 0)

    bloom = tree.nodes.new("CompositorNodeGlare")
    bloom.location = (300, 0)
    set_prop_or_input(bloom, "glare_type", "Type", "BLOOM", "Bloom")
    set_prop_or_input(bloom, "quality", "Quality", "HIGH", "High")
    set_prop_or_input(bloom, "threshold", "Threshold", 0.9, 0.9)
    set_prop_or_input(bloom, "mix", "Strength", 0.0, 0.8)
    set_prop_or_input(bloom, "size", "Size", 8, 0.6)

    lens = tree.nodes.new("CompositorNodeLensdist")
    lens.location = (600, 0)
    for name in ("Dispersion",):
        set_in(lens, name, 0.012)

    tree.links.new(layers.outputs["Image"], bloom.inputs["Image"])
    tree.links.new(bloom.outputs["Image"], lens.inputs["Image"])
    tree.links.new(lens.outputs["Image"], out_socket)
    scene.render.use_compositing = True


def show_off(scene):
    """When run from the UI: camera view, rendered shading, and hit play."""
    scene.frame_set(1)
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
        if not context.screen.is_animation_playing:
            with context.temp_override(window=window, area=area):
                bpy.ops.screen.animation_play()

    def draw(self, _context):
        self.layout.label(text="Space: play / pause    Ctrl+F12: render the MP4")
    context.window_manager.popup_menu(draw, title="BACKFLIP loaded. Stick the landing.",
                                      icon="SOLO_ON")


def main():
    scene = fresh_scene()
    stage = make_collection(scene, "Stage")
    cast = make_collection(scene, "Cubey")
    crowd = make_collection(scene, "Crowd")
    fx = make_collection(scene, "FX")
    rig = make_collection(scene, "Camera + Lights")

    build_world(scene)
    build_floor(stage)
    build_sun(stage)
    build_mountains(stage)
    build_hero(cast)
    build_crowd(crowd)
    build_lights(rig)
    camera = build_camera(rig)
    build_fx(fx, camera)
    setup_render(scene, camera)
    setup_compositor(scene)
    show_off(scene)
    print(f"[BACKFLIP] Scene built in Blender {bpy.app.version_string}. Press Space.")
    return scene


if __name__ == "__main__":
    main()
