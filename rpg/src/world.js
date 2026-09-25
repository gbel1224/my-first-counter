// Builds the valley: sky, light, water, grass, forests, the village, the ruins and the shrine.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mulberry32, fbm, smoothstep, clamp } from './noise.js';
import {
  WORLD, ZONES, PLAY_RADIUS, WATER_LEVEL, buildTerrain, terrainTextures, heightAt, normalAt, pathDistance,
} from './terrain.js';

const HEX = 6;              // KayKit hex-pack models are miniature; scale to character size

// ---------------------------------------------------------------------------
// Colliders (2D circles + wall segments on the XZ plane)
// ---------------------------------------------------------------------------
export class Colliders {
  constructor() {
    this.circles = [];
    this.segments = [];
  }

  circle(x, z, r) {
    this.circles.push({ x, z, r });
  }

  wall(ax, az, bx, bz, r = 0.6) {
    this.segments.push({ ax, az, bx, bz, r });
  }

  // Push a point (Vector3, uses x/z) out of every obstacle. Returns true if it hit something.
  resolve(p, radius) {
    let hit = false;
    for (const c of this.circles) {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const min = c.r + radius;
      if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 0.0001;
        p.x = c.x + (dx / d) * min;
        p.z = c.z + (dz / d) * min;
        hit = true;
      }
    }
    for (const s of this.segments) {
      const vx = s.bx - s.ax;
      const vz = s.bz - s.az;
      const l2 = vx * vx + vz * vz;
      const t = clamp(((p.x - s.ax) * vx + (p.z - s.az) * vz) / l2, 0, 1);
      const cx = s.ax + vx * t;
      const cz = s.az + vz * t;
      const dx = p.x - cx;
      const dz = p.z - cz;
      const min = s.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 0.0001;
        p.x = cx + (dx / d) * min;
        p.z = cz + (dz / d) * min;
        hit = true;
      }
    }
    const r = Math.hypot(p.x, p.z);
    if (r > PLAY_RADIUS - radius) {
      p.x *= (PLAY_RADIUS - radius) / r;
      p.z *= (PLAY_RADIUS - radius) / r;
      hit = true;
    }
    if (heightAt(p.x, p.z) < WATER_LEVEL - 0.7) hit = true;   // caller treats deep water as a wall
    return hit;
  }
}

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------
export class World {
  constructor(scene, renderer, assets, quality) {
    this.scene = scene;
    this.renderer = renderer;
    this.assets = assets;
    this.quality = quality;
    this.colliders = new Colliders();
    this.time = 0;
    this.torches = [];
    this.animated = [];       // things with update(dt, t)
    this.windUniforms = { uTime: { value: 0 } };
    this.markers = { npcs: [], spawns: [] };
    this.rand = mulberry32(7);
  }

  build() {
    this.buildSky();
    this.terrain = buildTerrain();
    this.scene.add(this.terrain);
    this.textures = terrainTextures();
    this.buildWater();
    this.buildGrass();
    this.buildMountains();
    this.buildForest();
    this.buildVillage();
    this.buildRuins();
    this.buildShrine();
    this.buildClouds();
    this.buildMotes();
  }

  // ----- Sky, sun, fog --------------------------------------------------------
  buildSky() {
    const sky = new Sky();
    sky.scale.setScalar(4000);
    const u = sky.material.uniforms;
    u.turbidity.value = 7;
    u.rayleigh.value = 2.2;
    u.mieCoefficient.value = 0.006;
    u.mieDirectionalG.value = 0.86;
    const elevation = THREE.MathUtils.degToRad(11);
    const azimuth = THREE.MathUtils.degToRad(215);
    this.sunDir = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - elevation, azimuth);
    u.sunPosition.value.copy(this.sunDir);
    this.scene.add(sky);
    this.sky = sky;

    // Image-based lighting from the same sky.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const skyScene = new THREE.Scene();
    const skyCopy = new Sky();
    skyCopy.scale.setScalar(4000);
    Object.assign(skyCopy.material.uniforms, THREE.UniformsUtils.clone(u));
    skyCopy.material.uniforms.sunPosition.value.copy(this.sunDir);
    skyScene.add(skyCopy);
    this.scene.environment = pmrem.fromScene(skyScene, 0.04).texture;
    this.scene.environmentIntensity = 0.55;

    this.scene.fog = new THREE.FogExp2(new THREE.Color('#d69a86'), 0.0029);

