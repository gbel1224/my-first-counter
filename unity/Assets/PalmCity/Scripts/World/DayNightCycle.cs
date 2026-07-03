using UnityEngine;

namespace PalmCity
{
    /// Rotating sun, ambient light shifts, and a simple rain system that
    /// follows the player. One in-game day lasts 30 real minutes.
    public class DayNightCycle : MonoBehaviour
    {
        public static DayNightCycle Instance;

        public float minutes = 480f;          // 08:00
        public float minutesPerSecond = 0.8f;

        Light sun;
        ParticleSystem rain;
        float rainTarget, rainLevel;

        void Awake()
        {
            Instance = this;

            var sunGo = new GameObject("Sun");
            sun = sunGo.AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.shadows = LightShadows.Soft;
            RenderSettings.fog = false;

            BuildRain();
        }

        void BuildRain()
        {
            var go = new GameObject("Rain");
            rain = go.AddComponent<ParticleSystem>();
            var main = rain.main;
            main.startSpeed = 0f;
            main.startLifetime = 1.2f;
            main.startSize = 0.06f;
            main.maxParticles = 2000;
            main.startColor = new Color(0.7f, 0.85f, 1f, 0.6f);
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.gravityModifier = 4f;

            var shape = rain.shape;
            shape.shapeType = ParticleSystemShapeType.Box;
            shape.scale = new Vector3(60f, 1f, 60f);

            var emission = rain.emission;
            emission.rateOverTime = 0f;

            var r = rain.GetComponent<ParticleSystemRenderer>();
            r.renderMode = ParticleSystemRenderMode.Stretch;
            r.velocityScale = 0.08f;
            r.material = Mats.Solid(new Color(0.7f, 0.85f, 1f, 0.6f));
        }

        void Update()
        {
            minutes += Time.deltaTime * minutesPerSecond;
            if (minutes >= 1440f) minutes -= 1440f;

            // sun path: rises 06:00, sets 20:00
            float dayT = Mathf.InverseLerp(360f, 1200f, minutes);
            float elevation = Mathf.Sin(dayT * Mathf.PI) * 70f;
            bool day = minutes > 360f && minutes < 1200f;
            sun.transform.rotation = Quaternion.Euler(day ? elevation : -20f, 40f + minutes * 0.05f, 0f);
            sun.intensity = day ? Mathf.Lerp(0.15f, 1.15f, Mathf.Sin(dayT * Mathf.PI)) : 0.12f;
            sun.color = Color.Lerp(new Color(1f, 0.62f, 0.4f), Color.white, Mathf.Sin(dayT * Mathf.PI));
            RenderSettings.ambientLight = day
                ? Color.Lerp(new Color(0.35f, 0.32f, 0.38f), new Color(0.62f, 0.66f, 0.70f), Mathf.Sin(dayT * Mathf.PI))
                : new Color(0.13f, 0.15f, 0.24f);

            // random weather changes
            if (Random.value < 0.0006f) rainTarget = rainTarget > 0.1f ? 0f : Random.Range(0.4f, 1f);
            rainLevel = Mathf.Lerp(rainLevel, rainTarget, Time.deltaTime * 0.4f);
            var emission = rain.emission;
            emission.rateOverTime = rainLevel * 900f;

            // rain follows the player
            var gm = GameManager.Instance;
            if (gm != null && gm.player != null)
                rain.transform.position = gm.player.ActivePosition + Vector3.up * 18f;

            if (HUDBuilder.I != null) HUDBuilder.I.SetClock(ClockString());
        }

        public bool IsNight => minutes < 360f || minutes > 1200f;
        public bool IsRaining => rainLevel > 0.25f;

        public string ClockString()
        {
            int h = Mathf.FloorToInt(minutes / 60f), m = Mathf.FloorToInt(minutes % 60f);
            string icon = IsRaining ? "RAIN" : (IsNight ? "NIGHT" : "DAY");
            return string.Format("{0:00}:{1:00} {2}", h, m, icon);
        }
    }
}
