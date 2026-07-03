using System.Collections;
using UnityEngine;

namespace PalmCity
{
    [System.Serializable]
    public class VehicleType
    {
        public string name;
        public Color color;
        public float topSpeed, accel, turnRate; // m/s, m/s², deg/s
        public Vector3 dims;                    // length, height, width
        public bool isCop, isBike;

        public VehicleType(string n, Color c, float top, float acc, float turn, Vector3 d, bool cop = false, bool bike = false)
        { name = n; color = c; topSpeed = top; accel = acc; turnRate = turn; dims = d; isCop = cop; isBike = bike; }
    }

    /// Arcade vehicle: rigidbody kept upright, speed-scaled steering,
    /// impact damage, burn-then-explode with chain reactions.
    public class VehicleController : MonoBehaviour, IDamageable
    {
        public static readonly VehicleType[] Types =
        {
            new VehicleType("Sedan",  new Color(0.85f, 0.31f, 0.31f), 22f, 9f,  70f, new Vector3(4.4f, 1.4f, 1.9f)),
            new VehicleType("Sport",  new Color(0.96f, 0.77f, 0.23f), 34f, 14f, 95f, new Vector3(4.3f, 1.2f, 1.9f)),
            new VehicleType("Taxi",   new Color(0.95f, 0.69f, 0.12f), 21f, 9f,  70f, new Vector3(4.4f, 1.4f, 1.9f)),
            new VehicleType("Van",    new Color(0.35f, 0.53f, 0.79f), 18f, 7f,  55f, new Vector3(5.0f, 2.0f, 2.1f)),
            new VehicleType("Muscle", new Color(0.23f, 0.25f, 0.29f), 31f, 13f, 80f, new Vector3(4.6f, 1.3f, 2.0f)),
            new VehicleType("Cop",    new Color(0.17f, 0.23f, 0.33f), 33f, 14f, 90f, new Vector3(4.5f, 1.4f, 1.9f), cop: true),
            new VehicleType("Bike",   new Color(0.88f, 0.31f, 0.78f), 36f, 15f, 120f, new Vector3(2.2f, 1.0f, 0.7f), bike: true),
        };

        public VehicleType type;
        public int typeIndex;
        public float hp = 100f;
        public bool playerDriven, exploded;
        [HideInInspector] public VehicleAI ai;

        Rigidbody rb;
        float speed;
        float inThrottle, inSteer;
        bool inBrake, burning;
        Renderer bodyRenderer;
        GameObject lightBar, headlights;

        public float Speed => speed;

