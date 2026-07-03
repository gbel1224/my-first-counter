using UnityEngine;
using UnityEngine.EventSystems;

namespace PalmCity
{
    /// A button that reports both taps and holds.
    public class HoldButton : MonoBehaviour, IPointerDownHandler, IPointerUpHandler
    {
        public System.Action onDown, onUp;

        public void OnPointerDown(PointerEventData e) { if (onDown != null) onDown(); }
        public void OnPointerUp(PointerEventData e) { if (onUp != null) onUp(); }
    }
}
