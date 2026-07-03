using UnityEngine;

namespace PalmCity
{
    /// Top-down orthographic camera rendered to a texture in the HUD corner.
    /// Blips are bright primitives on a layer only this camera can see.
    public class MinimapCamera : MonoBehaviour
    {
        public const int BLIP_LAYER = 30;

        public static MinimapCamera I;
        Camera cam;

        public static RenderTexture Build()
        {
            var go = new GameObject("MinimapCamera");
            var cam = go.AddComponent<Camera>();
            cam.orthographic = true;
            cam.orthographicSize = 70f;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.10f, 0.28f, 0.19f);
            cam.farClipPlane = 400f;

            var rt = new RenderTexture(256, 256, 16);
            cam.targetTexture = rt;

            var mc = go.AddComponent<MinimapCamera>();
            mc.cam = cam;
            I = mc;

            // player blip (big white arrow-ish diamond)
            if (GameManager.Instance != null && GameManager.Instance.player != null)
                AddBlip(GameManager.Instance.player.transform, Color.white, 7f);
            return rt;
        }

        void LateUpdate()
        {
            var gm = GameManager.Instance;
            if (gm == null || gm.player == null) return;
            Vector3 p = gm.player.ActivePosition;
            transform.position = new Vector3(p.x, 150f, p.z);
            transform.rotation = Quaternion.Euler(90f, 0f, 0f); // north-up
        }

        public static void AddBlip(Transform target, Color color, float size)
        {
            var blip = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            Object.Destroy(blip.GetComponent<Collider>());
            blip.name = "Blip";
            blip.layer = BLIP_LAYER;
            blip.transform.SetParent(target, false);
            blip.transform.localPosition = new Vector3(0f, 60f, 0f); // above rooftops
            blip.transform.localScale = Vector3.one * size;
            blip.GetComponent<Renderer>().material = Mats.Emissive(color, 4f);
        }
    }
}
