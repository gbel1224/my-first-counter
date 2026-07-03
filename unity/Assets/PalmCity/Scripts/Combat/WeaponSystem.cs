using UnityEngine;

namespace PalmCity
{
    [System.Serializable]
    public class WeaponDef
    {
        public string name;
        public bool melee, rocket;
        public float damage, rate, range, spread;
        public int pellets = 1;
        public int ammo, cap;
    }

    /// Player weapon inventory + firing. Guns are hitscan with tracers;
    /// the RPG launches a Projectile. Same 7-slot lineup as the web game.
    public class WeaponSystem : MonoBehaviour
    {
        public WeaponDef[] defs;
        public bool[] owned;
        public int current;

        float fireCd, meleeCd;
        PlayerController player;

        void Awake()
        {
            player = GetComponent<PlayerController>();
            defs = new[]
            {
                new WeaponDef { name = "Fists",   melee = true, damage = 9,   rate = 0.32f, range = 1.6f },
                new WeaponDef { name = "Bat",     melee = true, damage = 18,  rate = 0.42f, range = 2.2f },
                new WeaponDef { name = "Pistol",  damage = 16,  rate = 0.30f, range = 45f,  spread = 1.5f,  cap = 120 },
                new WeaponDef { name = "SMG",     damage = 11,  rate = 0.09f, range = 40f,  spread = 4f,    cap = 240 },
                new WeaponDef { name = "Shotgun", damage = 9,   rate = 0.70f, range = 22f,  spread = 9f, pellets = 6, cap = 48 },
                new WeaponDef { name = "Rifle",   damage = 34,  rate = 0.50f, range = 70f,  spread = 0.6f,  cap = 90 },
                new WeaponDef { name = "RPG",     damage = 120, rate = 1.30f, range = 80f,  rocket = true,  cap = 8 },
            };
            owned = new bool[defs.Length];
            owned[0] = true;
        }

        void Update()
        {
            fireCd = Mathf.Max(0f, fireCd - Time.deltaTime);
            meleeCd = Mathf.Max(0f, meleeCd - Time.deltaTime);
        }

        public WeaponDef Current => defs[current];

        public void TryFire()
        {
            var w = Current;
            if (w.melee) { Melee(); return; }
            if (fireCd > 0f || w.ammo <= 0) return;
            fireCd = w.rate;
            w.ammo--;

            AimAtNearestThreat();
            Vector3 origin = player.ActivePosition + Vector3.up * 1.3f;
            Vector3 baseDir = player.InVehicle ? player.vehicle.transform.forward : transform.forward;

            if (w.rocket)
            {
                Projectile.Launch(origin + baseDir * 1.5f, baseDir, w.damage);
                PlayerCamera.Shake(0.35f);
                Sfx.Play("boom", 0.7f);
            }
            else
            {
                Sfx.Play(w.name == "Shotgun" ? "boom" : w.name == "Rifle" ? "crack" : "pop", 0.5f);
                for (int i = 0; i < w.pellets; i++)
                {
                    Vector3 dir = Quaternion.Euler(Random.Range(-w.spread, w.spread) * 0.4f,
                        Random.Range(-w.spread, w.spread), 0f) * baseDir;
                    FireHitscan(origin, dir, w);
                }
                PlayerCamera.Shake(0.05f);
            }
            WantedSystem.Instance.Heat(w.rocket ? 0.8f : 0.35f);
            EntityPopulator.Instance.PanicNear(origin, 25f);
            HUDBuilder.I.RefreshWeapon();
        }

        void FireHitscan(Vector3 origin, Vector3 dir, WeaponDef w)
        {
            Vector3 end = origin + dir * w.range;
            if (Physics.Raycast(origin, dir, out RaycastHit hit, w.range))
            {
                end = hit.point;
                var dmg = hit.collider.GetComponentInParent<IDamageable>();
                if (dmg != null && !(dmg is PlayerController))
                    dmg.TakeDamage(w.damage, hit.point, gameObject);
                else
                    FX.Burst(hit.point, new Color(1f, 0.9f, 0.6f), 2, 3f);
            }
            FX.Tracer(origin, end, new Color(1f, 0.95f, 0.6f));
        }

        public void Melee()
        {
            var w = defs[current].melee ? defs[current] : defs[owned[1] ? 1 : 0];
            if (meleeCd > 0f || player.InVehicle) return;
            meleeCd = w.rate;

            Vector3 center = transform.position + Vector3.up * 1f + transform.forward * w.range * 0.7f;
            var hits = Physics.OverlapSphere(center, w.range * 0.7f);
            bool connected = false;
            foreach (var h in hits)
            {
                var dmg = h.GetComponentInParent<IDamageable>();
                if (dmg == null || dmg is PlayerController) continue;
                dmg.TakeDamage(w.damage, center, gameObject);
                connected = true;
            }
            FX.Burst(center, Color.white, connected ? 4 : 2, 2f);
            if (connected) Sfx.Play("hit", 0.7f);
        }

        void AimAtNearestThreat()
        {
            if (player.InVehicle) return;
            Transform best = EntityPopulator.Instance.NearestThreat(transform.position, 30f);
            if (best != null)
            {
                Vector3 to = Vector3.ProjectOnPlane(best.position - transform.position, Vector3.up);
                if (to.sqrMagnitude > 0.1f) transform.rotation = Quaternion.LookRotation(to.normalized);
            }
        }

        public void Switch()
        {
            for (int i = 1; i <= defs.Length; i++)
            {
                int n = (current + i) % defs.Length;
                if (owned[n] && (defs[n].melee || defs[n].ammo > 0)) { current = n; break; }
            }
            HUDBuilder.I.RefreshWeapon();
        }

        public void Give(int idx, int ammo)
        {
            owned[idx] = true;
            if (!defs[idx].melee) defs[idx].ammo = Mathf.Min(defs[idx].ammo + ammo, defs[idx].cap);
            current = idx;
            if (HUDBuilder.I != null) HUDBuilder.I.RefreshWeapon();
        }

        public void ConfiscateGuns()
        {
            for (int i = 2; i < defs.Length; i++) { defs[i].ammo = 0; owned[i] = false; }
            current = owned[1] ? 1 : 0;
            HUDBuilder.I.RefreshWeapon();
        }
    }
}
