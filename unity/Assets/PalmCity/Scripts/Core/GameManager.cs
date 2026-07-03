using UnityEngine;
using UnityEngine.SceneManagement;

namespace PalmCity
{
    public enum GameMode { Story, FreeRoam }

    public class GameManager : MonoBehaviour
    {
        public static GameManager Instance;

        public GameMode mode = GameMode.Story;
        public float cash = 25f;
        public int xp = 0, level = 1, xpNext = 100;
        public int rampage;
        float rampageTimer;

        [HideInInspector] public PlayerController player;
        [HideInInspector] public int missionKills;
        [HideInInspector] public bool bossDead;

        public bool Running { get; private set; }

        void Awake() { Instance = this; }

        public void Begin(bool freeRoam, bool loadSave)
        {
            CityGenerator.Instance.Generate();

            Vector3 spawn = CityGenerator.Intersection(3, 3) + new Vector3(4f, 0f, 4f);
            player = PlayerController.Build(spawn);
            PlayerCamera.Build(player.transform);
            HUDBuilder.Build();
            EntityPopulator.Instance.InitialSpawn();

            mode = freeRoam ? GameMode.FreeRoam : GameMode.Story;
            var weapons = player.GetComponent<WeaponSystem>();

            if (freeRoam)
            {
                cash = 5000f;
                for (int i = 1; i < weapons.defs.Length; i++) weapons.Give(i, weapons.defs[i].cap);
                weapons.current = 2;
                HUDBuilder.I.SetMission("FREE ROAM — the city is yours.");
            }
            else
            {
                SaveData d = loadSave ? SaveSystem.Load() : null;
                if (d != null) SaveSystem.Apply(d, this, player, weapons);
                else weapons.Give(2, 24); // starter pistol ammo
                weapons.current = 0;
                MissionManager.Instance.StartChapter(d != null ? d.chapter : 0);
                InvokeRepeating(nameof(AutoSave), 20f, 20f);
            }

            Running = true;
            HUDBuilder.I.Refresh();
        }

        void AutoSave()
        {
            if (Running && mode == GameMode.Story) SaveSystem.Save(this, player, player.GetComponent<WeaponSystem>());
        }

        void Update()
        {
            if (!Running) return;
            if (rampageTimer > 0f)
            {
                rampageTimer -= Time.deltaTime;
                if (rampageTimer <= 0f) { rampage = 0; HUDBuilder.I.SetRampage(0); }
            }
        }

        public void AddCash(float n)
        {
            cash += n;
            if (n > 0f) Sfx.Play("cash", 0.5f);
            HUDBuilder.I.FlashCredit(n);
            HUDBuilder.I.Refresh();
        }

        public void AddXP(int n)
        {
            xp += n;
            while (xp >= xpNext)
            {
                xp -= xpNext;
                xpNext = Mathf.RoundToInt(xpNext * 1.35f);
                level++;
                player.maxHp += 8f;
                player.hp = player.maxHp;
                HUDBuilder.I.Toast("LEVEL UP!", "Level " + level + " — max health raised");
            }
            HUDBuilder.I.Refresh();
        }

        public void BumpRampage()
        {
            rampage++;
            rampageTimer = 3.2f;
            if (rampage >= 3)
            {
                HUDBuilder.I.SetRampage(rampage);
                AddCash(rampage * 4);
            }
        }

        public void RegisterPedKill(PedestrianAI ped, bool byExplosion)
        {
            BumpRampage();
            AddXP(3);
            WantedSystem.Instance.Heat(byExplosion ? 1.2f : 0.9f);
            if (ped.isTarget) missionKills++;
            if (ped.isBoss) bossDead = true;
        }

        public void RegisterCopKill()
        {
            BumpRampage();
            AddXP(8);
            WantedSystem.Instance.Heat(1.3f);
        }

        public void PlayerDown(bool busted)
        {
            if (!Running) return;
            Running = false;
            Time.timeScale = 0f;
            float fee = Mathf.Round(cash * (busted ? 0.10f : 0.15f));
            HUDBuilder.I.ShowDeath(busted, fee);
        }

        public void Respawn(bool wasBusted, float fee)
        {
            cash = Mathf.Max(0f, cash - fee);
            var weapons = player.GetComponent<WeaponSystem>();
            if (wasBusted) weapons.ConfiscateGuns();

            player.ResetAfterDeath(CityGenerator.RandomIntersection() + new Vector3(3f, 0f, 3f));
            WantedSystem.Instance.ClearWanted();
            EntityPopulator.Instance.DespawnCops();

            Time.timeScale = 1f;
            Running = true;
            HUDBuilder.I.HideDeath();
            HUDBuilder.I.Refresh();
        }

        public void TogglePause(bool paused)
        {
            if (!Running && !paused) return;
            Time.timeScale = paused ? 0f : 1f;
        }

        public void SaveNow()
        {
            SaveSystem.Save(this, player, player.GetComponent<WeaponSystem>());
            HUDBuilder.I.Toast("SAVED", "Progress stored");
        }

        public void RestartCity()
        {
            Time.timeScale = 1f;
            SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex);
        }
    }
}
