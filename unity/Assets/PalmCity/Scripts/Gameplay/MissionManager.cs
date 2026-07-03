using System.Collections.Generic;
using UnityEngine;

namespace PalmCity
{
    public class Chapter
    {
        public string title, text;
        public int reward, xpReward, killsNeeded, buyCost;
        public bool lootBonus;
        public System.Action setup;
        public System.Func<bool> check;
    }

    /// The 12-chapter story arc, ported from the web version.
    public class MissionManager : MonoBehaviour
    {
        public static MissionManager Instance;

        public int chapter;
        Chapter active;
        GameObject marker;
        Vector3 markerPos;
        float markerRadius;
        readonly List<PedestrianAI> targets = new List<PedestrianAI>();

        void Awake() { Instance = this; }

        public void StartChapter(int index)
        {
            var gm = GameManager.Instance;
            if (index >= Chapters().Count)
            {
                HUDBuilder.I.Toast("CITY CONQUERED", "You own Palm City. Free roam unlocked.");
                gm.mode = GameMode.FreeRoam;
                active = null;
                ClearMarker();
                HUDBuilder.I.SetMission("");
                return;
            }
            chapter = index;
            gm.missionKills = 0;
            gm.bossDead = false;
            gm.rampage = 0;
            targets.Clear();
            ClearMarker();

            active = Chapters()[index];
            if (active.setup != null) active.setup();
            RefreshMissionText();
        }

        void Update()
        {
            var gm = GameManager.Instance;
            if (active == null || gm == null || !gm.Running || gm.mode == GameMode.FreeRoam) return;

            // pulse the marker
            if (marker != null)
            {
                float pulse = 1f + Mathf.Sin(Time.time * 4f) * 0.15f;
                marker.transform.localScale = new Vector3(markerRadius * 2f * pulse, 0.3f, markerRadius * 2f * pulse);
            }

            if (active.killsNeeded > 0 || chapter == 7) RefreshMissionText();

            if (active.check())
            {
                var done = active;
                active = null;
                if (done.buyCost > 0) gm.AddCash(-done.buyCost);
                gm.AddCash(done.reward);
                gm.AddXP(done.xpReward);
                if (done.lootBonus) gm.AddCash(500);
                HUDBuilder.I.Toast("MISSION COMPLETE", "+$" + done.reward + "  +" + done.xpReward + " XP");
                ClearMarker();
                gm.SaveNow();
                Invoke(nameof(NextChapter), 1.2f);
            }
        }

        void NextChapter() => StartChapter(chapter + 1);

        void RefreshMissionText()
        {
            if (active == null) return;
            var gm = GameManager.Instance;
            string extra = "";
            if (active.killsNeeded > 0) extra = " (" + gm.missionKills + "/" + active.killsNeeded + ")";
            if (chapter == 7) extra = " (x" + gm.rampage + "/8)";
            HUDBuilder.I.SetMission(active.title + "\n" + active.text + extra);
        }

        // ---- marker + spawn helpers ----
        void PlaceMarker(Vector3 pos, float radius)
        {
            ClearMarker();
            markerPos = pos;
            markerRadius = radius;
            marker = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            Destroy(marker.GetComponent<Collider>());
            marker.name = "MissionMarker";
            marker.transform.position = new Vector3(pos.x, 0.15f, pos.z);
            var mat = Mats.Emissive(new Color(1f, 0.82f, 0.25f), 1.2f);
            Color c = mat.color; c.a = 0.5f; mat.color = c;
            marker.GetComponent<Renderer>().material = mat;
            if (MinimapCamera.I != null) MinimapCamera.AddBlip(marker.transform, new Color(1f, 0.82f, 0.25f), 9f);
        }

        void ClearMarker() { if (marker != null) Destroy(marker); marker = null; }

        bool AtMarker()
        {
            if (marker == null) return false;
            Vector3 p = GameManager.Instance.player.ActivePosition;
            return Vector2.Distance(new Vector2(p.x, p.z), new Vector2(markerPos.x, markerPos.z)) < markerRadius;
        }

        void SpawnTargets(int n)
        {
            var center = GameManager.Instance.player.ActivePosition;
            for (int i = 0; i < n; i++)
            {
                Vector2 dir = Random.insideUnitCircle.normalized;
                Vector3 pos = center + new Vector3(dir.x, 0f, dir.y) * Random.Range(30f, 70f);
                if (!CityGenerator.InsideWorld(pos)) pos = CityGenerator.RandomIntersection();
                var t = PedestrianAI.Build(pos, hostile: true);
                t.isTarget = true;
                targets.Add(t);
            }
        }

