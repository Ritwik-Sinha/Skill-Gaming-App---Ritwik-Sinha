using UnityEngine;

namespace JungleSwing
{
    /// <summary>The water at the bottom of the screen. The animated strips are ParallaxTiler children
    /// of the Water prefab; this script only keeps the deep fill glued to the camera.</summary>
    public class WaterLine : MonoBehaviour
    {
        public const float SurfaceY = -5.9f;

        [Header("Prefab wiring")]
        public Transform deepFill;

        Camera cam;

        void LateUpdate()
        {
            if (cam == null)
            {
                cam = Camera.main;
                if (cam == null) return;
            }
            var p = deepFill.position;
            p.x = cam.transform.position.x;
            deepFill.position = p;
        }
    }
}
