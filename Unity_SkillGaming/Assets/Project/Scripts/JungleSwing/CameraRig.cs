using UnityEngine;

namespace JungleSwing
{
    /// <summary>Follows the player horizontally with a look-ahead, plus a simple shake impulse.
    /// Lives on the Main Camera in the CameraRig prefab.</summary>
    [RequireComponent(typeof(Camera))]
    public class CameraRig : MonoBehaviour
    {
        public Camera Cam { get; private set; }

        float shake, xVel, baseX;

        void Awake()
        {
            Cam = GetComponent<Camera>();
            baseX = transform.position.x;
        }

        public void Snap(float x)
        {
            baseX = x + 2.6f;
            xVel = 0f;
            transform.position = new Vector3(baseX, 0f, -10f);
        }

        public void Shake(float amount)
        {
            shake = Mathf.Max(shake, amount);
        }

        void LateUpdate()
        {
            var gm = GameManager.Instance;
            if (gm == null) return;
            float targetX = baseX;
            if (gm.Player != null && (gm.State == GameState.Ready || gm.State == GameState.Playing))
                targetX = gm.Player.transform.position.x + 2.6f;
            baseX = Mathf.SmoothDamp(baseX, targetX, ref xVel, 0.18f);
            shake = Mathf.Lerp(shake, 0f, Time.deltaTime * 8f);
            Vector2 off = shake > 0.005f ? Random.insideUnitCircle * shake : Vector2.zero;
            transform.position = new Vector3(baseX + off.x, off.y, -10f);
        }
    }
}