        void SpawnBoss(float bossHp)
        {
            var center = GameManager.Instance.player.ActivePosition;
            Vector2 dir = Random.insideUnitCircle.normalized;
            Vector3 pos = center + new Vector3(dir.x, 0f, dir.y) * Random.Range(40f, 70f);
            if (!CityGenerator.InsideWorld(pos)) pos = CityGenerator.RandomIntersection();
            var boss = PedestrianAI.Build(pos, hostile: true, boss: true, bossHp: bossHp);
            boss.isTarget = true; // counts toward kill tallies too
            // bodyguards
            for (int i = 0; i < 2; i++)
            {
                var g = PedestrianAI.Build(pos + new Vector3(Random.Range(-5f, 5f), 0f, Random.Range(-5f, 5f)), hostile: true);
                g.isTarget = true;
                targets.Add(g);
            }
        }

        Vector3 FarRoadPoint() =>
            CityGenerator.RandomRoadPointNear(GameManager.Instance.player.ActivePosition, 120f, 350f);

        // ---- the story ----
        List<Chapter> cached;
        List<Chapter> Chapters()
        {
            if (cached != null) return cached;
            var gm = GameManager.Instance;
            cached = new List<Chapter>
            {
                new Chapter { title = "Ch.1 — Fresh Off The Bus",
                    text = "Steal any car to get moving.", reward = 120, xpReward = 40,
                    check = () => gm.player.InVehicle },

                new Chapter { title = "Ch.2 — Odd Jobs",
                    text = "Drive to the marked delivery point.", reward = 180, xpReward = 55,
                    setup = () => PlaceMarker(FarRoadPoint(), 8f),
                    check = AtMarker },

                new Chapter { title = "Ch.3 — Muscle Work",
                    text = "Take out 2 rival thugs (red).", reward = 260, xpReward = 80, killsNeeded = 2,
                    setup = () => SpawnTargets(2),
                    check = () => gm.missionKills >= 2 },

                new Chapter { title = "Ch.4 — Grand Theft Auto",
                    text = "Steal a car and bring it to the garage marker.", reward = 340, xpReward = 110,
                    setup = () => PlaceMarker(FarRoadPoint(), 9f),
                    check = () => gm.player.InVehicle && !gm.player.vehicle.type.isCop && AtMarker() },

                new Chapter { title = "Ch.5 — Heat",
                    text = "You're wanted. Survive and lose the cops.", reward = 400, xpReward = 150,
                    setup = () => WantedSystem.Instance.Heat(3.2f),
                    check = () => WantedSystem.Instance.Stars == 0 },

                new Chapter { title = "Ch.6 — Turf War",
                    text = "Capture the block — wipe out 4 gang members.", reward = 520, xpReward = 200, killsNeeded = 4,
                    setup = () => SpawnTargets(4),
                    check = () => gm.missionKills >= 4 },

                new Chapter { title = "Ch.7 — The Big Score",
                    text = "Hit the bank marker and escape with the loot.", reward = 700, xpReward = 260, lootBonus = true,
                    setup = () => PlaceMarker(FarRoadPoint(), 9f),
                    check = AtMarker },

                new Chapter { title = "Ch.8 — Rampage",
                    text = "Cause mayhem: reach rampage x8.", reward = 600, xpReward = 240,
                    check = () => gm.rampage >= 8 },

                new Chapter { title = "Ch.9 — Nemesis Rising",
                    text = "Chase down the crime boss's convoy.", reward = 800, xpReward = 320, killsNeeded = 3,
                    setup = () => { SpawnBoss(160f); },
                    check = () => gm.missionKills >= 3 && gm.bossDead },

                new Chapter { title = "Ch.10 — Empire",
                    text = "Reach the marker and buy your first business ($500).", reward = 400, xpReward = 300, buyCost = 500,
                    setup = () => PlaceMarker(FarRoadPoint(), 9f),
                    check = () => AtMarker() && gm.cash >= 500f },

                new Chapter { title = "Ch.11 — All-Out War",
                    text = "Final gang assault — eliminate 6 enemies.", reward = 1200, xpReward = 500, killsNeeded = 6,
                    setup = () => SpawnTargets(6),
                    check = () => gm.missionKills >= 6 },

                new Chapter { title = "Ch.12 — Kingpin",
                    text = "Defeat the Nemesis. Take the city.", reward = 5000, xpReward = 1000,
                    setup = () => SpawnBoss(400f),
                    check = () => gm.bossDead },
            };
            return cached;
        }
    }
}
