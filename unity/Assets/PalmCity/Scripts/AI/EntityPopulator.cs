using System.Collections.Generic;
using UnityEngine;

namespace PalmCity
{
    /// Keeps the streets alive: spawns peds/traffic near the player,
    /// culls what's far away, and answers "what's nearby" queries.
    public class EntityPopulator : MonoBehaviour
    {
        public static EntityPopulator Instance;

        public int targetPeds = 20;
        public int targetTraffic = 8;
        public float activeRadius = 90f;
        public float cullRadius = 160f;

        readonly List<PedestrianAI> peds = new List<PedestrianAI>();
        readonly List<VehicleController> vehicles = new List<VehicleController>();
        readonly List<CopAI> cops = new List<CopAI>();

        float tick;

        public int CopCount => cops.Count;

        void Awake() { Instance = this; }

        public void InitialSpawn()
        {
            var center = GameManager.Instance.player.transform.position;
            // parked cars across nearby blocks
            for (int i = 0; i < 24; i++)
            {
                Vector3 p = CityGenerator.RandomLanePointNear(center, 140f, out float heading);
                p += Quaternion.Euler(0f, heading, 0f) * Vector3.right * 4f; // curbside
                VehicleController.Build(Random.Range(0, 5), p, heading + Random.Range(-8f, 8f), false);
            }
            for (int i = 0; i < targetTraffic; i++) SpawnTrafficCar(center);
            for (int i = 0; i < targetPeds; i++) SpawnPed(center);
        }

        void Update()
        {
            tick -= Time.deltaTime;
            if (tick > 0f || GameManager.Instance == null || !GameManager.Instance.Running) return;
            tick = 1.2f;

            Vector3 center = GameManager.Instance.player.ActivePosition;

            // cull far entities (never mission targets or the player's ride)
            for (int i = peds.Count - 1; i >= 0; i--)
            {
                var p = peds[i];
                if (p == null) { peds.RemoveAt(i); continue; }
                if (!p.isTarget && !p.isBoss &&
                    Vector3.Distance(p.transform.position, center) > cullRadius)
                { peds.RemoveAt(i); Destroy(p.gameObject); }
            }
            for (int i = vehicles.Count - 1; i >= 0; i--)
            {
                var v = vehicles[i];
                if (v == null) { vehicles.RemoveAt(i); continue; }
                if (!v.playerDriven && Vector3.Distance(v.transform.position, center) > cullRadius + 40f)
                { vehicles.RemoveAt(i); Destroy(v.gameObject); }
            }

            // top up nearby population
            int nearPeds = 0;
            foreach (var p in peds)
                if (p != null && !p.hostile && Vector3.Distance(p.transform.position, center) < activeRadius) nearPeds++;
            if (nearPeds < targetPeds) SpawnPed(center);

            int nearCars = 0;
            foreach (var v in vehicles)
                if (v != null && v.ai != null && Vector3.Distance(v.transform.position, center) < activeRadius + 40f) nearCars++;
            if (nearCars < targetTraffic) SpawnTrafficCar(center);
        }

        void SpawnPed(Vector3 center)
        {
            Vector2 dir = Random.insideUnitCircle.normalized;
            Vector3 pos = center + new Vector3(dir.x, 0f, dir.y) * Random.Range(35f, activeRadius);
            if (!CityGenerator.InsideWorld(pos)) return;
            if (Physics.CheckSphere(pos + Vector3.up, 0.5f)) return; // inside a building
            PedestrianAI.Build(pos);
        }

        void SpawnTrafficCar(Vector3 center)
        {
            Vector3 pos = CityGenerator.RandomLanePointNear(center, activeRadius + 30f, out float heading);
            if (Vector3.Distance(pos, center) < 25f) return; // don't pop in on screen
            var v = VehicleController.Build(Random.Range(0, 5), pos, heading, true);
            v.Drive(0.5f, 0f, false);
        }

        // ---- registry ----
        public void RegisterPed(PedestrianAI p) { if (!peds.Contains(p)) peds.Add(p); }
        public void UnregisterPed(PedestrianAI p) { peds.Remove(p); }
        public void RegisterVehicle(VehicleController v) { if (!vehicles.Contains(v)) vehicles.Add(v); }
        public void UnregisterVehicle(VehicleController v) { vehicles.Remove(v); }
        public void RegisterCop(CopAI c) { if (!cops.Contains(c)) cops.Add(c); }
        public void UnregisterCop(CopAI c) { cops.Remove(c); }

        public void DespawnCops()
        {
            for (int i = cops.Count - 1; i >= 0; i--)
                if (cops[i] != null) Destroy(cops[i].gameObject);
            cops.Clear();
            for (int i = vehicles.Count - 1; i >= 0; i--)
            {
                var v = vehicles[i];
                if (v != null && v.ai != null && v.ai.aiMode == VehicleAIMode.Chase)
                { vehicles.RemoveAt(i); Destroy(v.gameObject); }
            }
        }

        // ---- queries ----
        public VehicleController NearestVehicle(Vector3 pos, float maxDist)
        {
            VehicleController best = null;
            float bestD = maxDist * maxDist;
            foreach (var v in vehicles)
            {
                if (v == null || v.exploded) continue;
                float d = (v.transform.position - pos).sqrMagnitude;
                if (d < bestD) { bestD = d; best = v; }
            }
            return best;
        }

        public Transform NearestThreat(Vector3 pos, float maxDist)
        {
            Transform best = null;
            float bestD = maxDist * maxDist;
            foreach (var c in cops)
            {
                if (c == null) continue;
                float d = (c.transform.position - pos).sqrMagnitude;
                if (d < bestD) { bestD = d; best = c.transform; }
            }
            foreach (var p in peds)
            {
                if (p == null || !p.hostile) continue;
                float d = (p.transform.position - pos).sqrMagnitude;
                if (d < bestD) { bestD = d; best = p.transform; }
            }
            return best;
        }

        public void PanicNear(Vector3 pos, float radius)
        {
            foreach (var p in peds)
            {
                if (p == null || p.hostile) continue;
                if (Vector3.Distance(p.transform.position, pos) < radius)
                    p.Panic(4f);
            }
        }
    }
}
