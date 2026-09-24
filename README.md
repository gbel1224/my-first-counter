# Math Adventure for Kids

A kid-friendly math practice web app with:

- Addition, subtraction, and multiplication modes
- Easy / Medium / Hard difficulty settings
- Score + streak tracking
- Instant answer feedback and next-question flow

## Run locally

Open `index.html` in a browser.

## Bonus: BACKFLIP (Blender scene)

![BACKFLIP preview](blender/backflip-preview.gif)

`blender/backflip.py` builds a complete animated synthwave stunt show in Blender
from one script: a glossy cube hero crouches, launches, sticks a backflip,
and a crowd of mini cubes goes wild. It includes a confetti cannon, a floor
shockwave, a neon title card, a striped sunset, wireframe mountains, a
starfield and a bloom pass. Everything is procedural, so there's nothing to
download.

**Run it (Blender 4.2 or newer):**

1. Open Blender, go to the **Scripting** tab.
2. **Open** `blender/backflip.py`, then click **▶ Run Script**.
3. It creates a new scene named `BACKFLIP` (your other scenes are untouched),
   switches to the camera view and starts playback. **Ctrl+F12** renders the MP4
   (saved next to your .blend, or in your home folder if the file isn't saved).

Or from a terminal:

```sh
blender --python blender/backflip.py                      # open it and play
blender -b --python blender/backflip.py -S BACKFLIP -a    # render the MP4 headless
```

Want to tweak the stunt? The whole jump is one function, `hero_pose()`.
Change `apex_height`, `LAND`, or the squash amounts and re-run the script.
