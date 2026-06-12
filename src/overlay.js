/* Dev overlay (backtick): FPS, frame ms, draw calls, triangles, sim stats.
   Also collects smoke-run statistics for the performance gate. */
export function createOverlay(renderer) {
  const el = document.getElementById('dev');
  let visible = false;
  let frames = 0, acc = 0, fps = 0, worstMs = 0, frameMs = 0;
  let lastCalls = 0, maxCalls = 0;
  const smoke = { samples: 0, fpsSum: 0, fpsMin: Infinity, maxCalls: 0, maxTris: 0 };

  addEventListener('keydown', e => {
    if (e.code === 'Backquote') { visible = !visible; el.style.display = visible ? 'block' : 'none'; }
  });

  function frame(dt, ms, simInfo = '') {
    frames++; acc += dt; frameMs = ms; worstMs = Math.max(worstMs, ms);
    const calls = renderer.info.render.calls;
    lastCalls = calls; maxCalls = Math.max(maxCalls, calls);
    if (acc >= 1) {
      fps = Math.round(frames / acc);
      frames = 0; acc = 0;
      smoke.samples++; smoke.fpsSum += fps;
      smoke.fpsMin = Math.min(smoke.fpsMin, fps);
      smoke.maxCalls = Math.max(smoke.maxCalls, maxCalls);
      smoke.maxTris = Math.max(smoke.maxTris, renderer.info.render.triangles);
      maxCalls = 0; worstMs = 0;
    }
    if (visible) {
      el.textContent =
        `FPS ${fps}  frame ${ms.toFixed(1)}ms (worst ${worstMs.toFixed(1)})\n` +
        `draw calls ${calls}  tris ${renderer.info.render.triangles}\n` +
        simInfo;
    }
  }

  function smokeReport() {
    return {
      avgFps: smoke.samples ? +(smoke.fpsSum / smoke.samples).toFixed(1) : 0,
      minFps: smoke.fpsMin === Infinity ? 0 : smoke.fpsMin,
      maxDrawCalls: smoke.maxCalls,
      maxTriangles: smoke.maxTris,
    };
  }
  function smokeReset() {
    smoke.samples = 0; smoke.fpsSum = 0; smoke.fpsMin = Infinity; smoke.maxCalls = 0; smoke.maxTris = 0;
  }

  return { frame, smokeReport, smokeReset, get fps() { return fps; }, get calls() { return lastCalls; } };
}