    const sun = new THREE.DirectionalLight(new THREE.Color('#ffd2a1'), 3.1);
    sun.position.copy(this.sunDir).multiplyScalar(80);
    sun.castShadow = this.quality !== 'low';
    const size = this.quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(size, size);
    const cam = sun.shadow.camera;
    cam.left = cam.bottom = -38;
    cam.right = cam.top = 38;
    cam.near = 1;
    cam.far = 220;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.05;
    this.scene.add(sun, sun.target);
    this.sun = sun;

    const hemi = new THREE.HemisphereLight(new THREE.Color('#9fb8e6'), new THREE.Color('#5b4a33'), 1.15);
    this.scene.add(hemi);
  }

  followShadow(target) {
    const snap = 2;
    const x = Math.round(target.x / snap) * snap;
    const z = Math.round(target.z / snap) * snap;
    this.sun.target.position.set(x, target.y, z);
    this.sun.position.set(x, target.y, z).addScaledVector(this.sunDir, 100);
  }

  // ----- Water ----------------------------------------------------------------
  buildWater() {
    const { hTex, size, world } = this.textures;
    const lake = ZONES.lake;
    const geo = new THREE.PlaneGeometry(110, 110, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 },
        uHeight: { value: hTex },
        uSize: { value: size },
        uWorld: { value: world },
        uSun: { value: this.sunDir.clone() },
        uDeep: { value: new THREE.Color('#1d4a52') },
        uShallow: { value: new THREE.Color('#5fa39a') },
        uSky: { value: new THREE.Color('#e7b99a') },
      }]),
      vertexShader: /* glsl */`
        varying vec3 vWorld;
        #include <fog_pars_vertex>
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uSize, uWorld;
        uniform sampler2D uHeight;
        uniform vec3 uSun, uDeep, uShallow, uSky;
        varying vec3 vWorld;
        #include <fog_pars_fragment>
        float hAt(vec2 xz) {
          vec2 g = (xz + uWorld * 0.5) / uWorld * (uSize - 1.0);
          vec2 i = floor(g); vec2 f = g - i;
          float a = texelFetch(uHeight, ivec2(i), 0).r;
          float b = texelFetch(uHeight, ivec2(i) + ivec2(1, 0), 0).r;
          float c = texelFetch(uHeight, ivec2(i) + ivec2(0, 1), 0).r;
          float d = texelFetch(uHeight, ivec2(i) + ivec2(1, 1), 0).r;
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        float wave(vec2 p) {
          return sin(p.x * 0.9 + uTime * 1.3) * 0.5 + sin(p.y * 1.3 - uTime * 1.1) * 0.35
               + sin((p.x + p.y) * 2.3 + uTime * 2.0) * 0.15;
        }
        void main() {
          float depth = -hAt(vWorld.xz);
          if (depth < -0.05) discard;
          vec2 p = vWorld.xz;
          float e = 0.15;
          vec3 n = normalize(vec3(wave(p) - wave(p + vec2(e, 0.0)), 5.0, wave(p) - wave(p + vec2(0.0, e))));
          vec3 v = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 2.8, depth));
          col = mix(col, uSky, clamp(fres * 0.85, 0.0, 1.0));
          vec3 h = normalize(uSun + v);
          col += vec3(1.0, 0.82, 0.6) * pow(max(dot(n, h), 0.0), 180.0) * 2.5;
          float foam = smoothstep(0.35, 0.0, depth) * (0.6 + 0.4 * sin(depth * 30.0 - uTime * 2.5));
          col = mix(col, vec3(0.95, 0.92, 0.85), clamp(foam, 0.0, 1.0) * 0.8);
          float alpha = clamp(0.55 + depth * 0.25 + fres * 0.3 + foam, 0.0, 0.95);
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    const water = new THREE.Mesh(geo, mat);
    water.position.set(lake.x, WATER_LEVEL, lake.z);
    water.renderOrder = 1;
    this.scene.add(water);
    this.water = water;
    this.animated.push({ update: (dt, t) => { mat.uniforms.uTime.value = t; } });

    // Lily pads.
    for (let i = 0; i < 26; i++) {
      const a = this.rand() * Math.PI * 2;
      const r = 6 + this.rand() * 18;
      const x = lake.x + Math.cos(a) * r;
      const z = lake.z + Math.sin(a) * r;
      if (heightAt(x, z) > -0.4) continue;
      const lily = this.assets.prop(this.rand() > 0.3 ? 'waterlily_A' : 'waterplant_A');
      lily.scale.setScalar(HEX * (0.8 + this.rand() * 0.6));
      lily.position.set(x, WATER_LEVEL + 0.02, z);
      lily.rotation.y = this.rand() * 6.28;
      this.scene.add(lily);
    }
  }

  // ----- Grass: a dense patch that travels with the camera ---------------------
  buildGrass() {
    const { hTex, gTex, size, world } = this.textures;
    // Built once at full size; the quality setting chooses how many blades draw.
    const count = 130000;
    const patch = 60;

    const blade = new THREE.BufferGeometry();
    // A tapered blade: 3 segments, 7 vertices, bent at runtime.
    const verts = [];
    const uvs = [];
    const segs = 3;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const w = 0.07 * (1 - t * 0.85);
      if (i < segs) {
        verts.push(-w, t, 0, w, t, 0);
        uvs.push(0, t, 1, t);
      } else {
        verts.push(0, 1, 0);
        uvs.push(0.5, 1);
      }
    }
    const idx = [];
    for (let i = 0; i < segs - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    const last = (segs - 1) * 2;
    idx.push(last, last + 1, last + 2);
    blade.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    blade.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    blade.setIndex(idx);

    const geo = new THREE.InstancedBufferGeometry();
    geo.index = blade.index;
    geo.attributes.position = blade.attributes.position;
    geo.attributes.uv = blade.attributes.uv;
    const offsets = new Float32Array(count * 4);
    const rand = mulberry32(99);
    for (let i = 0; i < count; i++) {
      offsets[i * 4] = rand() * patch;
      offsets[i * 4 + 1] = rand() * patch;
      offsets[i * 4 + 2] = rand() * Math.PI * 2;
      offsets[i * 4 + 3] = rand();
    }
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 4));
    geo.instanceCount = count;

    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: this.windUniforms.uTime,
        uHeight: { value: hTex },
        uMask: { value: gTex },
        uSize: { value: size },
        uWorld: { value: world },
        uPatch: { value: patch },
        uCenter: { value: new THREE.Vector2() },
        uPlayer: { value: new THREE.Vector3(0, -100, 0) },
        uSun: { value: this.sunDir.clone() },
        uRoot: { value: new THREE.Color('#2f5a1f') },
        uTip: { value: new THREE.Color('#b5c464') },
        uDry: { value: new THREE.Color('#c9b56a') },
      }]),
      vertexShader: /* glsl */`
        attribute vec4 aOffset;
        uniform float uTime, uSize, uWorld, uPatch;
        uniform sampler2D uHeight, uMask;
        uniform vec2 uCenter;
        uniform vec3 uPlayer;
        varying float vT;
        varying float vDry;
        varying float vShade;
        #include <fog_pars_vertex>
        float hAt(vec2 xz) {
          vec2 g = clamp((xz + uWorld * 0.5) / uWorld * (uSize - 1.0), vec2(0.0), vec2(uSize - 2.0));
          vec2 i = floor(g); vec2 f = g - i;
          float a = texelFetch(uHeight, ivec2(i), 0).r;
          float b = texelFetch(uHeight, ivec2(i) + ivec2(1, 0), 0).r;
          float c = texelFetch(uHeight, ivec2(i) + ivec2(0, 1), 0).r;
          float d = texelFetch(uHeight, ivec2(i) + ivec2(1, 1), 0).r;
          if (f.x + f.y <= 1.0) return a + (b - a) * f.x + (c - a) * f.y;
          return d + (c - d) * (1.0 - f.x) + (b - d) * (1.0 - f.y);
        }
        void main() {
          // Wrap this blade's patch position to the copy nearest the camera.
          vec2 base = aOffset.xy + floor((uCenter - aOffset.xy) / uPatch + 0.5) * uPatch;
          vec2 muv = (base + uWorld * 0.5) / uWorld;
          float density = texture2D(uMask, muv).r;
          float dist = distance(base, uCenter);
          float keep = step(aOffset.w, density * 1.15) * (1.0 - smoothstep(uPatch * 0.36, uPatch * 0.5, dist));
          float height = (0.32 + aOffset.w * 0.5) * (0.5 + density * 0.55) * keep;
          vec3 p = position;
          vT = uv.y;
          float s = sin(aOffset.z), c = cos(aOffset.z);
          p.xz = mat2(c, -s, s, c) * p.xz;
          p.y *= height;
          p.x *= 0.8 + height * 0.5;
          vec3 world = vec3(base.x, hAt(base), base.y) + p;
          // Wind: slow gusts + fast flutter, stronger toward the tip.
          float gust = sin(uTime * 0.9 + base.x * 0.07 + base.y * 0.05) * 0.5 + 0.5;
          float flutter = sin(uTime * 3.1 + aOffset.z * 5.0 + base.x * 0.6);
          float bend = vT * vT * (0.25 + gust * 0.35 + flutter * 0.08);
          world.x += bend * 0.9;
          world.z += bend * 0.35;
          // Part around the player.
          vec2 away = world.xz - uPlayer.xz;
          float push = (1.0 - smoothstep(0.0, 1.4, length(away))) * vT;
          world.xz += normalize(away + 0.0001) * push * 0.6;
          world.y -= push * 0.25;
          vDry = smoothstep(0.55, 0.95, fract(aOffset.w * 7.13)) * 0.6;
          vShade = 0.75 + gust * 0.25;
          vec4 mvPosition = viewMatrix * vec4(world, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uRoot, uTip, uDry, uSun;
        varying float vT;
        varying float vDry;
        varying float vShade;
        #include <fog_pars_fragment>
        void main() {
          vec3 tip = mix(uTip, uDry, vDry);
          vec3 col = mix(uRoot, tip, vT) * vShade;
          col *= 0.55 + 0.45 * max(uSun.y * 3.0, 0.25) + vT * 0.25;
          gl_FragColor = vec4(col * 0.78, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    const grass = new THREE.Mesh(geo, mat);
    grass.frustumCulled = false;
    this.scene.add(grass);
    this.grass = grass;
  }

  updateGrass(camera, player) {
    if (!this.grass) return;
    const u = this.grass.material.uniforms;
    // Center the patch a little ahead of the camera, where the eye is looking.
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    u.uCenter.value.set(camera.position.x + dir.x * 14, camera.position.z + dir.z * 14);
    u.uPlayer.value.copy(player);
  }

  // ----- Instanced scatter ------------------------------------------------------
  instanced(propName, transforms, { sway = 0, shadow = true } = {}) {
    if (!transforms.length) return;
    for (const part of this.assets.propMeshes(propName)) {
      let material = part.material;
      if (sway) {
        material = material.clone();
        const wind = this.windUniforms;
        material.onBeforeCompile = (shader) => {
          shader.uniforms.uTime = wind.uTime;
          shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `
            #include <begin_vertex>
            #ifdef USE_INSTANCING
              vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
            #else
              vec3 ip = vec3(0.0);
            #endif
            float sw = sin(uTime * 1.2 + ip.x * 0.15 + ip.z * 0.11) + 0.4 * sin(uTime * 2.7 + ip.x);
            transformed.x += sw * ${sway.toFixed(3)} * max(position.y, 0.0);
            transformed.z += sw * ${(sway * 0.5).toFixed(3)} * max(position.y, 0.0);
          `);
        };
      }
      const mesh = new THREE.InstancedMesh(part.geometry, material, transforms.length);
      const m = new THREE.Matrix4();
      transforms.forEach((t, i) => mesh.setMatrixAt(i, m.multiplyMatrices(t, part.matrix)));
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.scene.add(mesh);
    }
  }

  place(obj, x, z, { rot = 0, scale = 1, y = null, sink = 0 } = {}) {
    obj.position.set(x, (y ?? heightAt(x, z)) - sink, z);
    obj.rotation.y = rot;
    obj.scale.setScalar(scale);
    this.scene.add(obj);
    return obj;
  }

  // Is this spot free for a tree/rock? Keeps roads, zones, water and other props clear.
  clearSpot(x, z, pad = 0) {
    const r = Math.hypot(x, z);
    if (r > 150) return false;
    if (pathDistance(x, z) < 5 + pad) return false;
    const h = heightAt(x, z);
    if (h < 1.4) return false;
    for (const key of ['village', 'ruins', 'shrine']) {
      const zn = ZONES[key];
      const extra = key === 'ruins' ? -4 : 4;
      if (Math.hypot(x - zn.x, z - zn.z) < zn.r + extra + pad) return false;
    }
    return normalAt(x, z).y > 0.8;
  }

  buildForest() {
    const rand = mulberry32(21);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const buckets = {};
    const add = (name, x, z, scale) => {
      q.setFromAxisAngle(up, rand() * Math.PI * 2);
      p.set(x, heightAt(x, z) - 0.15, z);
      s.setScalar(scale);
      (buckets[name] ||= []).push(m.clone().compose(p, q, s));
    };
    const taken = [];
    const free = (x, z, r) => taken.every((t) => Math.hypot(t[0] - x, t[1] - z) > t[2] + r);

    // Dense stands where the forest noise is high; lone trees scattered elsewhere.
    for (let i = 0; i < 9000 && taken.length < 520; i++) {
      const x = (rand() - 0.5) * 290;
      const z = (rand() - 0.5) * 290;
      const r = Math.hypot(x, z);
      if (r > 138) continue;
      const forest = fbm(x * 0.018 + 5, z * 0.018 - 9, 3) * 0.5 + 0.5 + smoothstep(90, 130, r) * 0.35;
      if (forest < 0.5 && rand() > 0.08) continue;
      const cluster = forest > 0.62 && rand() < 0.55;
      const rad = cluster ? 5.2 : 1.6;
      if (!this.clearSpot(x, z, cluster ? 3 : 0) || !free(x, z, rad)) continue;
      taken.push([x, z, rad]);
      if (cluster) {
        const kind = ['trees_A_large', 'trees_A_medium', 'trees_B_large', 'trees_B_medium', 'trees_A_small', 'trees_B_small'][Math.floor(rand() * 6)];
        add(kind, x, z, HEX * (0.9 + rand() * 0.35));
        if (r < PLAY_RADIUS + 4) this.colliders.circle(x, z, 3.6);
      } else {
        add(rand() > 0.5 ? 'tree_single_A' : 'tree_single_B', x, z, HEX * (0.8 + rand() * 0.55));
        if (r < PLAY_RADIUS + 4) this.colliders.circle(x, z, 0.75);
      }
    }
    // Rocks and boulders.
    for (let i = 0; i < 3000 && taken.length < 700; i++) {
      const x = (rand() - 0.5) * 280;
      const z = (rand() - 0.5) * 280;
      if (!this.clearSpot(x, z, -2) || !free(x, z, 1.5)) continue;
      const big = rand() < 0.25;
      const scale = HEX * (big ? 2.2 + rand() * 1.8 : 0.9 + rand() * 0.9);
      taken.push([x, z, big ? 3 : 1]);
      add('rock_single_' + 'ABCDE'[Math.floor(rand() * 5)], x, z, scale);
      if (big) this.colliders.circle(x, z, scale * 0.14);
    }
    for (const [name, list] of Object.entries(buckets)) {
      const tree = name.startsWith('tree');
      this.instanced(name, list, { sway: tree ? 0.012 : 0, shadow: true });
    }
  }

  buildMountains() {
    const rand = mulberry32(5);
    const kinds = ['mountain_A', 'mountain_B', 'mountain_C', 'mountain_A_grass_trees', 'mountain_B_grass_trees'];
    const lists = {};
    const m = new THREE.Matrix4();
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + rand() * 0.08;
      const r = 185 + rand() * 50;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const scale = 34 + rand() * 22;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28);
      (lists[kinds[i % kinds.length]] ||= []).push(
        m.clone().compose(new THREE.Vector3(x, heightAt(x * 0.8, z * 0.8) - 6, z), q, new THREE.Vector3(scale, scale * (0.8 + rand() * 0.5), scale)));
    }
    for (const [name, list] of Object.entries(lists)) this.instanced(name, list, { shadow: false });
  }

  buildClouds() {
    const rand = mulberry32(3);
    for (let i = 0; i < 16; i++) {
      const cloud = this.assets.prop(rand() > 0.5 ? 'cloud_big' : 'cloud_small');
      const a = rand() * Math.PI * 2;
      const r = 130 + rand() * 150;
      cloud.position.set(Math.cos(a) * r, 115 + rand() * 50, Math.sin(a) * r);
      cloud.scale.setScalar(14 + rand() * 14);
      cloud.rotation.y = rand() * 6.28;
      cloud.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = false;
          o.material = new THREE.MeshStandardMaterial({ color: '#fff1e6', emissive: '#f0b48a', emissiveIntensity: 0.35, roughness: 1, flatShading: true });
        }
      });
      this.scene.add(cloud);
      const speed = 0.6 + rand() * 0.8;
      this.animated.push({ update: (dt) => {
        cloud.position.x += speed * dt;
        if (cloud.position.x > 260) cloud.position.x = -260;
      } });
    }
  }

  // Floating fireflies/embers that give the air some life.
  buildMotes() {
    const count = this.quality === 'low' ? 250 : 700;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const rand = mulberry32(12);
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 118;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      pos[i * 3] = x;
      pos[i * 3 + 1] = heightAt(x, z) + 0.6 + rand() * 4;
      pos[i * 3 + 2] = z;
      seed[i] = rand() * 100;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: this.windUniforms.uTime, uPix: { value: this.renderer.getPixelRatio() } },
      vertexShader: /* glsl */`
        attribute float aSeed;
        uniform float uTime, uPix;
        varying float vA;
        void main() {
          vec3 p = position;
          p.x += sin(uTime * 0.3 + aSeed) * 1.5;
          p.y += sin(uTime * 0.5 + aSeed * 1.7) * 0.8;
          p.z += cos(uTime * 0.27 + aSeed * 0.7) * 1.5;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vA = (0.5 + 0.5 * sin(uTime * 2.0 + aSeed * 3.0)) * (1.0 - smoothstep(40.0, 70.0, -mv.z));
          gl_PointSize = uPix * 90.0 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vec3(1.0, 0.78, 0.4) * 2.0, a * a * vA * 0.9);
        }`,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
  }

  torch(x, z, { y = null, light = true, mounted = false, rot = 0 } = {}) {
    const t = this.assets.prop(mounted ? 'd_torch_mounted' : 'd_torch_lit');
    this.place(t, x, z, { y, rot, scale: 1.3 });
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 12, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb04a').multiplyScalar(4), toneMapped: false }),
    );
    flame.position.set(0, 1.25, 0);
    t.add(flame);
    if (light) {
      const l = new THREE.PointLight(new THREE.Color('#ff8a3c'), 22, 16, 1.6);
      l.position.set(0, 1.6, 0);
      t.add(l);
      this.torches.push({ light: l, flame, base: 22, seed: this.rand() * 10 });
    } else {
      this.torches.push({ light: null, flame, base: 0, seed: this.rand() * 10 });
    }
    return t;
  }

  // ----- Cinderhold village -------------------------------------------------------
  buildVillage() {
    const v = ZONES.village;
    const face = (x, z) => Math.atan2(v.x - x, v.z - z);
    const building = (name, angleDeg, r, { scale = HEX, colliderR = null, turn = 0 } = {}) => {
      const a = THREE.MathUtils.degToRad(angleDeg);
      const x = v.x + Math.cos(a) * r;
      const z = v.z + Math.sin(a) * r;
      const obj = this.assets.prop(name);
      this.place(obj, x, z, { rot: face(x, z) + turn, scale, sink: 0.25 });
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      this.colliders.circle(x, z, colliderR ?? Math.min(size.x, size.z) * 0.46);
      return obj;
    };
    building('building_blacksmith_red', -155, 18);
    building('building_home_A_red', 150, 18.5);
    building('building_church_red', 118, 25, { scale: HEX * 1.1 });
    building('building_tavern_red', 62, 20);
    building('building_home_B_red', 20, 19.5);
    building('building_market_red', -40, 18.5, { colliderR: 4.2 });
    building('building_home_A_red', -118, 19.5);
    building('building_home_B_red', 172, 26);
    building('building_tower_A_red', -72, 27, { scale: HEX * 1.1 });
    const mill = this.assets.prop('building_windmill_red');
    this.place(mill, 36, 34, { rot: -2.2, scale: HEX * 1.15, sink: 0.3 });
    this.colliders.circle(36, 34, 3.4);
    this.windmill = mill;

    const well = this.assets.prop('building_well_red');
    this.place(well, v.x, v.z, { scale: HEX * 0.95, sink: 0.2 });
    this.colliders.circle(v.x, v.z, 2.2);

    // Fences along the outskirts, with gaps for the roads.
    const rand = mulberry32(44);
    for (let a = 0; a < 360; a += 7.2) {
      const rad = THREE.MathUtils.degToRad(a);
      const r = 34;
      const x = v.x + Math.cos(rad) * r;
      const z = v.z + Math.sin(rad) * r;
      if (pathDistance(x, z) < 4.5 || Math.hypot(x - 36, z - 34) < 7) continue;
      const fence = this.assets.prop(rand() > 0.9 ? 'fence_wood_straight_gate' : 'fence_wood_straight');
      this.place(fence, x, z, { rot: -rad, scale: HEX * 0.72, sink: 0.1 });
      this.colliders.circle(x, z, 1.4);
    }

    // Market clutter, forge, training yard.
    const clutter = [
      ['barrel', 9, 38.5], ['barrel', 10.2, 37.6], ['crate_A_big', 7.2, 36.8], ['sack', 11.4, 39.6], ['crate_A_small', 6.6, 38.3],
      ['barrel', -13, 42], ['resource_lumber', -9, 40.5], ['bucket_water', -11.6, 43.4], ['crate_A_big', -21, 47.5],
      ['tent', -27, 60], ['target', -30, 54], ['target', -32, 57.5], ['weaponrack', -25, 55],
      ['wheelbarrow', 30, 38], ['resource_lumber', 32, 31], ['sack', 33.5, 37], ['sack', 34.2, 36.2],
      ['barrel', 13, 64], ['crate_A_small', 14, 65], ['flag_red', 4.5, 48.5], ['flag_red', -4.5, 48.5],
    ];
    for (const [name, x, z] of clutter) {
      const o = this.assets.prop(name);
      const big = name === 'tent' ? HEX * 1.2 : HEX * 0.95;
      this.place(o, x, z, { rot: rand() * 6.28, scale: big });
      if (name !== 'flag_red' && name !== 'sack') this.colliders.circle(x, z, name === 'tent' ? 2.6 : 0.8);
    }
    this.torch(-15, 46.5, { light: true });
    this.torch(6, 46, { light: false });
    this.torch(-6, 58, { light: false });

    this.markers.npcs.push(
      { id: 'maren', model: 'mage', x: 3.2, z: 48.4, face: Math.PI * 0.9, name: 'Elder Maren' },
      { id: 'brann', model: 'barbarian', x: -12, z: 46, face: 0.9, name: 'Brann the Smith' },
      { id: 'tamsin', model: 'rogue', x: 8.5, z: 41.5, face: -0.4, name: 'Tamsin the Trader' },
    );
    this.spawnPoint = new THREE.Vector3(0, 0, 70);
  }

  // ----- The Hollow Ruins ----------------------------------------------------------
  buildRuins() {
    const r = ZONES.ruins;
    const cx = r.x;
    const cz = r.z;
    const y = r.h;
    const wallPieces = ['d_wall_broken', 'd_wall_cracked', 'd_wall_half', 'd_wall_broken', 'd_wall_arched'];
    const rand = mulberry32(8);
    // A ruined great hall, 24 x 28, with most of its walls fallen.
    const hallW = 12;
    const hallD = 14;
    const sides = [
      { axis: 'x', fixed: cz - hallD, from: cx - hallW, to: cx + hallW, rot: 0 },
      { axis: 'x', fixed: cz + hallD, from: cx - hallW, to: cx + hallW, rot: Math.PI },
      { axis: 'z', fixed: cx - hallW, from: cz - hallD, to: cz + hallD, rot: Math.PI / 2 },
      { axis: 'z', fixed: cx + hallW, from: cz - hallD, to: cz + hallD, rot: -Math.PI / 2 },
    ];
    for (const s of sides) {
      for (let t = s.from + 2; t < s.to; t += 4) {
        const x = s.axis === 'x' ? t : s.fixed;
        const z = s.axis === 'x' ? s.fixed : t;
        if (Math.abs(x - cx) < 4 && s.axis === 'x') {        // doorways on the road
          if (rand() > 0.4) {
            const arch = this.assets.prop('d_wall_arched');
            this.place(arch, x, z, { y, rot: s.rot, scale: 1 });
          }
          continue;
        }
        if (rand() < 0.3) {
          const rub = this.assets.prop('d_rubble_half');
          this.place(rub, x + (rand() - 0.5) * 2, z + (rand() - 0.5) * 2, { y: heightAt(x, z), rot: rand() * 6.28, scale: 0.55 });
          this.colliders.circle(x, z, 1.2);
          continue;
        }
        const piece = wallPieces[Math.floor(rand() * wallPieces.length)];
        const w = this.assets.prop(piece);
        this.place(w, x, z, { y: heightAt(x, z) - 0.2, rot: s.rot, scale: 1 });
        if (s.axis === 'x') this.colliders.wall(x - 2, z, x + 2, z, 0.55);
        else this.colliders.wall(x, z - 2, x, z + 2, 0.55);
        if (rand() < 0.25) {
          const banner = this.assets.prop(rand() > 0.5 ? 'd_banner_patternA_red' : 'd_banner_thin_red');
          const off = new THREE.Vector3(0, 0, 0.55).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.rot);
          this.place(banner, x + off.x, z + off.z, { y: heightAt(x, z) - 0.6, rot: s.rot, scale: 0.8 });
        }
      }
    }
    // Colonnade.
    for (const side of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const x = cx + side * 6;
        const z = cz - 10 + k * 7;
        const broken = rand() < 0.4;
        const pillar = this.assets.prop(broken ? 'd_column' : 'd_pillar');
        this.place(pillar, x, z, { y: heightAt(x, z) - 0.1, scale: broken ? 1.6 : 1 });
        this.colliders.circle(x, z, 0.85);
      }
    }
    // Floor slabs, graves, clutter.
    for (let i = 0; i < 16; i++) {
      const x = cx + (rand() - 0.5) * 22;
      const z = cz + (rand() - 0.5) * 26;
      const slab = this.assets.prop(rand() > 0.5 ? 'd_floor_tile_large' : 'd_floor_tile_large_rocks');
      this.place(slab, x, z, { y: heightAt(x, z) - 0.05, rot: Math.floor(rand() * 4) * Math.PI / 2, scale: 1 });
    }
    for (let i = 0; i < 14; i++) {
      const a = rand() * Math.PI * 2;
      const rr = 15 + rand() * 9;
      const x = cx + Math.cos(a) * rr;
      const z = cz + Math.sin(a) * rr;
      if (pathDistance(x, z) < 3) continue;
      const grave = this.assets.prop('d_sword_shield_broken');
      this.place(grave, x, z, { rot: rand() * 6.28, scale: 1.1 });
    }
    for (const [name, x, z, sc] of [['d_rubble_large', cx + 9, cz + 18, 0.7], ['d_rubble_half', cx - 15, cz - 4, 0.8],
      ['d_barrel_large', cx - 9, cz + 11, 0.6], ['d_keg', cx + 9.5, cz - 11.5, 0.6], ['d_barrel_large', cx + 10, cz + 9, 0.6],
      ['d_candle_triple', cx - 1.5, cz - 12.5, 1.2], ['d_rubble_half', cx + 16, cz - 12, 0.7]]) {
      const o = this.assets.prop(name);
      this.place(o, x, z, { rot: rand() * 6.28, scale: sc });
      this.colliders.circle(x, z, name.includes('rubble') ? 2.2 : 0.9);
    }
    this.torch(cx - 3.5, cz + 15.5);
    this.torch(cx + 3.5, cz - 14.5);
    this.torch(cx - 8.5, cz - 3);

    // Where the dead are buried (enemy spawns). Type, x, z.
    // Offsets from the hall's center: type, dx, dz.
    const spawns = [
      ['minion', -4, 10], ['minion', 5, 4], ['warrior', 0, -5], ['minion', -7, -2],
      ['skelmage', 7, -9], ['minion', 3, 16], ['warrior', -9, -11], ['skelmage', -12, 6],
      ['minion', 16, -2], ['minion', -16, -6],
    ];
    for (const [type, dx, dz] of spawns) this.markers.spawns.push({ type, x: cx + dx, z: cz + dz });
  }

  // ----- The Ember Shrine (boss arena) -------------------------------------------------
  buildShrine() {
    const s = ZONES.shrine;
    const y = s.h;
    for (let i = -4; i < 4; i++) {
      for (let j = -4; j < 4; j++) {
        const x = s.x + i * 4 + 2;
        const z = s.z + j * 4 + 2;
        if (Math.hypot(x - s.x, z - s.z) > 17) continue;
        const tile = this.assets.prop((i + j) % 3 === 0 ? 'd_floor_tile_large_rocks' : 'd_floor_tile_large');
        this.place(tile, x, z, { y: y + 0.02, scale: 1 });
      }
    }
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + Math.PI / 10;
      const x = s.x + Math.cos(a) * 16.5;
      const z = s.z + Math.sin(a) * 16.5;
      if (z > s.z + 12) continue;                      // leave the entrance open
      const p = this.assets.prop(k % 3 === 0 ? 'd_column' : 'd_pillar_decorated');
      this.place(p, x, z, { y: heightAt(x, z) - 0.1, rot: -a, scale: k % 3 === 0 ? 1.6 : 1.15 });
      this.colliders.circle(x, z, 1.1);
    }
    this.torch(s.x - 7, s.z + 14);
    this.torch(s.x + 7, s.z + 14);
    this.torch(s.x, s.z - 14, { light: false });
    for (const side of [-1, 1]) {
      const b = this.assets.prop('d_banner_patternA_red');
      this.place(b, s.x + side * 4.5, s.z + 19, { rot: 0, scale: 0.9 });
    }
    this.arenaCenter = new THREE.Vector3(s.x, y, s.z);
    this.arenaRadius = 17.5;

    // Pedestal where the shard rests.
    const ped = this.assets.prop('d_column');
    this.place(ped, s.x, s.z - 8, { y, scale: 1.3 });
    this.pedestal = new THREE.Vector3(s.x, y + 1.9, s.z - 8);
  }

  update(dt, camera, playerPos) {
    this.time += dt;
    this.windUniforms.uTime.value = this.time;
    for (const a of this.animated) a.update(dt, this.time);
    for (const t of this.torches) {
      const f = 0.82 + 0.18 * Math.sin(this.time * 13 + t.seed) * Math.sin(this.time * 7.3 + t.seed * 2);
      if (t.light) t.light.intensity = t.base * f;
      t.flame.scale.setScalar(0.8 + f * 0.3);
    }
    if (this.windmill) {
      this.millBlades ??= findSpinners(this.windmill);
      for (const b of this.millBlades) b.rotation.z += dt * 0.6;
    }
    this.updateGrass(camera, playerPos);
    this.followShadow(playerPos);
  }
}

function findSpinners(root) {
  const out = [];
  root.traverse((o) => { if (/blade|wing|fan|propeller|sail/i.test(o.name)) out.push(o); });
  return out;
}
