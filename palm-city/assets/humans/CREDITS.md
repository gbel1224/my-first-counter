# People models

Rigged, textured human models used for the player and the nearest pedestrians. They were slimmed for the web
with `tools/glbslim.mjs`, which keeps only the driven blendshapes, re-encodes the textures as WebP, and covers
printed logos on the stock clothes.

| File | Source | License |
| --- | --- | --- |
| `avaturn.glb` | Avaturn avatar, via [TalkingHead](https://github.com/met4citizen/TalkingHead) examples | Avaturn: free for non-commercial use |
| `avatarsdk.glb` | Avatar SDK / MetaPerson avatar, via TalkingHead examples | Avatar SDK: non-commercial use |
| `mpfb.glb` | MakeHuman / MPFB avatar, via TalkingHead examples | CC0 |
| `man.glb` | Ready Player Me avatar, from the [three.js](https://github.com/mrdoob/three.js) examples | Ready Player Me terms |

Palm City is a free, non-commercial project. Any commercial use would need these models replaced or licensed.

The crowd is built from these same models at load time (src/crowdvat.js), simplified with
[meshoptimizer](https://github.com/zeux/meshoptimizer) (MIT, vendored as `vendor/meshopt_simplifier.module.js`).
