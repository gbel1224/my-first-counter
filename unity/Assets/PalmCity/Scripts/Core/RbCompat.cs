using UnityEngine;

namespace PalmCity
{
    /// Unity 6 renamed Rigidbody.velocity to linearVelocity.
    /// These extensions compile correctly on both old and new versions.
    public static class RbCompat
    {
        public static Vector3 Velocity(this Rigidbody rb)
        {
#if UNITY_6000_0_OR_NEWER
            return rb.linearVelocity;
#else
            return rb.velocity;
#endif
        }

        public static void SetVelocity(this Rigidbody rb, Vector3 v)
        {
#if UNITY_6000_0_OR_NEWER
            rb.linearVelocity = v;
#else
            rb.velocity = v;
#endif
        }
    }
}
