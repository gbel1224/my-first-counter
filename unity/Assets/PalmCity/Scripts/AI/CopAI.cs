using UnityEngine;

namespace PalmCity
{
    /// Foot cop: chases the player. At 1 star he tries to bust you up close;
    /// at 2+ stars he opens fire.
    public class CopAI : MonoBehaviour, IDamageable
    {
        public float hp = 60f;

        CharacterController cc;
        float fireCd;
        bool dead;

        public static CopAI Build(Vector3 pos)
        {
            var go = new GameObject("Cop");
            go.transform.position = pos + Vector3.up * 0.1f;

            var cc = go.AddComponent<CharacterController>();
            cc.height = 1.7f; cc.radius = 0.3f; cc.center = new Vector3(0f, 0.85f, 0f);

            var lib = VisualLibrary.I;
            if (lib != null && lib.copModel != null)
            {
                VisualLibrary.FitHeight(lib.copModel, go.transform, 1.75f);
            }
            else
            {
                var body = GameObject.CreatePrimitive(PrimitiveType.Capsule);
                Destroy(body.GetComponent<Collider>());
                body.transform.SetParent(go.transform, false);
                body.transform.localPosition = new Vector3(0f, 0.8f, 0f);
                body.transform.localScale = new Vector3(0.55f, 0.55f, 0.55f);
                body.GetComponent<Renderer>().material = Mats.Solid(new Color(0.13f, 0.19f, 0.31f));

                var head = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                Destroy(head.GetComponent<Collider>());
                head.transform.SetParent(go.transform, false);
                head.transform.localPosition = new Vector3(0f, 1.55f, 0f);
                head.transform.localScale = Vector3.one * 0.35f;
                head.GetComponent<Renderer>().material = Mats.Solid(new Color(0.91f, 0.73f, 0.54f));

                var badge = GameObject.CreatePrimitive(PrimitiveType.Cube);
                Destroy(badge.GetComponent<Collider>());
                badge.transform.SetParent(go.transform, false);
                badge.transform.localPosition = new Vector3(0f, 1.05f, 0.2f);
                badge.transform.localScale = new Vector3(0.15f, 0.15f, 0.05f);
                badge.GetComponent<Renderer>().material = Mats.Emissive(new Color(1f, 0.85f, 0.2f), 1.5f);
            }

            var cop = go.AddComponent<CopAI>();
            if (MinimapCamera.I != null) MinimapCamera.AddBlip(go.transform, new Color(0.25f, 0.6f, 1f), 5f);
            EntityPopulator.Instance.RegisterCop(cop);
            return cop;
        }

        void Awake() { cc = GetComponent<CharacterController>(); }

        void Update()
        {
            if (dead || GameManager.Instance == null || !GameManager.Instance.Running) return;
            var player = GameManager.Instance.player;
            int stars = WantedSystem.Instance.Stars;
            if (player == null || stars == 0) { cc.SimpleMove(Vector3.zero); return; }

            Vector3 to = player.ActivePosition - transform.position;
            to.y = 0f;
            float dist = to.magnitude;
            Vector3 dir = to.normalized;
            transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(dir), Time.deltaTime * 8f);

            if (dist > 2f) cc.SimpleMove(dir * (3.6f + stars * 0.3f));
            else cc.SimpleMove(Vector3.zero);

            if (stars >= 2 && dist < 38f)
            {
                fireCd -= Time.deltaTime;
                if (fireCd <= 0f)
                {
                    fireCd = Random.Range(0.8f, 1.6f) / (1f + stars * 0.15f);
                    Shoot(player, stars);
                }
            }
            else if (stars == 1 && !player.InVehicle && dist < 1.6f)
            {
                player.Die(true); // busted
            }
        }

        void Shoot(PlayerController player, int stars)
        {
            Vector3 origin = transform.position + Vector3.up * 1.3f;
            Vector3 dir = (player.ActivePosition + Vector3.up * 1f - origin).normalized;
            dir = Quaternion.Euler(0f, Random.Range(-4f, 4f), 0f) * dir;

            Vector3 end = origin + dir * 40f;
            if (Physics.Raycast(origin, dir, out RaycastHit hit, 40f))
            {
                end = hit.point;
                var pc = hit.collider.GetComponentInParent<PlayerController>();
                if (pc != null) pc.TakeDamage(6f + stars, hit.point, gameObject);
                else
                {
                    var vc = hit.collider.GetComponentInParent<VehicleController>();
                    if (vc != null && vc.playerDriven) vc.TakeDamage(4f + stars, hit.point, gameObject);
                }
            }
            FX.Tracer(origin, end, new Color(0.6f, 0.8f, 1f));
            Sfx.Play("pop", 0.25f);
        }

        public void TakeDamage(float amount, Vector3 hitPoint, GameObject source)
        {
            if (dead) return;
            hp -= amount;
            FX.Burst(hitPoint == Vector3.zero ? transform.position + Vector3.up : hitPoint,
                new Color(0.7f, 0.15f, 0.15f), 4, 3f);
            if (hp <= 0f) Die(Vector3.up * 3f);
        }

        public void Die(Vector3 impulse)
        {
            if (dead) return;
            dead = true;

            Sfx.Play("hit", 0.6f);
            GameManager.Instance.RegisterCopKill();
            Pickup.Drop(transform.position, PickupKind.Cash, Random.Range(20, 61));
            if (Random.value < 0.4f) Pickup.Drop(transform.position + Vector3.forward, PickupKind.Armor, 0);

            cc.enabled = false;
            var rb = gameObject.AddComponent<Rigidbody>();
            rb.mass = 70f;
            rb.AddForce(impulse * 0.6f + Vector3.up * 2f, ForceMode.VelocityChange);
            rb.AddTorque(Random.onUnitSphere * 12f, ForceMode.VelocityChange);
            var cap = gameObject.AddComponent<CapsuleCollider>();
            cap.height = 1.7f; cap.radius = 0.3f; cap.center = new Vector3(0f, 0.85f, 0f);

            EntityPopulator.Instance.UnregisterCop(this);
            enabled = false;
            Destroy(gameObject, 8f);
        }

        void OnDestroy()
        {
            if (!dead && EntityPopulator.Instance != null) EntityPopulator.Instance.UnregisterCop(this);
        }
    }
}
