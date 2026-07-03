using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace PalmCity
{
    /// Title screen shown before the world spawns:
    /// NEW GAME / CONTINUE / FREE ROAM. Built entirely in code.
    public class StartMenu : MonoBehaviour
    {
        Font font;

        public static void Build(PalmCityBootstrap boot)
        {
            var go = new GameObject("StartMenu");
            var menu = go.AddComponent<StartMenu>();
            menu.Construct(boot);
        }

        void Construct(PalmCityBootstrap boot)
        {
            try { font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"); }
            catch { font = Resources.GetBuiltinResource<Font>("Arial.ttf"); }

            if (Object.FindObjectOfType<EventSystem>() == null)
            {
                var es = new GameObject("EventSystem");
                es.AddComponent<EventSystem>();
                es.AddComponent<StandaloneInputModule>();
            }

            var canvasGo = new GameObject("MenuCanvas");
            canvasGo.transform.SetParent(transform);
            var canvas = canvasGo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvasGo.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1280f, 720f);
            scaler.matchWidthOrHeight = 0.5f;
            canvasGo.AddComponent<GraphicRaycaster>();

            // backdrop
            var bg = new GameObject("Bg").AddComponent<Image>();
            var bgRt = bg.rectTransform;
            bgRt.SetParent(canvasGo.transform, false);
            bgRt.anchorMin = Vector2.zero; bgRt.anchorMax = Vector2.one;
            bgRt.offsetMin = bgRt.offsetMax = Vector2.zero;
            bg.color = new Color(0.02f, 0.11f, 0.17f, 1f);

            Title(bgRt, "PALM CITY", 72, new Color(1f, 0.82f, 0.25f), new Vector2(0f, 170f));
            Title(bgRt, "Open-world crime sandbox — arrive with $25, take the city", 18,
                new Color(0.62f, 0.81f, 0.91f), new Vector2(0f, 110f));

            bool hasSave = SaveSystem.Load() != null;

            MenuButton(bgRt, "NEW GAME", new Vector2(0f, 30f), () =>
            {
                SaveSystem.Delete();
                Launch(boot, freeRoam: false, load: false);
            });
            var cont = MenuButton(bgRt, "CONTINUE", new Vector2(0f, -44f), () =>
            {
                Launch(boot, freeRoam: false, load: true);
            });
            if (!hasSave) cont.GetComponent<Image>().color = new Color(0.16f, 0.36f, 0.46f, 0.6f);

            MenuButton(bgRt, "FREE ROAM", new Vector2(0f, -118f), () =>
            {
                Launch(boot, freeRoam: true, load: false);
            });

            Title(bgRt, "Joystick to move • ENTER to jack a car • follow the yellow marker", 14,
                new Color(0.45f, 0.60f, 0.70f), new Vector2(0f, -190f));
        }

        void Launch(PalmCityBootstrap boot, bool freeRoam, bool load)
        {
            Destroy(gameObject);
            boot.Launch(freeRoam, load);
        }

        Text Title(Transform parent, string txt, int size, Color color, Vector2 pos)
        {
            var t = new GameObject("Label").AddComponent<Text>();
            var rt = t.rectTransform;
            rt.SetParent(parent, false);
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f);
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.anchoredPosition = pos;
            rt.sizeDelta = new Vector2(900f, size + 20f);
            t.font = font;
            t.fontSize = size;
            t.fontStyle = FontStyle.Bold;
            t.color = color;
            t.alignment = TextAnchor.MiddleCenter;
            t.horizontalOverflow = HorizontalWrapMode.Overflow;
            t.text = txt;
            t.raycastTarget = false;
            return t;
        }

        GameObject MenuButton(Transform parent, string label, Vector2 pos, System.Action onTap)
        {
            var img = new GameObject("Btn_" + label).AddComponent<Image>();
            var rt = img.rectTransform;
            rt.SetParent(parent, false);
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f);
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.anchoredPosition = pos;
            rt.sizeDelta = new Vector2(340f, 60f);
            img.color = new Color(0.16f, 0.76f, 1f, 0.9f);
            img.gameObject.AddComponent<HoldButton>().onDown = onTap;

            var t = Title(rt, label, 24, new Color(0.02f, 0.13f, 0.18f), Vector2.zero);
            t.rectTransform.sizeDelta = new Vector2(340f, 60f);
            return img.gameObject;
        }
    }
}
