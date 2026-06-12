# Performance thresholds (hard law — mobile is the floor)

- 60 fps target; smoke-fail < 45 fps avg
- draw_call_budget: 80 (renderer.info.render.calls on the dev overlay, backtick)
- worst_case_scene: mid-arena, 3 bots visible firing, 12 beams + hit particles + score update
- Beams: single InstancedMesh pool (max 24); cover blocks: one InstancedMesh
- No shadows; pixelRatio = min(devicePixelRatio, 1.5); Fog.far = 80 = draw distance
- Zero allocations inside the frame loop (pools for beams/sparks; preallocated scratch vectors)
- Input-to-beam latency ≤ 100 ms (fire keydown → beam visible)
- Escape hatch: if mobile FPS < 45 with GLBs, flip props/drones to procedural fallback
