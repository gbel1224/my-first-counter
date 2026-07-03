using System.Collections;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace PalmCity
{
    /// Builds the entire mobile HUD from code: cash/stars/level, vitals,
    /// weapon box, mission text, minimap, joystick + buttons, pause and
    /// death screens. No prefabs or sprites required.
    public class HUDBuilder : MonoBehaviour
    {
        public static HUDBuilder I;

        Text cashText, starsText, levelText, clockText, weaponText, ammoText,
             missionText, toastTitle, toastSub, creditText, rampageText, actionLabel;
        Image hpFill, armorFill, xpFill;
        GameObject brakeButton, deathPanel, pausePanel;
        Text deathTitle, deathMsg;
        bool deathWasBusted;
        float deathFee;
        Font font;
        Coroutine toastCo, creditCo;

        static readonly Color PanelBg = new Color(0.02f, 0.08f, 0.12f, 0.62f);

        public static void Build()
        {
            var go = new GameObject("HUD");
            go.AddComponent<HUDBuilder>();
        }

        void Awake()
        {
            I = this;
            try { font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"); }
            catch { font = Resources.GetBuiltinResource<Font>("Arial.ttf"); }

            if (FindObjectOfType<EventSystem>() == null)
            {
                var es = new GameObject("EventSystem");
                es.AddComponent<EventSystem>();
                es.AddComponent<StandaloneInputModule>();
            }

            BuildCanvas();
        }

        void BuildCanvas()
        {
            var canvasGo = new GameObject("Canvas");
            canvasGo.transform.SetParent(transform);
            var canvas = canvasGo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvasGo.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1280f, 720f);
            scaler.matchWidthOrHeight = 0.5f;
            canvasGo.AddComponent<GraphicRaycaster>();
            var root = canvasGo.transform;

            // ---- top-left: cash + stars + vitals ----
            var tl = Panel(root, new Vector2(0f, 1f), new Vector2(12f, -12f), new Vector2(230f, 118f), new Vector2(0f, 1f));
            cashText = MakeText(tl, "$25", 26, new Color(0.44f, 0.95f, 0.60f), TextAnchor.UpperLeft,
                new Vector2(12f, -8f), new Vector2(210f, 32f));
            cashText.fontStyle = FontStyle.Bold;
            starsText = MakeText(tl, "", 22, new Color(1f, 0.82f, 0.25f), TextAnchor.UpperLeft,
                new Vector2(12f, -38f), new Vector2(210f, 26f));
            hpFill = MakeBar(tl, new Vector2(12f, -70f), new Color(1f, 0.38f, 0.32f), "HP");
            armorFill = MakeBar(tl, new Vector2(12f, -92f), new Color(0.35f, 0.65f, 1f), "ARM");

            // ---- top-right: level/xp/clock + minimap ----
            var tr = Panel(root, new Vector2(1f, 1f), new Vector2(-12f, -12f), new Vector2(190f, 84f), new Vector2(1f, 1f));
            levelText = MakeText(tr, "Lvl 1", 20, Color.white, TextAnchor.UpperLeft,
                new Vector2(12f, -8f), new Vector2(170f, 26f));
            xpFill = MakeBar(tr, new Vector2(12f, -36f), new Color(0.25f, 0.78f, 1f), "");
            clockText = MakeText(tr, "08:00", 15, new Color(0.75f, 0.90f, 1f), TextAnchor.UpperLeft,
                new Vector2(12f, -56f), new Vector2(170f, 22f));

            var mapImg = new GameObject("Minimap").AddComponent<RawImage>();
            var mapRt = mapImg.rectTransform;
            mapRt.SetParent(root, false);
            mapRt.anchorMin = mapRt.anchorMax = new Vector2(1f, 1f);
            mapRt.pivot = new Vector2(1f, 1f);
            mapRt.anchoredPosition = new Vector2(-12f, -104f);
            mapRt.sizeDelta = new Vector2(170f, 170f);
            mapImg.texture = MinimapCamera.Build();
            Outline(mapImg.gameObject);

            // ---- top-center: mission + pause ----
            missionText = MakeText(root, "", 16, Color.white, TextAnchor.UpperCenter,
                Vector2.zero, new Vector2(500f, 70f));
            var mrt = missionText.rectTransform;
            mrt.anchorMin = mrt.anchorMax = new Vector2(0.5f, 1f);
            mrt.pivot = new Vector2(0.5f, 1f);
            mrt.anchoredPosition = new Vector2(0f, -46f);

            var pauseBtn = MakeButton(root, "II", 46f, 40f, new Vector2(0.5f, 1f), new Vector2(0f, -8f), PanelBg);
            pauseBtn.GetComponent<HoldButton>().onDown = () => ShowPause(true);

            // ---- weapon box (tap = switch) ----
            var wb = Panel(root, new Vector2(1f, 0.5f), new Vector2(-12f, 130f), new Vector2(150f, 58f), new Vector2(1f, 0.5f));
            weaponText = MakeText(wb, "Fists", 20, new Color(1f, 0.82f, 0.25f), TextAnchor.UpperRight,
                new Vector2(-140f, -6f), new Vector2(130f, 26f));
            weaponText.fontStyle = FontStyle.Bold;
            ammoText = MakeText(wb, "∞", 15, new Color(0.8f, 0.92f, 1f), TextAnchor.UpperRight,
                new Vector2(-140f, -32f), new Vector2(130f, 22f));
            var wbBtn = wb.gameObject.AddComponent<HoldButton>();
            wbBtn.onDown = () => Player().GetComponent<WeaponSystem>().Switch();

            // ---- center toasts ----
            toastTitle = MakeText(root, "", 42, Color.white, TextAnchor.MiddleCenter, Vector2.zero, new Vector2(700f, 60f));
            CenterAt(toastTitle.rectTransform, new Vector2(0f, 60f));
            toastTitle.fontStyle = FontStyle.Bold;
            toastSub = MakeText(root, "", 20, new Color(1f, 0.82f, 0.25f), TextAnchor.MiddleCenter, Vector2.zero, new Vector2(700f, 34f));
            CenterAt(toastSub.rectTransform, new Vector2(0f, 20f));
            rampageText = MakeText(root, "", 30, new Color(1f, 0.55f, 0.2f), TextAnchor.MiddleCenter, Vector2.zero, new Vector2(400f, 44f));
            CenterAt(rampageText.rectTransform, new Vector2(0f, 130f));
            rampageText.fontStyle = FontStyle.Bold;
            creditText = MakeText(root, "", 22, new Color(0.44f, 0.95f, 0.60f), TextAnchor.UpperLeft,
                Vector2.zero, new Vector2(220f, 30f));
            var crt = creditText.rectTransform;
            crt.anchorMin = crt.anchorMax = new Vector2(0f, 1f);
            crt.pivot = new Vector2(0f, 1f);
            crt.anchoredPosition = new Vector2(16f, -136f);
            creditText.fontStyle = FontStyle.Bold;

            // ---- joystick (bottom-left) ----
            var joyBg = new GameObject("Joystick").AddComponent<Image>();
            var joyRt = joyBg.rectTransform;
            joyRt.SetParent(root, false);
            joyRt.anchorMin = joyRt.anchorMax = new Vector2(0f, 0f);
            joyRt.pivot = new Vector2(0f, 0f);
            joyRt.anchoredPosition = new Vector2(26f, 26f);
            joyRt.sizeDelta = new Vector2(190f, 190f);
            joyBg.color = new Color(0.5f, 0.85f, 1f, 0.12f);
            var knob = new GameObject("Knob").AddComponent<Image>();
            knob.rectTransform.SetParent(joyRt, false);
            knob.rectTransform.sizeDelta = new Vector2(76f, 76f);
            knob.color = new Color(0.75f, 0.92f, 1f, 0.55f);
            var joy = joyBg.gameObject.AddComponent<VirtualJoystick>();
            joy.knob = knob.rectTransform;
            joy.radius = 70f;

            // ---- action buttons (bottom-right) ----
            var fire = MakeButton(root, "FIRE", 120f, 26f, new Vector2(1f, 0f), new Vector2(-34f, 120f), new Color(0.95f, 0.28f, 0.28f, 0.85f));
            var fh = fire.GetComponent<HoldButton>();
            fh.onDown = () => InputHub.fireHeld = true;
            fh.onUp = () => InputHub.fireHeld = false;

            var melee = MakeButton(root, "HIT", 84f, 20f, new Vector2(1f, 0f), new Vector2(-52f, 258f), new Color(1f, 0.65f, 0.25f, 0.85f));
            melee.GetComponent<HoldButton>().onDown = () => Player().GetComponent<WeaponSystem>().Melee();

            var action = MakeButton(root, "ENTER", 92f, 18f, new Vector2(1f, 0f), new Vector2(-170f, 96f), new Color(0.25f, 0.65f, 1f, 0.85f));
            action.GetComponent<HoldButton>().onDown = () => Player().ActionButton();
            actionLabel = action.GetComponentInChildren<Text>();

            var brake = MakeButton(root, "BRAKE", 92f, 17f, new Vector2(1f, 0f), new Vector2(-170f, 208f), new Color(0.45f, 0.45f, 0.55f, 0.85f));
            var bh = brake.GetComponent<HoldButton>();
            bh.onDown = () => InputHub.brakeHeld = true;
            bh.onUp = () => InputHub.brakeHeld = false;
            brakeButton = brake;
            brakeButton.SetActive(false);

            // ---- overlays ----
            BuildPausePanel(root);
            BuildDeathPanel(root);
        }

        // =================== UI factory helpers ===================
        PlayerController Player() => GameManager.Instance.player;

        RectTransform Panel(Transform parent, Vector2 anchor, Vector2 pos, Vector2 size, Vector2 pivot)
        {
            var img = new GameObject("Panel").AddComponent<Image>();
            var rt = img.rectTransform;
            rt.SetParent(parent, false);
            rt.anchorMin = rt.anchorMax = anchor;
            rt.pivot = pivot;
            rt.anchoredPosition = pos;
            rt.sizeDelta = size;
            img.color = PanelBg;
            Outline(img.gameObject);
            return rt;
        }

        void Outline(GameObject go)
        {
            var o = go.AddComponent<UnityEngine.UI.Outline>();
            o.effectColor = new Color(0.47f, 0.86f, 1f, 0.25f);
            o.effectDistance = new Vector2(1.5f, -1.5f);
        }

        Text MakeText(Transform parent, string txt, int size, Color color, TextAnchor align, Vector2 pos, Vector2 dims)
        {
            var t = new GameObject("Text").AddComponent<Text>();
            var rt = t.rectTransform;
            rt.SetParent(parent, false);
            rt.anchorMin = rt.anchorMax = new Vector2(0f, 1f);
            rt.pivot = new Vector2(0f, 1f);
            rt.anchoredPosition = pos;
            rt.sizeDelta = dims;
            t.font = font;
            t.fontSize = size;
            t.color = color;
            t.alignment = align;
            t.text = txt;
            t.horizontalOverflow = HorizontalWrapMode.Overflow;
            t.raycastTarget = false;
            var sh = t.gameObject.AddComponent<Shadow>();
            sh.effectColor = new Color(0f, 0f, 0f, 0.7f);
            sh.effectDistance = new Vector2(1f, -1f);
            return t;
        }

        void CenterAt(RectTransform rt, Vector2 pos)
        {
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f);
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.anchoredPosition = pos;
        }

        Image MakeBar(Transform parent, Vector2 pos, Color fillColor, string label)
        {
            var bg = new GameObject("BarBg").AddComponent<Image>();
            var rt = bg.rectTransform;
            rt.SetParent(parent, false);
            rt.anchorMin = rt.anchorMax = new Vector2(0f, 1f);
            rt.pivot = new Vector2(0f, 1f);
            rt.anchoredPosition = pos;
            rt.sizeDelta = new Vector2(200f, 14f);
            bg.color = new Color(0f, 0f, 0f, 0.5f);

            var fill = new GameObject("Fill").AddComponent<Image>();
            var frt = fill.rectTransform;
            frt.SetParent(rt, false);
            frt.anchorMin = new Vector2(0f, 0f);
            frt.anchorMax = new Vector2(1f, 1f);
            frt.offsetMin = frt.offsetMax = Vector2.zero;
            fill.color = fillColor;

            if (label.Length > 0)
            {
                var t = MakeText(rt, label, 10, Color.white, TextAnchor.MiddleLeft, new Vector2(4f, 0f), new Vector2(60f, 14f));
                t.fontStyle = FontStyle.Bold;
            }
            return fill;
        }

        GameObject MakeButton(Transform parent, string label, float size, float fontSize, Vector2 anchor, Vector2 pos, Color color)
        {
            var img = new GameObject("Btn_" + label).AddComponent<Image>();
            var rt = img.rectTransform;
            rt.SetParent(parent, false);
            rt.anchorMin = rt.anchorMax = anchor;
            rt.pivot = anchor;
            rt.anchoredPosition = pos;
            rt.sizeDelta = new Vector2(size, size);
            img.color = color;
            Outline(img.gameObject);
            img.gameObject.AddComponent<HoldButton>();
            var t = MakeText(rt, label, (int)fontSize, Color.white, TextAnchor.MiddleCenter, Vector2.zero, new Vector2(size, size));
            t.rectTransform.anchoredPosition = Vector2.zero;
            t.fontStyle = FontStyle.Bold;
            return img.gameObject;
        }

        GameObject MakeMenuButton(Transform parent, string label, Vector2 pos, System.Action onTap)
        {
            var img = new GameObject("Menu_" + label).AddComponent<Image>();
            var rt = img.rectTransform;
            rt.SetParent(parent, false);
            CenterAt(rt, pos);
            rt.sizeDelta = new Vector2(320f, 58f);
            img.color = new Color(0.16f, 0.76f, 1f, 0.9f);
            img.gameObject.AddComponent<HoldButton>().onDown = onTap;
            var t = MakeText(rt, label, 22, new Color(0.02f, 0.13f, 0.18f), TextAnchor.MiddleCenter, Vector2.zero, new Vector2(320f, 58f));
            t.rectTransform.anchoredPosition = Vector2.zero;
            t.fontStyle = FontStyle.Bold;
            return img.gameObject;
        }

        void BuildPausePanel(Transform root)
        {
            pausePanel = new GameObject("PausePanel");
            var img = pausePanel.AddComponent<Image>();
            var rt = img.rectTransform;
            rt.SetParent(root, false);
            rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
            rt.offsetMin = rt.offsetMax = Vector2.zero;
            img.color = new Color(0.01f, 0.05f, 0.09f, 0.88f);

            var title = MakeText(rt, "PAUSED", 44, Color.white, TextAnchor.MiddleCenter, Vector2.zero, new Vector2(500f, 60f));
            CenterAt(title.rectTransform, new Vector2(0f, 150f));
            title.fontStyle = FontStyle.Bold;

            MakeMenuButton(rt, "RESUME", new Vector2(0f, 60f), () => ShowPause(false));
            MakeMenuButton(rt, "SAVE GAME", new Vector2(0f, -12f), () => GameManager.Instance.SaveNow());
            MakeMenuButton(rt, "RESTART CITY", new Vector2(0f, -84f), () => GameManager.Instance.RestartCity());
            pausePanel.SetActive(false);
        }

        void BuildDeathPanel(Transform root)
        {
            deathPanel = new GameObject("DeathPanel");
            var img = deathPanel.AddComponent<Image>();
            var rt = img.rectTransform;
            rt.SetParent(root, false);
            rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
            rt.offsetMin = rt.offsetMax = Vector2.zero;
            img.color = new Color(0.05f, 0.01f, 0.02f, 0.9f);

            deathTitle = MakeText(rt, "WASTED", 60, new Color(1f, 0.35f, 0.3f), TextAnchor.MiddleCenter, Vector2.zero, new Vector2(600f, 80f));
            CenterAt(deathTitle.rectTransform, new Vector2(0f, 110f));
            deathTitle.fontStyle = FontStyle.Bold;

            deathMsg = MakeText(rt, "", 20, new Color(0.85f, 0.9f, 0.95f), TextAnchor.MiddleCenter, Vector2.zero, new Vector2(640f, 40f));
            CenterAt(deathMsg.rectTransform, new Vector2(0f, 40f));

            MakeMenuButton(rt, "RESPAWN", new Vector2(0f, -50f),
                () => GameManager.Instance.Respawn(deathWasBusted, deathFee));
            deathPanel.SetActive(false);
        }

        // =================== public API ===================
        public void Refresh()
        {
            var gm = GameManager.Instance;
            cashText.text = "$" + Mathf.RoundToInt(gm.cash).ToString("N0");
            levelText.text = "Lvl " + gm.level + (gm.mode == GameMode.FreeRoam ? "  Free Roam" : "");
            xpFill.rectTransform.anchorMax = new Vector2(Mathf.Clamp01((float)gm.xp / gm.xpNext), 1f);
            RefreshVitals();
            RefreshWeapon();
        }

        public void RefreshVitals()
        {
            var p = GameManager.Instance.player;
            if (p == null) return;
            hpFill.rectTransform.anchorMax = new Vector2(Mathf.Clamp01(p.hp / p.maxHp), 1f);
            armorFill.rectTransform.anchorMax = new Vector2(Mathf.Clamp01(p.armor / 100f), 1f);
        }

        public void RefreshWeapon()
        {
            var p = GameManager.Instance.player;
            if (p == null) return;
            var w = p.GetComponent<WeaponSystem>().Current;
            weaponText.text = w.name;
            ammoText.text = w.melee ? "∞" : w.ammo + " / " + w.cap;
        }

        public void SetStars(int stars)
        {
            string s = "";
            for (int i = 0; i < stars; i++) s += "★";
            for (int i = stars; i < 5; i++) s += "·";
            starsText.text = s;
        }

        public void SetMission(string text) => missionText.text = text;
        public void SetClock(string text) => clockText.text = text;
        public void SetActionLabel(string text) => actionLabel.text = text;
        public void ShowBrake(bool show) => brakeButton.SetActive(show);
        public void SetRampage(int r) => rampageText.text = r >= 3 ? "RAMPAGE x" + r : "";

        public void Toast(string title, string sub)
        {
            if (toastCo != null) StopCoroutine(toastCo);
            toastCo = StartCoroutine(ToastRoutine(title, sub));
        }

        IEnumerator ToastRoutine(string title, string sub)
        {
            toastTitle.text = title;
            toastSub.text = sub;
            yield return new WaitForSecondsRealtime(2.2f);
            toastTitle.text = "";
            toastSub.text = "";
        }

        public void FlashCredit(float n)
        {
            if (Mathf.Approximately(n, 0f)) return;
            if (creditCo != null) StopCoroutine(creditCo);
            creditCo = StartCoroutine(CreditRoutine(n));
        }

        IEnumerator CreditRoutine(float n)
        {
            creditText.text = (n > 0f ? "+$" : "-$") + Mathf.Abs(Mathf.RoundToInt(n)).ToString("N0");
            creditText.color = n > 0f ? new Color(0.44f, 0.95f, 0.6f) : new Color(1f, 0.42f, 0.42f);
            yield return new WaitForSecondsRealtime(0.8f);
            creditText.text = "";
        }

        public void ShowDeath(bool busted, float fee)
        {
            deathWasBusted = busted;
            deathFee = fee;
            deathTitle.text = busted ? "BUSTED" : "WASTED";
            deathTitle.color = busted ? new Color(0.4f, 0.7f, 1f) : new Color(1f, 0.35f, 0.3f);
            deathMsg.text = busted
                ? "The cops hauled you in. Lost $" + fee + " and your weapons."
                : "You hit the pavement. Medical bills: $" + fee + ".";
            deathPanel.SetActive(true);
        }

        public void HideDeath() => deathPanel.SetActive(false);

        public void ShowPause(bool show)
        {
            pausePanel.SetActive(show);
            GameManager.Instance.TogglePause(show);
        }
    }
}
