using System.Collections.Generic;
using UnityEngine;

namespace PalmCity
{
    /// Tiny procedural synth — generates retro sound effects as PCM at
    /// runtime, so no audio assets are needed. Mirrors the web version:
    /// pop (pistol/SMG), crack (rifle), boom (shotgun/RPG/explosions),
    /// hit (melee/kill), cash (money).
    public static class Sfx
    {
        static AudioSource source;
        static readonly Dictionary<string, AudioClip> cache = new Dictionary<string, AudioClip>();

        public static void Play(string type, float volume = 1f)
        {
            if (source == null)
            {
                var go = new GameObject("Sfx");
                source = go.AddComponent<AudioSource>();
                source.playOnAwake = false;
                source.spatialBlend = 0f; // 2D
            }
            if (!cache.TryGetValue(type, out AudioClip clip))
            {
                clip = Generate(type);
                cache[type] = clip;
            }
            if (clip != null) source.PlayOneShot(clip, volume);
        }

        static AudioClip Generate(string type)
        {
            const int sr = 44100;
            float dur = type == "boom" ? 0.5f : type == "cash" ? 0.18f : 0.12f;
            int n = (int)(sr * dur);
            var data = new float[n];

            for (int i = 0; i < n; i++)
            {
                float t = (float)i / sr;
                float k = 1f - (float)i / n; // linear decay
                float p = t / dur;
                float s = 0f;
                switch (type)
                {
                    case "pop":   // square chirp 420 → 120 Hz
                    {
                        float f = Mathf.Lerp(420f, 120f, p);
                        s = Mathf.Sign(Mathf.Sin(2f * Mathf.PI * f * t)) * 0.5f;
                        break;
                    }
                    case "crack": // square chirp 880 → 120 Hz
                    {
                        float f = Mathf.Lerp(880f, 120f, p);
                        s = Mathf.Sign(Mathf.Sin(2f * Mathf.PI * f * t)) * 0.5f;
                        break;
                    }
                    case "hit":   // triangle thud 200 → 80 Hz
                    {
                        float f = Mathf.Lerp(200f, 80f, p);
                        s = Mathf.PingPong(f * t * 2f, 1f) * 2f - 1f;
                        break;
                    }
                    case "cash":  // two-note chime
                    {
                        float f = p < 0.4f ? 880f : 1320f;
                        s = Mathf.Sin(2f * Mathf.PI * f * t);
                        break;
                    }
                    case "boom":  // saw sweep + noise burst
                    {
                        float f = Mathf.Lerp(160f, 40f, p);
                        s = (Mathf.Repeat(f * t, 1f) * 2f - 1f) * 0.7f
                          + (Random.value * 2f - 1f) * 0.5f * k;
                        break;
                    }
                }
                data[i] = s * k * k * 0.6f;
            }

            var clip = AudioClip.Create(type, n, 1, sr, false);
            clip.SetData(data, 0);
            return clip;
        }
    }
}
