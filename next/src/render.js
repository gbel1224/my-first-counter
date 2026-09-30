// Palm City 2 — renderer + post. The scene renders into a multisampled HDR buffer; a mip-chain
// bloom pulls the highlights out; one composite pass does filmic tone mapping, the colour grade,
// vignette and grain, then writes sRGB. Resolution is FIXED for the session (no mid-play
// rescaling — the picture never softens and sharpens as the framerate wobbles).
import * as THREE from "../vendor/three.module.js";

export const isMobile = (navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) < 820) ||
  /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");

const FS_VERT = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", stencil: false });
  const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 2 : 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;   // the composite pass does the sRGB encode
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const gl = renderer.getContext();
  const canHalf = renderer.capabilities.isWebGL2 && (gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"));
  const type = canHalf ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const samples = renderer.capabilities.isWebGL2 ? 4 : 0;

  let W = 1, H = 1;
  const mk = (w, h, s) => new THREE.WebGLRenderTarget(w, h, { type, samples: s || 0, depthBuffer: !!s, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const sceneRT = mk(1, 1, samples);
  const MIPS = 5;
  const down = [], up = [];
  for (let i = 0; i < MIPS; i++) { down.push(mk(1, 1)); up.push(mk(1, 1)); }

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const qScene = new THREE.Scene(); qScene.add(quad);
  const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // bright-pass + 13-tap downsample (the "Call of Duty" bloom filter — stable, no fireflies)
  const downMat = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThresh: { value: 0 }, uFirst: { value: 0 } },
    vertexShader: FS_VERT,
    fragmentShader: `
      uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThresh, uFirst; varying vec2 vUv;
      vec3 S(vec2 o){ return texture2D(tSrc, vUv + o * uTexel).rgb; }
      void main(){
        vec3 a=S(vec2(-2,-2)), b=S(vec2(0,-2)), c=S(vec2(2,-2)), d=S(vec2(-1,-1)), e=S(vec2(1,-1)),
             f=S(vec2(-2,0)), g=S(vec2(0,0)), h=S(vec2(2,0)), i=S(vec2(-1,1)), j=S(vec2(1,1)),
             k=S(vec2(-2,2)), l=S(vec2(0,2)), m=S(vec2(2,2));
        vec3 col = (d+e+i+j)*0.125 + (a+c+k+m)*0.03125 + (b+f+h+l)*0.0625 + g*0.125;
        if (uFirst > 0.5) {                     // soft-knee threshold on the first mip only
          float br = max(col.r, max(col.g, col.b));
          float soft = clamp(br - uThresh + 0.5, 0.0, 1.0); soft = soft * soft * 0.5;
          float w = max(soft, br - uThresh) / max(br, 1e-4);
          col *= clamp(w, 0.0, 1.0);
          col = min(col, vec3(24.0));
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  // tent upsample, added onto the next-larger mip
  const upMat = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, tAdd: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 } },
    vertexShader: FS_VERT,
    fragmentShader: `
      uniform sampler2D tSrc, tAdd; uniform vec2 uTexel; uniform float uRadius; varying vec2 vUv;
      vec3 S(vec2 o){ return texture2D(tSrc, vUv + o * uTexel * uRadius).rgb; }
      void main(){
        vec3 c = S(vec2(-1,-1)) + S(vec2(1,-1)) + S(vec2(-1,1)) + S(vec2(1,1))
               + 2.0*(S(vec2(0,-1)) + S(vec2(0,1)) + S(vec2(-1,0)) + S(vec2(1,0))) + 4.0*S(vec2(0,0));
        gl_FragColor = vec4(c / 16.0 + texture2D(tAdd, vUv).rgb, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  const compMat = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: null }, tBloom: { value: null }, uBloom: { value: 0.07 }, uExposure: { value: 0.95 },
      uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uVignette: { value: 0.38 },
      uLift: { value: new THREE.Vector3(0.004, 0.012, 0.018) }, uGain: { value: new THREE.Vector3(1.09, 1.01, 0.86) },
      uSat: { value: 1.1 }, uWarm: { value: 0.0 }, uContrast: { value: 0.45 }, uGrain: { value: 0.045 },
    },
    vertexShader: FS_VERT,
    fragmentShader: `
      uniform sampler2D tScene, tBloom; uniform float uBloom, uExposure, uTime, uVignette, uSat, uWarm, uContrast, uGrain;
      uniform vec2 uRes; uniform vec3 uLift, uGain; varying vec2 vUv;
      // ACES fitted (Stephen Hill) — filmic shoulder so the sun and neon roll off instead of clipping
      vec3 RRTAndODTFit(vec3 v){ vec3 a = v*(v+0.0245786)-0.000090537; vec3 b = v*(0.983729*v+0.4329510)+0.238081; return a/b; }
      vec3 ACES(vec3 c){
        const mat3 inM = mat3(0.59719,0.07600,0.02840, 0.35458,0.90834,0.13383, 0.04823,0.01566,0.83777);
        const mat3 outM = mat3(1.60475,-0.10208,-0.00327, -0.53108,1.10813,-0.07276, -0.07367,-0.00605,1.07602);
        return clamp(outM * RRTAndODTFit(inM * c), 0.0, 1.0);
      }
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
      void main(){
        // a touch of lateral chromatic aberration toward the frame edges (real lens, not a filter)
        vec2 q0 = vUv - 0.5;
        vec2 ca = q0 * dot(q0, q0) * 0.012;
        vec3 col = vec3(texture2D(tScene, vUv + ca).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv - ca).b);
        vec3 bl = texture2D(tBloom, vUv).rgb;
        col = mix(col, bl, uBloom) + bl * uBloom * 0.35;
        col *= uExposure;
        col = ACES(col);
        // filmic contrast: an S-curve on luminance, then split-tone (teal shadows, warm highlights)
        float l0 = dot(col, vec3(0.2126, 0.7152, 0.0722));
        float lS = l0 * l0 * (3.0 - 2.0 * l0);
        col *= mix(1.0, lS / max(l0, 1e-4), uContrast);
        float lw = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col += uLift * (1.0 - smoothstep(0.0, 0.45, lw));
        col *= mix(vec3(1.0), uGain, smoothstep(0.35, 1.0, lw));
        col.r += uWarm * 0.03; col.b -= uWarm * 0.02;
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(vec3(l), col, uSat);
        vec2 q = q0; q.x *= uRes.x / uRes.y;
        col *= 1.0 - uVignette * smoothstep(0.3, 1.0, length(q));
        col = toSRGB(clamp(col, 0.0, 1.0));
        // film grain: luminance-weighted, strongest in the mids like real stock
        float g = hash(vUv * uRes + fract(uTime * 7.13) * 91.0) - 0.5;
        col += g * uGrain * (0.6 + 0.4 * (1.0 - abs(l - 0.5) * 2.0));
        gl_FragColor = vec4(col, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    const v = renderer.getDrawingBufferSize(new THREE.Vector2());
    W = v.x; H = v.y;
    sceneRT.setSize(W, H);
    let w = W >> 1, h = H >> 1;
    for (let i = 0; i < MIPS; i++) { w = Math.max(2, w); h = Math.max(2, h); down[i].setSize(w, h); up[i].setSize(w, h); w >>= 1; h >>= 1; }
    compMat.uniforms.uRes.value.set(W, H);
  }
  resize();

  const blit = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(qScene, qCam); };

  function render(scene, camera, time) {
    renderer.setRenderTarget(sceneRT);
    renderer.render(scene, camera);
    // downsample chain
    let src = sceneRT.texture, sw = W, sh = H;
    for (let i = 0; i < MIPS; i++) {
      downMat.uniforms.tSrc.value = src; downMat.uniforms.uTexel.value.set(1 / sw, 1 / sh);
      downMat.uniforms.uFirst.value = i === 0 ? 1 : 0; downMat.uniforms.uThresh.value = 1.0;
      blit(downMat, down[i]);
      src = down[i].texture; sw = down[i].width; sh = down[i].height;
    }
    // upsample chain
    let acc = down[MIPS - 1];
    for (let i = MIPS - 2; i >= 0; i--) {
      upMat.uniforms.tSrc.value = acc.texture; upMat.uniforms.tAdd.value = down[i].texture;
      upMat.uniforms.uTexel.value.set(1 / acc.width, 1 / acc.height);
      blit(upMat, up[i]); acc = up[i];
    }
    compMat.uniforms.tScene.value = sceneRT.texture; compMat.uniforms.tBloom.value = acc.texture;
    compMat.uniforms.uTime.value = time;
    blit(compMat, null);
  }

  return { renderer, render, resize, grade: compMat.uniforms, info: { type: canHalf ? "half" : "byte", samples, dpr } };
}