        public static VehicleController Build(int typeIdx, Vector3 pos, float yawDeg, bool withDriverAI)
        {
            var t = Types[typeIdx];
            var go = new GameObject("Vehicle_" + t.name);
            go.transform.position = pos + Vector3.up * (t.dims.y / 2f + 0.3f);
            go.transform.rotation = Quaternion.Euler(0f, yawDeg, 0f);

            var rb = go.AddComponent<Rigidbody>();
            rb.mass = t.isBike ? 250f : 1300f;
            rb.constraints = RigidbodyConstraints.FreezeRotationX | RigidbodyConstraints.FreezeRotationZ;
            rb.interpolation = RigidbodyInterpolation.Interpolate;

            var box = go.AddComponent<BoxCollider>();
            box.size = new Vector3(t.dims.z, t.dims.y, t.dims.x); // width, height, length (z = forward)
            box.center = new Vector3(0f, 0f, 0f);

            // body
            var body = GameObject.CreatePrimitive(PrimitiveType.Cube);
            Destroy(body.GetComponent<Collider>());
            body.transform.SetParent(go.transform, false);
            body.transform.localScale = new Vector3(t.dims.z, t.dims.y * 0.6f, t.dims.x);
            body.transform.localPosition = new Vector3(0f, -t.dims.y * 0.15f, 0f);
            var rend = body.GetComponent<Renderer>();
            rend.material = Mats.Solid(t.color);

            // cabin
            if (!t.isBike)
            {
                var cabin = GameObject.CreatePrimitive(PrimitiveType.Cube);
                Destroy(cabin.GetComponent<Collider>());
                cabin.transform.SetParent(go.transform, false);
                cabin.transform.localScale = new Vector3(t.dims.z * 0.85f, t.dims.y * 0.45f, t.dims.x * 0.45f);
                cabin.transform.localPosition = new Vector3(0f, t.dims.y * 0.28f, -t.dims.x * 0.05f);
                cabin.GetComponent<Renderer>().material = Mats.Solid(new Color(0.1f, 0.16f, 0.24f));
            }

            // wheels (visual only)
            var wheelMat = Mats.Solid(new Color(0.08f, 0.08f, 0.08f));
            float wx = t.dims.z / 2f, wz = t.dims.x * 0.32f, wy = -t.dims.y / 2f + 0.1f;
            foreach (var off in new[] { new Vector3(wx, wy, wz), new Vector3(-wx, wy, wz), new Vector3(wx, wy, -wz), new Vector3(-wx, wy, -wz) })
            {
                var wheel = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                Destroy(wheel.GetComponent<Collider>());
                wheel.transform.SetParent(go.transform, false);
                wheel.transform.localPosition = off;
                wheel.transform.localRotation = Quaternion.Euler(0f, 0f, 90f);
                wheel.transform.localScale = new Vector3(0.65f, 0.12f, 0.65f);
                wheel.GetComponent<Renderer>().material = wheelMat;
            }

            var vc = go.AddComponent<VehicleController>();
            vc.type = t; vc.typeIndex = typeIdx; vc.rb = rb; vc.bodyRenderer = rend;

            // headlights (emissive, toggled at night)
            vc.headlights = new GameObject("Headlights");
            vc.headlights.transform.SetParent(go.transform, false);
            var beamMat = Mats.Emissive(new Color(1f, 0.95f, 0.75f), 3f);
            foreach (var side in new[] { -t.dims.z * 0.3f, t.dims.z * 0.3f })
            {
                var h = GameObject.CreatePrimitive(PrimitiveType.Cube);
                Destroy(h.GetComponent<Collider>());
                h.transform.SetParent(vc.headlights.transform, false);
                h.transform.localPosition = new Vector3(side, -t.dims.y * 0.1f, t.dims.x / 2f);
                h.transform.localScale = new Vector3(0.3f, 0.15f, 0.06f);
                h.GetComponent<Renderer>().material = beamMat;
            }
            vc.headlights.SetActive(false);

            if (t.isCop) vc.BuildLightBar();
            if (withDriverAI) vc.ai = go.AddComponent<VehicleAI>();

            EntityPopulator.Instance.RegisterVehicle(vc);
            return vc;
        }

        void BuildLightBar()
        {
            lightBar = new GameObject("LightBar");
            lightBar.transform.SetParent(transform, false);
            lightBar.transform.localPosition = new Vector3(0f, type.dims.y * 0.55f, 0f);
            foreach (var side in new[] { -0.3f, 0.3f })
            {
                var l = GameObject.CreatePrimitive(PrimitiveType.Cube);
                Destroy(l.GetComponent<Collider>());
                l.transform.SetParent(lightBar.transform, false);
                l.transform.localPosition = new Vector3(side, 0f, 0f);
                l.transform.localScale = new Vector3(0.5f, 0.15f, 0.4f);
                l.GetComponent<Renderer>().material =
                    Mats.Emissive(side < 0f ? Color.red : Color.blue, 3f);
            }
        }

        public void Drive(float throttle, float steer, bool brake)
        {
            inThrottle = Mathf.Clamp(throttle, -1f, 1f);
            inSteer = Mathf.Clamp(steer, -1f, 1f);
            inBrake = brake;
        }

        public void ReleaseControls() { inThrottle = 0f; inSteer = 0f; inBrake = false; }

