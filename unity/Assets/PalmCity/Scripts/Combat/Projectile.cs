using UnityEngine;

namespace PalmCity
{
    /// RPG rocket: flies straight, explodes on contact or timeout.
    public class Projectile : MonoBehaviour
    {
        float damage;
        bool done;

        public static void Launch(Vector3 origin, Vector3 dir, float damage)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            go.name = "Rocket";
            go.transform.position = origin;
            go.transform.localScale = Vector3.one * 0.3f;
            go.GetComponent<Renderer>().material = Mats.Emissive(new Color(1f, 0.35f, 0.2f));

            var rb = go.AddComponent<Rigidbody>();
            rb.useGravity = false;
            rb.velocity = dir.normalized * 32f;

            var p = go.AddComponent<Projectile>();
            p.damage = damage;
            Destroy(go, 5f);
        }

        void Update()
        {
            // smoke trail
            if (Random.value < 0.5f) FX.Burst(transform.position, new Color(0.6f, 0.6f, 0.6f), 1, 0.5f);
        }

        void OnCollisionEnter(Collision c)
        {
            if (done) return;
            done = true;
            Explosion.Boom(transform.position, 8f, damage);
            Destroy(gameObject);
        }

        void OnDestroy()
        {
            if (!done && gameObject.scene.isLoaded)
                Explosion.Boom(transform.position, 8f, damage);
        }
    }
}
