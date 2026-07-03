using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace PalmCity
{
    /// Left-thumb stick. Writes into InputHub.stick.
    public class VirtualJoystick : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerUpHandler
    {
        public RectTransform knob;
        public float radius = 70f;

        RectTransform rt;

        void Awake() { rt = GetComponent<RectTransform>(); }

        public void OnPointerDown(PointerEventData e) => OnDrag(e);

        public void OnDrag(PointerEventData e)
        {
            RectTransformUtility.ScreenPointToLocalPointInRectangle(rt, e.position, e.pressEventCamera, out Vector2 local);
            Vector2 v = Vector2.ClampMagnitude(local, radius);
            knob.anchoredPosition = v;
            InputHub.stick = v / radius;
        }

        public void OnPointerUp(PointerEventData e)
        {
            knob.anchoredPosition = Vector2.zero;
            InputHub.stick = Vector2.zero;
        }
    }
}
