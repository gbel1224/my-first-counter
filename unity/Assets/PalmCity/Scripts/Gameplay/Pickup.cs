using UnityEngine;

namespace PalmCity
{
    public enum PickupKind { Cash, Health, Armor, Weapon }

    /// Bobbing collectible; the player walks (or drives) over it.
    public class Pickup : MonoBehaviour
    {
        public PickupKind kind;
        public int amount;
        public int weaponIndex;

        float bob;
        Vector3 basePos;

        public static Pickup Drop(Vector3 pos, PickupKind kind, int amount, int weaponIndex = 0)
        {
            var go = GameObject.CreatePrimitive(
                kind == PickupKind.Cash ? PrimitiveType.Cube :
                kind == PickupKind.Weapon ? PrimitiveType.Cylinder : PrimitiveType.Sphere);
            go.name = "Pickup_" + kind;
            go.transform.position = new Vector3(pos.x, 0.6f, pos.z);
            go.transform.localScale = Vector3.one * 0.45f;

            Color c = kind == PickupKind.Cash ? new Color(0.3f, 0.95f, 0.5f)
                : kind == PickupKind.Health ? new Color(0.95f, 0.3f, 0.3f)
                : kind == PickupKind.Armor ? new Color(0.4f, 0.75f, 1f)
                : new Color(0.95f, 0.85f, 0.3f);
            go.GetComponent<Renderer>().material = Mats.Emissive(c, 1.5f);
            go.GetComponent<Collider>().isTrigger = true;

            var p = go.AddComponent<Pickup>();
            p.kind = kind; p.amount = amount; p.weaponIndex = weaponIndex;
            p.basePos = go.transform.position;
            Destroy(go, 30f);
            return p;
        }

        void Update()
        {
            bob += Time.deltaTime * 4f;
            transform.position = basePos + Vector3.up * Mathf.Sin(bob) * 0.15f;
            transform.Rotate(0f, 90f * Time.deltaTime, 0f);

            // proximity collect (works on foot and by car)
            var gm = GameManager.Instance;
            if (gm == null || gm.player == null) return;
            if (Vector3.Distance(gm.player.ActivePosition, transform.position) < 1.8f) Collect(gm);
        }

        void Collect(GameManager gm)
        {
            var player = gm.player;
            switch (kind)
            {
                case PickupKind.Cash:
                    gm.AddCash(amount);
                    break;
                case PickupKind.Health:
                    player.hp = Mathf.Min(player.maxHp, player.hp + 40f);
                    HUDBuilder.I.Toast("HEALTH", "+40 hp");
                    break;
                case PickupKind.Armor:
                    player.armor = Mathf.Min(100f, player.armor + 50f);
                    HUDBuilder.I.Toast("ARMOR", "+50 armor");
                    break;
                case PickupKind.Weapon:
                    var w = player.GetComponent<WeaponSystem>();
                    w.Give(weaponIndex, amount);
                    HUDBuilder.I.Toast(w.defs[weaponIndex].name.ToUpper(), "picked up");
                    break;
            }
            HUDBuilder.I.RefreshVitals();
            Destroy(gameObject);
        }
    }
}
