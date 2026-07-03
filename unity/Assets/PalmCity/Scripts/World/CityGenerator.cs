using System.Collections.Generic;
using UnityEngine;

namespace PalmCity
{
    /// Builds the whole city out of primitives at runtime:
    /// grid roads, colored box buildings, parks, palms, beach and ocean.
    public class CityGenerator : MonoBehaviour
    {
        public static CityGenerator Instance;

        public const int GRID = 10;          // road cells per side
        public const float CELL = 60f;       // meters between road centerlines
        public const float ROAD_W = 12f;
        public const float WORLD = GRID * CELL;

        public static readonly List<Vector3> intersections = new List<Vector3>();

        static readonly Color[] BuildingPalette =
        {
            new Color(0.79f, 0.42f, 0.35f), new Color(0.35f, 0.53f, 0.79f),
            new Color(0.42f, 0.79f, 0.63f), new Color(0.79f, 0.71f, 0.35f),
            new Color(0.60f, 0.42f, 0.79f), new Color(0.79f, 0.35f, 0.60f),
            new Color(0.48f, 0.54f, 0.60f), new Color(0.85f, 0.56f, 0.29f),
        };

        void Awake() { Instance = this; }

        public void Generate()
        {
            var root = new GameObject("City").transform;

            // ground (grass) — top surface at y = 0
            var ground = GameObject.CreatePrimitive(PrimitiveType.Cube);
            ground.name = "Ground";
            ground.transform.SetParent(root);
            ground.transform.position = new Vector3(WORLD / 2f, -0.5f, WORLD / 2f);
            ground.transform.localScale = new Vector3(WORLD + 200f, 1f, WORLD + 400f);
            ground.GetComponent<Renderer>().material = Mats.Solid(new Color(0.18f, 0.42f, 0.29f));

            // roads
            var roadMat = Mats.Solid(new Color(0.23f, 0.25f, 0.28f));
            for (int i = 0; i <= GRID; i++)
            {
                float line = i * CELL;
                MakeStrip(root, new Vector3(line, 0.02f, WORLD / 2f), new Vector3(ROAD_W, 0.04f, WORLD + ROAD_W), roadMat);
                MakeStrip(root, new Vector3(WORLD / 2f, 0.02f, line), new Vector3(WORLD + ROAD_W, 0.04f, ROAD_W), roadMat);
            }

            intersections.Clear();
            for (int gx = 0; gx <= GRID; gx++)
                for (int gz = 0; gz <= GRID; gz++)
                    intersections.Add(new Vector3(gx * CELL, 0f, gz * CELL));

            // buildings & parks inside each block
            BuildBlocks(root);

            // beach + ocean south of the city
            var sand = MakeStrip(root, new Vector3(WORLD / 2f, 0.01f, -40f), new Vector3(WORLD + 200f, 0.02f, 80f),
                Mats.Solid(new Color(0.90f, 0.83f, 0.63f)));
            sand.name = "Beach";
            var water = MakeStrip(root, new Vector3(WORLD / 2f, -0.05f, -160f), new Vector3(WORLD + 200f, 0.02f, 160f),
                Mats.Solid(new Color(0.10f, 0.50f, 0.63f)));
            water.name = "Ocean";

            // beach palms
            for (int i = 0; i < 24; i++)
                MakePalm(root, new Vector3(Random.Range(10f, WORLD - 10f), 0f, Random.Range(-70f, -12f)));
        }

        void BuildBlocks(Transform root)
        {
            for (int gx = 0; gx < GRID; gx++)
            {
                for (int gz = 0; gz < GRID; gz++)
                {
                    float x0 = gx * CELL + ROAD_W / 2f + 2f;
                    float z0 = gz * CELL + ROAD_W / 2f + 2f;
                    float bw = CELL - ROAD_W - 4f;

                    if (Random.value < 0.16f) // park block
                    {
                        var park = MakeStrip(root, new Vector3(x0 + bw / 2f, 0.015f, z0 + bw / 2f),
                            new Vector3(bw, 0.03f, bw), Mats.Solid(new Color(0.24f, 0.51f, 0.35f)));
                        park.name = "Park";
                        int n = Random.Range(2, 5);
                        for (int k = 0; k < n; k++)
                            MakePalm(root, new Vector3(Random.Range(x0 + 5f, x0 + bw - 5f), 0f, Random.Range(z0 + 5f, z0 + bw - 5f)));
                        continue;
                    }

                    int cols = Random.Range(1, 3), rows = Random.Range(1, 3);
                    for (int cx = 0; cx < cols; cx++)
                    {
                        for (int cz = 0; cz < rows; cz++)
                        {
                            float w = bw / cols - Random.Range(4f, 8f);
                            float d = bw / rows - Random.Range(4f, 8f);
                            if (w < 8f || d < 8f) continue;
                            float h = Random.Range(8f, 30f);
                            float px = x0 + cx * bw / cols + (bw / cols) / 2f;
                            float pz = z0 + cz * bw / rows + (bw / rows) / 2f;

                            var b = GameObject.CreatePrimitive(PrimitiveType.Cube);
                            b.name = "Building";
                            b.transform.SetParent(root);
                            b.transform.position = new Vector3(px, h / 2f, pz);
                            b.transform.localScale = new Vector3(w, h, d);
                            b.GetComponent<Renderer>().material =
                                Mats.Solid(BuildingPalette[Random.Range(0, BuildingPalette.Length)]);
                        }
                    }

                    // roadside palms
                    if (Random.value < 0.5f)
                        MakePalm(root, new Vector3(x0 + Random.Range(0f, bw), 0f, gz * CELL + ROAD_W / 2f + 1.2f));
                }
            }
        }

