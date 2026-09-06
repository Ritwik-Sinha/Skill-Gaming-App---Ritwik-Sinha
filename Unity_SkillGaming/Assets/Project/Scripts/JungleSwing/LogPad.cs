using UnityEngine;

namespace JungleSwing
{
    /// <summary>Floating log on the water surface. Acts as a jump pad when the player lands on it.
    /// Sprite + trigger collider are authored in the Log prefab; Init() sets the length.</summary>
    public class LogPad : MonoBehaviour
    {
        float baseY, phase, dip;

        public float X => transform.position.x;
        public float TopY => transform.position.y + 0.3f;

        /// <summary>Scales the log to the requested world length.</summary>
        public void Init(float length)
        {
            var s = transform.localScale;
            transform.localScale = new Vector3(length / 3.2f, s.y, 1f);
            baseY = transform.position.y;
            phase = Random.value * 6.3f;
        }

        void Update()
        {
            dip = Mathf.Lerp(dip, 0f, Time.deltaTime * 4.5f);
            float y = baseY + Mathf.Sin(Time.time * 1.4f + phase) * 0.06f - dip;
            var p = transform.position;
            p.y = y;
            transform.position = p;
            transform.localRotation = Quaternion.Euler(0f, 0f, Mathf.Sin(Time.time * 0.9f + phase) * 2f);
        }

        public void Dip(float amount)
        {
            dip = amount;
        }

        void OnTriggerEnter2D(Collider2D other)
        {
            var pc = other.GetComponent<PlayerController>();
            if (pc != null) pc.HitLog(this);
        }
    }
}
