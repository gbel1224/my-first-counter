using UnityEngine;

namespace PalmCity
{
    /// 0–5 star heat. Crimes add heat; staying out of trouble cools it.
    /// Spawns foot cops (and cop cars from 3 stars) around the player.
    public class WantedSystem : MonoBehaviour
    {
        public static WantedSystem Instance;

        float heat, coolTimer, spawnTimer;
        int stars;

        public int Stars => stars;

        void Awake() { Instance = this; }

        public void Heat(float amount)
        {
            heat = Mathf.Min(heat + amount, 6.5f);
            coolTimer = 0f;
            int s = Mathf.Min(5, Mathf.FloorToInt(heat));
            if (s > stars)
            {
                stars = s;
                HUDBuilder.I.SetStars(stars);
            }
        }

        public void ClearWanted()
        {
            heat = 0f; stars = 0; coolTimer = 0f;
            if (HUDBuilder.I != null) HUDBuilder.I.SetStars(0);
        }

        void Update()
        {
            var gm = GameManager.Instance;
            if (gm == null || !gm.Running || gm.player == null) return;

            if (heat <= 0f) return;

            // spawn pressure scales with stars
            int desired = stars * 2;
            int alive = EntityPopulator.Instance.CopCount;
            spawnTimer -= Time.deltaTime;
            if (alive < desired && spawnTimer <= 0f)
            {
                spawnTimer = 1.2f - stars * 0.12f;
                Vector3 pos = RandomAround(gm.player.ActivePosition, 45f, 70f);
                if (stars >= 3 && Random.value < 0.5f)
                {
                    var car = VehicleController.Build(5, pos, Random.Range(0f, 360f), true);
                    car.ai.aiMode = VehicleAIMode.Chase;
                    if (MinimapCamera.I != null) MinimapCamera.AddBlip(car.transform, new Color(0.25f, 0.6f, 1f), 6f);
                }
                else
                {
                    CopAI.Build(pos);
                }
            }

            // cool off if you keep your nose clean long enough
            coolTimer += Time.deltaTime;
            if (coolTimer > 6f + stars * 2f)
            {
                heat = Mathf.Max(0f, heat - Time.deltaTime * 0.6f);
                int s = Mathf.Min(5, Mathf.FloorToInt(heat));
                if (s < stars)
                {
                    stars = s;
                    HUDBuilder.I.SetStars(stars);
                    if (stars == 0) HUDBuilder.I.Toast("COPS LOST", "You cooled off");
                }
            }
        }

        static Vector3 RandomAround(Vector3 center, float min, float max)
        {
            for (int i = 0; i < 10; i++)
            {
                Vector2 dir = Random.insideUnitCircle.normalized;
                Vector3 p = center + new Vector3(dir.x, 0f, dir.y) * Random.Range(min, max);
                if (CityGenerator.InsideWorld(p)) return p;
            }
            return center + Vector3.forward * min;
        }
    }
}
