using System.Collections.Generic;
using UnityEngine;

namespace PalmCity
{
    public static class Explosion
    {
        /// Area damage with falloff. Vehicles caught in the blast ignite and
        /// explode themselves shortly after — that's what chains reactions.
        public static void Boom(Vector3 pos, float radius, float damage)
        {
            FX.Burst(pos, new Color(1f, 0.55f, 0.15f), 18, 9f);
            FX.Burst(pos, new Color(0.35f, 0.35f, 0.35f), 10, 4f);
            FX.Flash(pos, new Color(1f, 0.6f, 0.2f), radius * 3f, 0.15f);
            PlayerCamera.Shake(0.5f);

            var seen = new HashSet<IDamageable>();
            foreach (var col in Physics.OverlapSphere(pos, radius))
            {
                var dmg = col.GetComponentInParent<IDamageable>();
                if (dmg == null || seen.Contains(dmg)) continue;
                seen.Add(dmg);
                float d = Vector3.Distance(col.ClosestPoint(pos), pos);
                float scaled = damage * Mathf.Clamp01(1f - d / radius * 0.6f);
                dmg.TakeDamage(scaled, pos, null);
            }
        }
    }
}
