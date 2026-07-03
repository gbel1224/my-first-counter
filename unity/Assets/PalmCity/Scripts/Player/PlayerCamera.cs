using UnityEngine;

namespace PalmCity
{
    /// GTA III style chase camera: sits behind and above whatever the
    /// player controls, with smoothing and trauma-based shake.
    public class PlayerCamera : MonoBehaviour
    {
        public static PlayerCamera I;
        static float trauma;

        Transform target;
        Vector3 vel;

        public static void Build(Transform playerTarget)
        {
            var go = new GameObject("MainCamera");
            go.tag = "MainCamera";
            var cam = go.AddComponent<Camera>();
            cam.fieldOfView = 62f;
            cam.nearClipPlane = 0.3f;
            cam.farClipPlane = 600f;
            cam.cullingMask = ~(1 << MinimapCamera.BLIP_LAYER);
            go.AddComponent<AudioListener>();
            var pc = go.AddComponent<PlayerCamera>();
            pc.target = playerTarget;
            go.transform.position = playerTarget.position + new Vector3(0f, 6f, -8f);
        }

        void Awake() { I = this; }

        public static void Shake(float amount) => trauma = Mathf.Clamp01(trauma + amount);

        void LateUpdate()
        {
            var gm = GameManager.Instance;
            if (gm == null || gm.player == null) return;

            Transform follow = gm.player.InVehicle ? gm.player.vehicle.transform : gm.player.transform;
            bool driving = gm.player.InVehicle;
            float dist = driving ? 11f : 7.5f;
            float height = driving ? 5.5f : 4f;

            Vector3 back = -Vector3.ProjectOnPlane(follow.forward, Vector3.up).normalized;
            if (back.sqrMagnitude < 0.01f) back = -transform.forward;
            Vector3 desired = follow.position + back * dist + Vector3.up * height;

            transform.position = Vector3.SmoothDamp(transform.position, desired, ref vel, driving ? 0.25f : 0.15f);
            transform.LookAt(follow.position + Vector3.up * 1.6f);

            if (trauma > 0f)
            {
                trauma = Mathf.Max(0f, trauma - Time.deltaTime * 1.6f);
                float s = trauma * trauma;
                transform.position += new Vector3(
                    (Mathf.PerlinNoise(Time.time * 30f, 0f) - 0.5f) * s,
                    (Mathf.PerlinNoise(0f, Time.time * 30f) - 0.5f) * s, 0f);
            }
        }
    }
}
