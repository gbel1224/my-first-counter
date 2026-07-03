using UnityEngine;

namespace PalmCity
{
    /// Cheap stylized effects built from primitives — no particle assets needed.
    public static class FX
    {
        public static void Burst(Vector3 pos, Color color, int count, float force)
        {
            for (int i = 0; i < count; i++)
            {
                var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
                Object.Destroy(go.GetComponent<Collider>());
                float s = Random.Range(0.12f, 0.35f);
                go.transform.position = pos + Random.insideUnitSphere * 0.5f;
                go.transform.localScale = Vector3.one * s;
                go.transform.rotation = Random.rotation;
                go.GetComponent<Renderer>().material = Mats.Solid(color);
                var rb = go.AddComponent<Rigidbody>();
                rb.mass = 0.1f;
                rb.SetVelocity(Random.onUnitSphere * Random.Range(force * 0.3f, force) + Vector3.up * force * 0.4f);
                rb.angularVelocity = Random.onUnitSphere * 10f;
                go.AddComponent<DebrisChunk>().life = Random.Range(0.6f, 1.4f);
            }
        }

        public static void Flash(Vector3 pos, Color color, float range, float duration = 0.12f)
        {
            var go = new GameObject("Flash");
            go.transform.position = pos + Vector3.up * 1.5f;
            var l = go.AddComponent<Light>();
            l.type = LightType.Point;
            l.color = color;
            l.range = range;
            l.intensity = 4f;
            Object.Destroy(go, duration);
        }

        public static void Tracer(Vector3 from, Vector3 to, Color color, float width = 0.05f)
        {
            var go = new GameObject("Tracer");
            var lr = go.AddComponent<LineRenderer>();
            lr.positionCount = 2;
            lr.SetPosition(0, from);
            lr.SetPosition(1, to);
            lr.startWidth = width;
            lr.endWidth = width * 0.4f;
            lr.material = Mats.Emissive(color, 3f);
            Object.Destroy(go, 0.06f);
        }
    }

    public class DebrisChunk : MonoBehaviour
    {
        public float life = 1f;
        float t;

        void Update()
        {
            t += Time.deltaTime;
            float k = 1f - t / life;
            if (k <= 0f) { Destroy(gameObject); return; }
            transform.localScale = transform.localScale.normalized * Mathf.Max(0.01f, k * 0.3f);
        }
    }
}
