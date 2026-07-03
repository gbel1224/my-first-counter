using System.IO;
using UnityEngine;

namespace PalmCity
{
    [System.Serializable]
    public class SaveData
    {
        public float cash;
        public int xp, level, xpNext, chapter;
        public float maxHp;
        public bool[] owned;
        public int[] ammo;
        public float posX, posZ;
        public float timeOfDay;
    }

    public static class SaveSystem
    {
        static string Path => Application.persistentDataPath + "/palmcity_save.json";

        public static void Save(GameManager g, PlayerController p, WeaponSystem w)
        {
            var d = new SaveData
            {
                cash = g.cash, xp = g.xp, level = g.level, xpNext = g.xpNext,
                chapter = MissionManager.Instance != null ? MissionManager.Instance.chapter : 0,
                maxHp = p.maxHp,
                owned = (bool[])w.owned.Clone(),
                ammo = new int[w.defs.Length],
                posX = p.transform.position.x, posZ = p.transform.position.z,
                timeOfDay = DayNightCycle.Instance != null ? DayNightCycle.Instance.minutes : 480f
            };
            for (int i = 0; i < w.defs.Length; i++) d.ammo[i] = w.defs[i].ammo;
            try { File.WriteAllText(Path, JsonUtility.ToJson(d)); } catch { }
        }

        public static SaveData Load()
        {
            try
            {
                if (!File.Exists(Path)) return null;
                return JsonUtility.FromJson<SaveData>(File.ReadAllText(Path));
            }
            catch { return null; }
        }

        public static void Apply(SaveData d, GameManager g, PlayerController p, WeaponSystem w)
        {
            g.cash = d.cash; g.xp = d.xp; g.level = d.level; g.xpNext = d.xpNext;
            p.maxHp = d.maxHp > 0 ? d.maxHp : 100f;
            p.hp = p.maxHp;
            if (d.owned != null)
                for (int i = 0; i < w.owned.Length && i < d.owned.Length; i++) w.owned[i] = d.owned[i];
            if (d.ammo != null)
                for (int i = 0; i < w.defs.Length && i < d.ammo.Length; i++) w.defs[i].ammo = d.ammo[i];
            if (d.posX != 0f || d.posZ != 0f)
                p.Teleport(new Vector3(d.posX, 0f, d.posZ));
            if (DayNightCycle.Instance != null) DayNightCycle.Instance.minutes = d.timeOfDay;
        }
    }
}
