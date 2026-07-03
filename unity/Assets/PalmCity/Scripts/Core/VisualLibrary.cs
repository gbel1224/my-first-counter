using UnityEngine;

namespace PalmCity
{
    /// Drop free Asset Store prefabs into these slots (add this component
    /// next to PalmCityBootstrap) and the game uses them instead of the
    /// primitive capsules and boxes. Every slot is optional — an empty
    /// slot just keeps the primitive look for that thing.
    public class VisualLibrary : MonoBehaviour
    {
        public static VisualLibrary I;

        [Header("Characters (humanoid prefabs, any size — auto-scaled)")]
        public GameObject playerModel;
        public GameObject[] pedestrianModels;
        public GameObject copModel;

        [Header("Vehicles (prefabs should face +Z; fix with Yaw Offset if not)")]
        public GameObject[] carModels;
        public GameObject copCarModel;
        public GameObject bikeModel;
        public float vehicleYawOffset = 0f;

        [Header("City")]
        public GameObject[] buildingModels;
        public GameObject[] treeModels;
        public Material groundMaterial;
        public Material roadMaterial;

        void Awake() { I = this; }

        public GameObject PickPed() => Pick(pedestrianModels);
        public GameObject PickCar() => Pick(carModels);
        public GameObject PickBuilding() => Pick(buildingModels);
        public GameObject PickTree() => Pick(treeModels);

        static GameObject Pick(GameObject[] arr) =>
            arr != null && arr.Length > 0 ? arr[Random.Range(0, arr.Length)] : null;

        /// Instantiate a prefab as a visual-only child, uniformly scaled so
        /// its height matches the target, feet resting on the parent origin.
        public static GameObject FitHeight(GameObject prefab, Transform parent, float targetHeight,
            float yaw = 0f, float bottomY = 0f)
            => Fit(prefab, parent, targetHeight, true, yaw, bottomY);

        /// Same, but scaled by length (Z axis) — for vehicles.
        public static GameObject FitLength(GameObject prefab, Transform parent, float targetLength,
            float yaw = 0f, float bottomY = 0f)
            => Fit(prefab, parent, targetLength, false, yaw, bottomY);

        static GameObject Fit(GameObject prefab, Transform parent, float target, bool byHeight,
            float yaw, float bottomY)
        {
            var go = Instantiate(prefab, parent, false);
            go.name = "Model_" + prefab.name;

            // visuals only — physics stays on the gameplay root
            foreach (var rb in go.GetComponentsInChildren<Rigidbody>()) Destroy(rb);
            foreach (var col in go.GetComponentsInChildren<Collider>()) Destroy(col);

            go.transform.localPosition = Vector3.zero;
            go.transform.localRotation = Quaternion.Euler(0f, yaw, 0f);

            Bounds b = CalcBounds(go);
            float size = byHeight ? b.size.y : b.size.z;
            if (size > 0.01f)
            {
                float k = target / size;
                go.transform.localScale = go.transform.localScale * k;
                b = CalcBounds(go);
            }

            // rest the model's bottom-center on the requested point
            Vector3 bottomCenter = new Vector3(b.center.x, b.min.y, b.center.z);
            go.transform.position += parent.position + Vector3.up * bottomY - bottomCenter;
            return go;
        }

        static Bounds CalcBounds(GameObject go)
        {
            var rs = go.GetComponentsInChildren<Renderer>();
            if (rs.Length == 0) return new Bounds(go.transform.position, Vector3.one);
            Bounds b = rs[0].bounds;
            for (int i = 1; i < rs.Length; i++) b.Encapsulate(rs[i].bounds);
            return b;
        }
    }
}
