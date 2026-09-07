using UnityEngine;

namespace JungleSwing
{
    /// <summary>Endlessly tiles its authored child sprites horizontally with a parallax factor
    /// relative to the camera. The three tile children are part of the prefab.</summary>
    public class ParallaxTiler : MonoBehaviour
    {
        public float factor = 1f;
        public float driftSpeed;
        public Transform[] tiles;

        float width, drift, y;
        Camera cam;

        void Awake()
        {
            y = transform.position.y;
            var sr = tiles[0].GetComponent<SpriteRenderer>();
            width = sr.sprite.bounds.size.x * Mathf.Abs(tiles[0].localScale.x);
        }

        void LateUpdate()
        {
            drift += driftSpeed * Time.deltaTime;
            Reposition();
        }

        void Reposition()
        {
            if (cam == null)
            {
                cam = Camera.main;
                if (cam == null) return;
            }
            float cx = cam.transform.position.x;
            float rootX = cx * (1f - factor) + drift;
            transform.position = new Vector3(rootX, y, 0f);
            float local = cx - rootX;
            int k = Mathf.FloorToInt(local / width + 0.5f);
            for (int i = 0; i < tiles.Length; i++)
                tiles[i].localPosition = new Vector3((k + i - 1) * width, 0f, 0f);
        }
    }
}
