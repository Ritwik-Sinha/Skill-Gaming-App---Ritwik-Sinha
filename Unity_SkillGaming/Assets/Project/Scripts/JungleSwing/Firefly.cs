using UnityEngine;

namespace JungleSwing
{
    /// <summary>Decorative glowing firefly hanging from a string. Sparkles when the player passes by.
    /// Visuals are authored in the Firefly prefab; Init() adjusts the hanging drop.</summary>
    public class Firefly : MonoBehaviour
    {
        [Header("Prefab wiring")]
        public LineRenderer str;
        public Transform body;
        public SpriteRenderer glow;

        float phase;
        float popCooldown;

        public float X => transform.position.x;

        /// <summary>Hangs the body at world height y (root sits at the ceiling), or floats free.</summary>
        public void Init(float y, bool hanging)
        {
            float drop = hanging ? Swing.CeilingY - y : 0f;
            body.localPosition = new Vector3(0f, -drop, 0f);
            if (str != null)
            {
                str.enabled = hanging;
                if (hanging) str.SetPosition(1, new Vector3(0f, -drop, 0f));
            }
            phase = Random.value * 9f;
        }

        void Update()
        {
            float t = Time.time;
            float pulse = 0.26f + 0.14f * Mathf.Sin(t * 2.6f + phase);
            transform.localRotation = Quaternion.Euler(0f, 0f, Mathf.Sin(t * 0.8f + phase) * 3f);
            if (popCooldown > 0f)
            {
                popCooldown -= Time.deltaTime;
                pulse += popCooldown * 0.4f;
            }
            glow.color = new Color(1f, 0.85f, 0.35f, Mathf.Clamp01(pulse));

            var gm = GameManager.Instance;
            if (gm != null && gm.State == GameState.Playing && gm.Player != null && popCooldown <= 0f)
            {
                if (Vector2.Distance(gm.Player.transform.position, body.position) < 0.95f)
                {
                    gm.Fx.Sparkle(body.position);
                    if (AudioManager.Instance != null) AudioManager.Instance.PlaySparkle();
                    popCooldown = 2.5f;
                }
            }
        }
    }
}
