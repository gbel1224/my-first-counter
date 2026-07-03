using UnityEngine;

namespace PalmCity
{
    public enum VehicleAIMode { Traffic, Chase }

    /// Traffic: cruise along road grid, brake for obstacles, turn at
    /// intersections. Chase (cop cars): ram the player at full throttle.
    public class VehicleAI : MonoBehaviour
    {
        public VehicleAIMode aiMode = VehicleAIMode.Traffic;

        VehicleController vc;
        float decisionTimer;

        void Awake()
        {
            vc = GetComponent<VehicleController>();
            decisionTimer = Random.Range(2f, 5f);
        }

        public void OnHijacked() { /* driver flees — handled by populator spawning a panicked ped */ }

        void Update()
        {
            if (vc == null || vc.exploded || vc.playerDriven) return;

            if (aiMode == VehicleAIMode.Chase) { ChasePlayer(); return; }

            // ---- traffic ----
            float throttle = 0.5f;
            float steer = 0f;

            // snap heading toward the nearest cardinal direction
            float yaw = transform.eulerAngles.y;
            float cardinal = Mathf.Round(yaw / 90f) * 90f;
            float delta = Mathf.DeltaAngle(yaw, cardinal);
            steer = Mathf.Clamp(delta / 25f, -1f, 1f);

            // brake for obstacles ahead
            if (Physics.Raycast(transform.position + Vector3.up * 0.8f, transform.forward, out RaycastHit hit, 9f))
            {
                if (hit.collider.GetComponentInParent<VehicleController>() != null ||
                    hit.collider.GetComponentInParent<PedestrianAI>() != null ||
                    hit.collider.GetComponentInParent<PlayerController>() != null)
                    throttle = 0f;
                else if (hit.distance < 5f)
                    steer = 1f; // wall — start turning away
            }

            // occasionally turn at intersections
            decisionTimer -= Time.deltaTime;
            if (decisionTimer <= 0f)
            {
                decisionTimer = Random.Range(2.5f, 6f);
                if (NearIntersection() && Random.value < 0.5f)
                    transform.rotation = Quaternion.Euler(0f, cardinal + (Random.value < 0.5f ? 90f : -90f), 0f);
            }

            // stay inside the map
            if (!CityGenerator.InsideWorld(transform.position + transform.forward * 12f))
                transform.rotation = Quaternion.Euler(0f, cardinal + 180f, 0f);

            vc.Drive(throttle, steer, false);
        }

        bool NearIntersection()
        {
            float cell = CityGenerator.CELL;
            float dx = Mathf.Abs(Mathf.Repeat(transform.position.x + cell / 2f, cell) - cell / 2f);
            float dz = Mathf.Abs(Mathf.Repeat(transform.position.z + cell / 2f, cell) - cell / 2f);
            return dx < 7f && dz < 7f;
        }

        void ChasePlayer()
        {
            var gm = GameManager.Instance;
            if (gm == null || gm.player == null) return;
            Vector3 to = gm.player.ActivePosition - transform.position;
            to.y = 0f;
            float angle = Vector3.SignedAngle(transform.forward, to, Vector3.up);
            vc.Drive(1f, Mathf.Clamp(angle / 30f, -1f, 1f), false);

            // scraping the player's car hurts it
            if (to.magnitude < 3.5f && gm.player.InVehicle)
                gm.player.vehicle.TakeDamage(4f * Time.deltaTime * 10f, transform.position, gameObject);
        }
    }
}
