# Math Adventure for Kids

A kid-friendly math practice web app with:

- Addition, subtraction, and multiplication modes
- Easy / Medium / Hard difficulty settings
- Score + streak tracking
- Instant answer feedback and next-question flow

## Run locally

Open `index.html` in a browser.

# Caption Lab

`caption-lab/index.html` is a photo caption generator. Drop or upload a photo (or a few for a photo dump) and it writes five captions based on what's in the picture: the subject, the light and the mood.

- **Get another caption** pages through the batch. Changing settings never spends a batch: the button switches to **Write 5 new** when the next batch would use different settings.
- **Tweak a caption** instead of rerolling: edit it in place, make it Shorter, Funnier, Bolder, Softer or Spicier, lowercase it, strip emoji, thumbs up or down, or ask for **More like this**. Likes, passes, edits and copies steer the next batch.
- **Posting to** Instagram, TikTok, Story, X, Threads or a Reddit title, each with its own length rules and counter. Reddit titles can follow a subreddit's title rules.
- **Photo dumps**: up to 5 photos in one post get captions for the whole set, a numbered list caption, and a pick for which photo should go first.
- **Extras**: optional hashtags (specific to the photo, generic ones filtered out) and alt text.
- **Voice profiles**: paste captions someone actually posted, plus emoji habits, words they use and words to avoid. AI-generated models get an age (18+), city and backstory that captions stay consistent with. Profiles are saved in the browser.
- **Language**: captions written natively in 15 languages, including Hinglish and Spanglish.
- **Modes**: Everyday (clean) and Creator (flirty, teasing promo captions that stay safe to post, with an optional call to action). Creator captions never name fan sites or use phrases that get promo posts hidden.

It runs as a Claude artifact: captions are written by Claude using the `sample` capability, so there's no API key. Opened as a plain local file, it still previews your photos and their colors, but it can't write captions.

Not built yet: caption limits, rewarded ads, subscriptions, and a standalone backend.
