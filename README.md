# Math Adventure for Kids

A kid-friendly math practice web app with:

- Addition, subtraction, and multiplication modes
- Easy / Medium / Hard difficulty settings
- Score + streak tracking
- Instant answer feedback and next-question flow

## Run locally

Open `index.html` in a browser.

# Caption Lab

`caption-lab/index.html` is a photo caption generator. Drop a photo, a photo dump or a short video and it writes captions based on what's actually in it: the subject, the light and the mood.

**One post**
- **Get another caption** pages through the batch. Changing settings never spends a batch: the button switches to **Write 5 new** when the next batch would use different settings, and old captions are only replaced once new ones arrive.
- **Tweak instead of reroll**: edit in place, Shorter, Funnier, Bolder, Softer or Spicier, lowercase, no emoji, thumbs up or down, **More like this**. Likes, passes, edits and copies steer the next batch.
- **Write**: Captions, profile **Bios** (sized to each platform's bio limit), or, in Creator mode, **Sell this set** (a public teaser, an unlock message with `{price}`, and DM openers with `{name}`, all non-explicit).
- **Posting to** Instagram, TikTok, Story, X, Threads or a Reddit title, each with its own length rules and counter. Reddit titles follow optional subreddit rules and stay on one line.
- **Photo dumps** of up to 5 photos get one caption for the set, a numbered list caption and a pick for which photo leads. **Videos** are captioned from 4 frames pulled in the browser.
- **iPhone HEIC photos** are converted in the browser when it can't open them directly.
- **Extras**: photo-specific hashtags (generic and risky ones filtered) and alt text that stays attached to its photo when you reorder.
- **Ask the group chat**: pick 2 or 3 captions and copy a numbered poll message, or save a poll image with your photo.

**Whole shoot**: up to 20 photos, each with 3 captions in the same voice and no repeats across the set. Copy all, or save a CSV for scheduling tools.

**Voice profiles**: example captions, emoji habit, words to use and avoid, and an AI-model option with an 18+ age, city and backstory. Saved in the browser; **Copy share code** and **Paste a share code** move a voice between devices or people.

**Language**: 15 languages, including Hinglish and Spanglish, for captions, hashtags and alt text.

**Modes**: Everyday (clean) and Creator (flirty, platform-safe promo). Creator text never names fan sites or uses phrases that get promo posts hidden, and falls back to clean writing if anyone in the photos could be under 18.

It runs as a Claude artifact: captions are written by Claude using the `sample` capability, and files are saved with the `downloads` capability, so there's no API key. Opened as a plain local file, it still previews photos and their colors, but it can't write captions.

Not built yet: caption limits, rewarded ads, subscriptions, a live vote link for polls, sharing straight from the phone's gallery, and a standalone backend.
