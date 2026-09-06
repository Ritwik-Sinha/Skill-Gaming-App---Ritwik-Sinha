using UnityEngine;

namespace JungleSwing
{
    /// <summary>Full-screen tint overlays (authored under the camera in the CameraRig prefab):
    /// a day/dusk/night cycle driven by distance, and a red danger pulse when the snake closes in.</summary>
    public class AmbientFx : MonoBehaviour
    {
        [Header("Prefab wiring")]
        public SpriteRenderer dusk;
        public SpriteRenderer danger;

        public void Tick(float meters, float snakeGap)
        {
            float m = Mathf.Repeat(meters, 720f);
            Color duskC = new Color(0.9f, 0.35f, 0.1f, 0.30f);
            Color nightC = new Color(0.2f, 0.05f, 0.35f, 0.40f);
            Color target;
            if (m < 140f) target = Color.clear;
            else if (m < 340f) target = Color.Lerp(Color.clear, duskC, (m - 140f) / 200f);
            else if (m < 520f) target = Color.Lerp(duskC, nightC, (m - 340f) / 180f);
            else target = Color.Lerp(nightC, Color.clear, (m - 520f) / 200f);
            dusk.color = Color.Lerp(dusk.color, target, Time.deltaTime * 0.8f);

            float danger01 = Mathf.Clamp01((5.5f - snakeGap) / 5.5f);
            float pulse = 0.5f + 0.5f * Mathf.Sin(Time.time * 9f);
            danger.color = new Color(0.85f, 0.05f, 0.05f, danger01 * (0.16f + 0.14f * pulse));
        }

        public void ResetFx()
        {
            dusk.color = Color.clear;
            danger.color = Color.clear;
        }
    }
}
