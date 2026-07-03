using UnityEngine;

namespace PalmCity
{
    public interface IDamageable
    {
        void TakeDamage(float amount, Vector3 hitPoint, GameObject source);
    }
}
