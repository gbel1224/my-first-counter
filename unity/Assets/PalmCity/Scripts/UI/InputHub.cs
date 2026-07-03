using UnityEngine;

namespace PalmCity
{
    /// Single point where gameplay reads input. Touch UI writes into it,
    /// and it falls back to keyboard/mouse in the editor.
    public static class InputHub
    {
        public static Vector2 stick;     // set by VirtualJoystick
        public static bool fireHeld;     // set by FIRE HoldButton
        public static bool brakeHeld;    // set by BRAKE HoldButton

        static bool legacyOk = true;     // gracefully disable if Input System-only

        public static Vector2 Move
        {
            get
            {
                Vector2 kb = Vector2.zero;
                if (legacyOk)
                {
                    try { kb = new Vector2(Input.GetAxisRaw("Horizontal"), Input.GetAxisRaw("Vertical")); }
                    catch { legacyOk = false; }
                }
                Vector2 v = stick + kb;
                return v.sqrMagnitude > 1f ? v.normalized : v;
            }
        }

        public static bool Fire
        {
            get
            {
                if (fireHeld) return true;
                if (!legacyOk) return false;
                try { return Input.GetMouseButton(0) && !UnityEngine.EventSystems.EventSystem.current.IsPointerOverGameObject(); }
                catch { legacyOk = false; return false; }
            }
        }

        public static bool Brake
        {
            get
            {
                if (brakeHeld) return true;
                if (!legacyOk) return false;
                try { return Input.GetKey(KeyCode.Space); }
                catch { legacyOk = false; return false; }
            }
        }

        public static bool KeyDown(KeyCode k)
        {
            if (!legacyOk) return false;
            try { return Input.GetKeyDown(k); }
            catch { legacyOk = false; return false; }
        }
    }
}
