using UnityEngine;

namespace PalmCity
{
    /// Civilians wander and flee; hostiles (gang members / the boss)
    /// chase the player and attack with fists or guns.
    public class PedestrianAI : MonoBehaviour, IDamageable
    {
        public float hp = 30f, maxHp = 30f;
        public bool hostile, armed, isTarget, isBoss;
        public int cashDrop;

        CharacterController cc;
        Renderer bodyRenderer;
        Color shirtColor;
        Color skinColor;
        float speed, panic, decisionTimer, fireCd, meleeCd;
        Vector3 wanderDir;
        bool moving, dead;

        static readonly Color[] Skins =
        {
            new Color(0.91f, 0.73f, 0.54f), new Color(0.79f, 0.54f, 0.35f),
            new Color(0.54f, 0.35f, 0.23f), new Color(0.94f, 0.82f, 0.66f),
        };
        static readonly Color[] Shirts =
        {
            new Color(0.23f, 0.54f, 0.79f), new Color(0.79f, 0.31f, 0.48f),
            new Color(0.42f, 0.79f, 0.35f), new Color(0.95f, 0.77f, 0.23f),
            new Color(0.79f, 0.35f, 0.23f), new Color(0.60f, 0.42f, 0.79f),
            new Color(0.88f, 0.88f, 0.88f), new Color(0.20f, 0.23f, 0.27f),
        };

        public static PedestrianAI Build(Vector3 pos, bool hostile = false, bool boss = false, float bossHp = 160f)
        {
            var go = new GameObject(boss ? "Boss" : hostile ? "Gangster" : "Pedestrian");
            go.transform.position = pos + Vector3.up * 0.1f;

            var cc = go.AddComponent<CharacterController>();
            cc.height = 1.7f; cc.radius = 0.3f; cc.center = new Vector3(0f, 0.85f, 0f);

            var ped = go.AddComponent<PedestrianAI>();
            ped.hostile = hostile;
            ped.isBoss = boss;
            ped.shirtColor = boss ? new Color(0.05f, 0.05f, 0.05f)
                : hostile ? new Color(0.75f, 0.12f, 0.12f)
                : Shirts[Random.Range(0, Shirts.Length)];
            ped.skinColor = Skins[Random.Range(0, Skins.Length)];
            ped.speed = hostile ? 4.2f : Random.Range(1.3f, 2.2f);
            ped.hp = ped.maxHp = boss ? bossHp : hostile ? 45f : 30f;
            ped.armed = boss || (hostile && Random.value < 0.6f);
            ped.cashDrop = Random.Range(2, 41);

            // visuals
            var body = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            Destroy(body.GetComponent<Collider>());
            body.transform.SetParent(go.transform, false);
            body.transform.localPosition = new Vector3(0f, 0.8f, 0f);
            body.transform.localScale = new Vector3(0.55f, 0.55f, 0.55f) * (boss ? 1.25f : 1f);
            ped.bodyRenderer = body.GetComponent<Renderer>();
            ped.bodyRenderer.material = Mats.Solid(ped.shirtColor);

            var head = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            Destroy(head.GetComponent<Collider>());
            head.transform.SetParent(go.transform, false);
            head.transform.localPosition = new Vector3(0f, 1.55f, 0f) * (boss ? 1.2f : 1f);
            head.transform.localScale = Vector3.one * 0.35f * (boss ? 1.2f : 1f);
            head.GetComponent<Renderer>().material = Mats.Solid(ped.skinColor);

            if (hostile && MinimapCamera.I != null)
                MinimapCamera.AddBlip(go.transform, boss ? new Color(1f, 0.85f, 0.2f) : Color.red, boss ? 8f : 5f);

            EntityPopulator.Instance.RegisterPed(ped);
            return ped;
        }

        void Awake() { cc = GetComponent<CharacterController>(); }

        void Update()
        {
            if (dead || GameManager.Instance == null || !GameManager.Instance.Running) return;
            var player = GameManager.Instance.player;
            if (player == null) return;

            if (hostile) { HostileBehavior(player); return; }

            // civilians panic near an active wanted level
            if (WantedSystem.Instance.Stars > 0 &&
                Vector3.Distance(transform.position, player.ActivePosition) < 20f)
                panic = Mathf.Max(panic, 2f);

            if (panic > 0f)
            {
                panic -= Time.deltaTime;
                Vector3 away = transform.position - player.ActivePosition;
                away.y = 0f;
                Walk(away.normalized, speed + 2.5f);
            }
            else
            {
                decisionTimer -= Time.deltaTime;
                if (decisionTimer <= 0f)
                {
                    decisionTimer = Random.Range(1.5f, 4f);
                    wanderDir = Quaternion.Euler(0f, Random.Range(0f, 360f), 0f) * Vector3.forward;
                    moving = Random.value < 0.7f;
                }
                if (moving) Walk(wanderDir, speed);
                else cc.SimpleMove(Vector3.zero);
            }
        }

