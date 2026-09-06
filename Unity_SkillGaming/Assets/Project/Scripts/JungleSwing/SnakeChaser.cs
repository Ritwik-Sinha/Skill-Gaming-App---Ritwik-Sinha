using UnityEngine;

namespace JungleSwing
{
    /// <summary>The snake chasing from the left: a wall of doom with a head that tracks the player.
    /// Its speed increases with the score. Visuals are authored in the Snake prefab.</summary>
    public class SnakeChaser : MonoBehaviour
    {
        [Header("Prefab wiring")]
        public Transform head;

        float lungeT;

        public float HeadX => transform.position.x;

        void Update()
        {
            var gm = GameManager.Instance;
            if (gm == null) return;
            float dt = Time.deltaTime;

            if (gm.State == GameState.Playing)
            {
                float speed = Mathf.Min(2.2f + gm.Meters * 0.005f, 8.5f);
                float x = transform.position.x + speed * dt;
                float px = gm.Player != null ? gm.Player.transform.position.x : x;
                if (px - x > 17f) x = px - 17f;
                transform.position = new Vector3(x, 0f, 0f);

                float targetY = gm.Player != null ? Mathf.Clamp(gm.Player.transform.position.y, -4.5f, 5.2f) : 0f;
                var hp = head.localPosition;
                hp.y = Mathf.Lerp(hp.y, targetY, dt * 3.5f);
                head.localPosition = hp;

                if (gm.Player != null && x >= px - 0.25f) gm.PlayerEaten();
            }
            else if (gm.State == GameState.Dying && lungeT > 0f)
            {
                lungeT -= dt;
                transform.position += new Vector3(5f * dt, 0f, 0f);
                head.localScale = Vector3.one * (1f + lungeT * 0.6f);
            }
            head.localRotation = Quaternion.Euler(0f, 0f, Mathf.Sin(Time.time * 3f) * 6f);
        }

        public void Lunge()
        {
            lungeT = 0.35f;
        }
    }
}