        public void Hijack()
        {
            if (ai != null) { ai.OnHijacked(); Destroy(ai); ai = null; }
            WantedSystem.Instance.Heat(0.6f);
        }

        void FixedUpdate()
        {
            if (exploded) return;
            float dt = Time.fixedDeltaTime;

            float target = inBrake ? 0f : inThrottle * type.topSpeed * (inThrottle < 0f ? 0.45f : 1f);
            float rate = (inBrake ? type.accel * 3f : type.accel);
            speed = Mathf.MoveTowards(speed, target, rate * dt);
            speed = Mathf.MoveTowards(speed, 0f, 2.5f * dt); // rolling resistance

            float steerScale = Mathf.Clamp(Mathf.Abs(speed) / 8f, 0f, 1.4f) * Mathf.Sign(speed >= 0f ? 1f : -1f);
            float yawDelta = inSteer * type.turnRate * steerScale * dt;
            rb.MoveRotation(rb.rotation * Quaternion.Euler(0f, yawDelta, 0f));

            Vector3 v = transform.forward * speed;
            v.y = rb.velocity.y;
            rb.velocity = v;

            if (lightBar != null)
            {
                bool sirenOn = !playerDriven || WantedSystem.Instance.Stars > 0;
                lightBar.SetActive(sirenOn && Mathf.FloorToInt(Time.time * 6f) % 2 == 0);
            }
            if (headlights != null)
            {
                bool wantOn = DayNightCycle.Instance != null && DayNightCycle.Instance.IsNight
                              && (playerDriven || ai != null);
                if (headlights.activeSelf != wantOn) headlights.SetActive(wantOn);
            }
        }

        void OnCollisionEnter(Collision c)
        {
            if (exploded) return;
            float impact = c.relativeVelocity.magnitude;

            // run over pedestrians / cops
            var ped = c.collider.GetComponentInParent<PedestrianAI>();
            if (ped != null && Mathf.Abs(speed) > 5f) { ped.Die(false, rb.velocity); return; }
            var cop = c.collider.GetComponentInParent<CopAI>();
            if (cop != null && Mathf.Abs(speed) > 6f) { cop.Die(rb.velocity); return; }

            if (impact > 8f)
            {
                TakeDamage(impact * 1.2f, c.GetContact(0).point, null);
                FX.Burst(c.GetContact(0).point, new Color(1f, 0.85f, 0.5f), 3, 3f);
                speed *= 0.5f;
                if (playerDriven) PlayerCamera.Shake(impact * 0.015f);
            }
        }

        public void TakeDamage(float amount, Vector3 hitPoint, GameObject source)
        {
            if (exploded) return;
            hp -= amount;
            if (hp <= 0f && !burning) StartCoroutine(BurnThenExplode());
        }

        IEnumerator BurnThenExplode()
        {
            burning = true;
            bodyRenderer.material = Mats.Solid(new Color(0.15f, 0.1f, 0.1f));
            float t = Random.Range(1.4f, 2.2f);
            while (t > 0f)
            {
                t -= 0.15f;
                FX.Burst(transform.position + Vector3.up, new Color(1f, 0.5f, 0.1f), 2, 3f);
                yield return new WaitForSeconds(0.15f);
            }
            exploded = true;
            if (playerDriven && GameManager.Instance.player != null)
            {
                GameManager.Instance.player.ExitVehicle();
                GameManager.Instance.player.TakeDamage(30f, transform.position, gameObject);
            }
            Explosion.Boom(transform.position, 8f, 100f);
            rb.constraints = RigidbodyConstraints.None;
            rb.AddForce(Vector3.up * 6f, ForceMode.VelocityChange);
            rb.AddTorque(Random.onUnitSphere * 4f, ForceMode.VelocityChange);
            Destroy(gameObject, 12f);
        }

        void OnDestroy()
        {
            if (EntityPopulator.Instance != null) EntityPopulator.Instance.UnregisterVehicle(this);
        }
    }
}
