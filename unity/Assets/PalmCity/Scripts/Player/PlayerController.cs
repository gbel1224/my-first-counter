using UnityEngine;

namespace PalmCity
{
    public class PlayerController : MonoBehaviour, IDamageable
    {
        public float hp = 100f, maxHp = 100f, armor;
        public float walkSpeed = 6f;

        [HideInInspector] public VehicleController vehicle; // null when on foot

        CharacterController cc;
        GameObject visuals;
        WeaponSystem weapons;
        bool dead;

        public bool InVehicle => vehicle != null;
        public Vector3 ActivePosition => InVehicle ? vehicle.transform.position : transform.position;

        public static PlayerController Build(Vector3 pos)
        {
            var go = new GameObject("Player");
            go.transform.position = pos + Vector3.up * 0.1f;

            var cc = go.AddComponent<CharacterController>();
            cc.height = 1.8f; cc.radius = 0.35f; cc.center = new Vector3(0f, 0.9f, 0f);

            var visuals = new GameObject("Visuals");
            visuals.transform.SetParent(go.transform, false);

            var body = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            Destroy(body.GetComponent<Collider>());
            body.transform.SetParent(visuals.transform, false);
            body.transform.localPosition = new Vector3(0f, 0.85f, 0f);
            body.transform.localScale = new Vector3(0.6f, 0.6f, 0.6f);
            body.GetComponent<Renderer>().material = Mats.Solid(new Color(0.12f, 0.43f, 0.92f));

            var head = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            Destroy(head.GetComponent<Collider>());
            head.transform.SetParent(visuals.transform, false);
            head.transform.localPosition = new Vector3(0f, 1.65f, 0f);
            head.transform.localScale = Vector3.one * 0.38f;
            head.GetComponent<Renderer>().material = Mats.Solid(new Color(0.91f, 0.73f, 0.54f));

            var pc = go.AddComponent<PlayerController>();
            pc.visuals = visuals;
            go.AddComponent<WeaponSystem>();
            return pc;
        }

        void Awake()
        {
            cc = GetComponent<CharacterController>();
            weapons = GetComponent<WeaponSystem>();
        }

        void Update()
        {
            if (dead || !GameManager.Instance.Running) return;

            if (InVehicle) { UpdateInVehicle(); return; }

            // camera-relative movement
            Vector2 mv = InputHub.Move;
            var cam = PlayerCamera.I != null ? PlayerCamera.I.transform : null;
            Vector3 fwd = cam != null ? Vector3.ProjectOnPlane(cam.forward, Vector3.up).normalized : Vector3.forward;
            Vector3 right = cam != null ? Vector3.ProjectOnPlane(cam.right, Vector3.up).normalized : Vector3.right;
            Vector3 dir = (right * mv.x + fwd * mv.y);

            if (dir.sqrMagnitude > 0.01f)
            {
                cc.SimpleMove(dir.normalized * walkSpeed * Mathf.Min(1f, dir.magnitude));
                transform.rotation = Quaternion.Slerp(transform.rotation,
                    Quaternion.LookRotation(dir.normalized), Time.deltaTime * 12f);
            }
            else
            {
                cc.SimpleMove(Vector3.zero); // keep gravity applied
            }

            // keyboard shortcuts (touch buttons call these directly)
            if (InputHub.KeyDown(KeyCode.E)) ActionButton();
            if (InputHub.KeyDown(KeyCode.Q)) weapons.Switch();
            if (InputHub.KeyDown(KeyCode.F)) weapons.Melee();
            if (InputHub.Fire) weapons.TryFire();

            // slow regen when the heat is off
            if (WantedSystem.Instance.Stars == 0 && hp < maxHp)
            {
                hp = Mathf.Min(maxHp, hp + Time.deltaTime * 2f);
                HUDBuilder.I.RefreshVitals();
            }
        }

        void UpdateInVehicle()
        {
            Vector2 mv = InputHub.Move;
            vehicle.Drive(mv.y, mv.x, InputHub.Brake);
            transform.position = vehicle.transform.position; // keep player tracking the car
            if (InputHub.KeyDown(KeyCode.E)) ActionButton();
            if (InputHub.Fire) weapons.TryFire(); // drive-by
        }

        public void ActionButton()
        {
            if (dead) return;
            if (InVehicle) { ExitVehicle(); return; }
            var v = EntityPopulator.Instance.NearestVehicle(transform.position, 4f);
            if (v != null) EnterVehicle(v);
        }

        void EnterVehicle(VehicleController v)
        {
            if (v.exploded) return;
            v.Hijack();
            vehicle = v;
            v.playerDriven = true;
            cc.enabled = false;
            visuals.SetActive(false);
            HUDBuilder.I.SetActionLabel("EXIT");
            HUDBuilder.I.ShowBrake(true);
        }

        public void ExitVehicle()
        {
            if (!InVehicle) return;
            var v = vehicle;
            vehicle = null;
            v.playerDriven = false;
            v.ReleaseControls();
            transform.position = v.transform.position - v.transform.right * 2.2f + Vector3.up * 0.2f;
            cc.enabled = true;
            visuals.SetActive(true);
            HUDBuilder.I.SetActionLabel("ENTER");
            HUDBuilder.I.ShowBrake(false);
        }

        public void TakeDamage(float amount, Vector3 hitPoint, GameObject source)
        {
            if (dead) return;
            if (InVehicle) { vehicle.TakeDamage(amount * 0.5f, hitPoint, source); return; }

            if (armor > 0f)
            {
                float absorbed = Mathf.Min(armor, amount * 0.6f);
                armor -= absorbed;
                amount -= absorbed;
            }
            hp -= amount;
            PlayerCamera.Shake(amount * 0.03f);
            HUDBuilder.I.RefreshVitals();
            if (hp <= 0f) Die(false);
        }

        public void Die(bool busted)
        {
            if (dead) return;
            dead = true;
            hp = Mathf.Max(0f, hp);
            if (InVehicle) ExitVehicle();
            GameManager.Instance.PlayerDown(busted);
        }

        public void ResetAfterDeath(Vector3 pos)
        {
            dead = false;
            hp = maxHp;
            armor = 0f;
            Teleport(pos);
        }

        public void Teleport(Vector3 pos)
        {
            cc.enabled = false;
            transform.position = pos + Vector3.up * 0.1f;
            cc.enabled = !InVehicle;
        }
    }
}
