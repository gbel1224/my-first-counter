using UnityEngine;

namespace PalmCity
{
    /// Material helper that works on both URP and the Built-in pipeline.
    public static class Mats
    {
        static Shader _lit;
        public static Shader Lit
        {
            get
            {
                if (_lit == null)
                {
                    _lit = Shader.Find("Universal Render Pipeline/Lit");
                    if (_lit == null) _lit = Shader.Find("Standard");
                }
                return _lit;
            }
        }

        public static Material Solid(Color c)
        {
            var m = new Material(Lit);
            m.color = c; // maps to the [MainColor] property on both pipelines
            return m;
        }

        public static Material Emissive(Color c, float strength = 2f)
        {
            var m = Solid(c);
            m.EnableKeyword("_EMISSION");
            m.SetColor("_EmissionColor", c * strength);
            return m;
        }
    }
}