        public void Panic(float seconds)
        {
            if (!hostile) panic = Mathf.Max(panic, seconds);
        }

        void HostileBehavior(PlayerController player)
        {
            Vector3 to = player.ActivePosition - transform.position;
            to.y = 0f;
            float dist = to.magnitude;
            Vector3 dir = to.normalized;
            transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(dir), Time.deltaTime * 8f);

            if (armed)
            {
                fireCd -= Time.deltaTime;
                if (dist < 35f && fireCd <= 0f)
                {
                    fireCd = isBoss ? 0.5f : Random.Range(1f, 1.8f);
                    ShootAt(player);
                }
                if (dist > 12f) Walk(dir, speed);
                else cc.SimpleMove(Vector3.zero);
            }
            else
            {
                if (dist > 1.6f) Walk(dir, speed);
                else
                {
                    meleeCd -= Time.deltaTime;
                    if (meleeCd <= 0f)
                    {
                        meleeCd = 0.8f;
                        player.TakeDamage(6f, transform.position, gameObject);
                        FX.Burst(player.ActivePosition + Vector3.up, Color.white, 3, 2f);
                    }
                }
            }
        }

        void ShootAt(PlayerController player)
        {
            Vector3 origin = transform.position + Vector3.up * 1.3f;
            Vector3 targetPos = player.ActivePosition + Vector3.up * 1f;
            Vector3 dir = (targetPos - origin).normalized;
            dir = Quaternion.Euler(0f, Random.Range(-5f, 5f), 0f) * dir;

            Vector3 end = origin + dir * 45f;
            if (Physics.Raycast(origin, dir, out RaycastHit hit, 45f))
            {
                end = hit.point;
                var pc = hit.collider.GetComponentInParent<PlayerController>();
                if (pc != null) pc.TakeDamage(isBoss ? 14f : 8f, hit.point, gameObject);
                else
                {
                    var vc = hit.collider.GetComponentInParent<VehicleController>();
                    if (vc != null && vc.playerDriven) vc.TakeDamage(isBoss ? 10f : 5f, hit.point, gameObject);
                }
            }
            FX.Tracer(origin, end, new Color(1f, 0.5f, 0.4f));
            Sfx.Play("pop", 0.25f);
        }

        void Walk(Vector3 dir, float spd)
        {
            cc.SimpleMove(dir * spd);
            if (dir.sqrMagnitude > 0.01f && !hostile)
                transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(dir), Time.deltaTime * 6f);
            // if stuck against a wall, pick a new direction
            if (!hostile && cc.velocity.sqrMagnitude < 0.05f && spd > 0.5f)
                wanderDir = Quaternion.Euler(0f, 160f, 0f) * wanderDir;
        }

        public void TakeDamage(float amount, Vector3 hitPoint, GameObject source)
        {
            if (dead) return;
            hp -= amount;
            panic = 5f;
            FX.Burst(hitPoint == Vector3.zero ? transform.position + Vector3.up : hitPoint,
                new Color(0.7f, 0.15f, 0.15f), 4, 3f);
            if (hp <= 0f) Die(source == null, Vector3.up * 3f);
        }

        public void Die(bool byExplosion, Vector3 impulse)
        {
            if (dead) return;
            dead = true;

            Sfx.Play("hit", 0.6f);
            GameManager.Instance.RegisterPedKill(this, byExplosion);
            if (Random.value < 0.55f) Pickup.Drop(transform.position, PickupKind.Cash, cashDrop);
            if (isBoss) Pickup.Drop(transform.position + Vector3.right, PickupKind.Health, 0);

            // cheap ragdoll: swap controller for physics and let it tumble
            cc.enabled = false;
            var rb = gameObject.AddComponent<Rigidbody>();
            rb.mass = 70f;
            rb.AddForce(impulse * 0.6f + Vector3.up * 2f, ForceMode.VelocityChange);
            rb.AddTorque(Random.onUnitSphere * 12f, ForceMode.VelocityChange);
            var cap = gameObject.AddComponent<CapsuleCollider>();
            cap.height = 1.7f; cap.radius = 0.3f; cap.center = new Vector3(0f, 0.85f, 0f);

            EntityPopulator.Instance.UnregisterPed(this);
            enabled = false;
            Destroy(gameObject, 8f);
        }

        void OnDestroy()
        {
            if (!dead && EntityPopulator.Instance != null) EntityPopulator.Instance.UnregisterPed(this);
        }
    }
}
