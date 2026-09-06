using UnityEngine;

namespace JungleSwing
{
    /// <summary>A bar hanging from the canopy on a string. The player's tongue latches to its center.
    /// Visuals are authored in the Swing prefab; Init() adjusts the drop per spawn.</summary>
    public class Swing : MonoBehaviour
    {
        public const float CeilingY = 8.6f;

        [Header("Prefab wiring")]
        public Transform bar;
        public SpriteRenderer knob;
        public LineRenderer str;

        float phase;
        float amp = 2.2f;
        bool latched;

        public Vector2 AnchorWorld => bar.position;
        public float X => transform.position.x;

        /// <summary>Positions the bar so it hangs at world height anchorY.</summary>
        public void Init(float anchorY)
        {
            float drop = CeilingY - anchorY;
            bar.localPosition = new Vector3(0f, -drop, 0f);
            str.SetPosition(1, new Vector3(0f, -drop, 0f));
            knob.enabled = false;
            phase = Random.value * 10f;
        }

        public void SetLatched(bool on)
        {
            latched = on;
            knob.enabled = on;
            if (on)
            {
                amp = 0f;
                transform.localRotation = Quaternion.identity;
            }
        }

        void Update()
        {
            float target = latched ? 0f : 2.2f;
            amp = Mathf.Lerp(amp, target, Time.deltaTime * 4f);
            float z = Mathf.Sin(Time.time * 1.15f + phase) * amp;
            transform.localRotation = Quaternion.Euler(0f, 0f, z);
        }
    }
}