        static GameObject MakeStrip(Transform parent, Vector3 pos, Vector3 scale, Material mat)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = "Strip";
            go.transform.SetParent(parent);
            go.transform.position = pos;
            go.transform.localScale = scale;
            go.GetComponent<Renderer>().material = mat;
            Object.Destroy(go.GetComponent<Collider>()); // flat decoration; ground provides physics
            return go;
        }

        static void MakePalm(Transform parent, Vector3 pos)
        {
            var palm = new GameObject("Palm");
            palm.transform.SetParent(parent);
            palm.transform.position = pos;

            var trunk = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            trunk.transform.SetParent(palm.transform);
            float h = Random.Range(3.5f, 5.5f);
            trunk.transform.localPosition = new Vector3(0f, h / 2f, 0f);
            trunk.transform.localScale = new Vector3(0.35f, h / 2f, 0.35f);
            trunk.GetComponent<Renderer>().material = Mats.Solid(new Color(0.48f, 0.32f, 0.19f));

            var leafMat = Mats.Solid(new Color(0.18f, 0.55f, 0.34f));
            for (int i = 0; i < 5; i++)
            {
                var leaf = GameObject.CreatePrimitive(PrimitiveType.Cube);
                Object.Destroy(leaf.GetComponent<Collider>());
                leaf.transform.SetParent(palm.transform);
                float a = i / 5f * 360f;
                leaf.transform.localPosition = new Vector3(Mathf.Cos(a * Mathf.Deg2Rad) * 1.1f, h, Mathf.Sin(a * Mathf.Deg2Rad) * 1.1f);
                leaf.transform.localRotation = Quaternion.Euler(20f, -a, 0f);
                leaf.transform.localScale = new Vector3(2.2f, 0.08f, 0.7f);
                leaf.GetComponent<Renderer>().material = leafMat;
            }
        }

        // ---- helpers used by gameplay ----
        public static Vector3 Intersection(int gx, int gz) => new Vector3(gx * CELL, 0f, gz * CELL);

        public static Vector3 RandomIntersection() =>
            intersections[Random.Range(0, intersections.Count)];

        public static Vector3 RandomRoadPointNear(Vector3 origin, float min, float max)
        {
            for (int tries = 0; tries < 40; tries++)
            {
                var p = RandomIntersection();
                float d = Vector3.Distance(new Vector3(p.x, 0f, p.z), new Vector3(origin.x, 0f, origin.z));
                if (d >= min && d <= max) return p;
            }
            return RandomIntersection();
        }

        /// A random point on a road lane near a position (for traffic spawning).
        public static Vector3 RandomLanePointNear(Vector3 origin, float radius, out float heading)
        {
            bool vertical = Random.value < 0.5f;
            int line = Random.Range(1, GRID);
            float lane = (Random.value < 0.5f ? -3f : 3f);
            Vector3 p;
            if (vertical)
            {
                float x = line * CELL + lane;
                float z = Mathf.Clamp(origin.z + Random.Range(-radius, radius), 5f, WORLD - 5f);
                p = new Vector3(x, 0f, z);
                heading = lane < 0f ? 180f : 0f;
            }
            else
            {
                float z = line * CELL + lane;
                float x = Mathf.Clamp(origin.x + Random.Range(-radius, radius), 5f, WORLD - 5f);
                p = new Vector3(x, 0f, z);
                heading = lane < 0f ? 270f : 90f;
            }
            return p;
        }

        public static bool InsideWorld(Vector3 p) =>
            p.x > 2f && p.x < WORLD - 2f && p.z > 2f && p.z < WORLD - 2f;
    }
}
