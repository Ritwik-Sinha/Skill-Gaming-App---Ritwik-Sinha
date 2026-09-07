using UnityEngine;

namespace JungleSwing
{
    /// <summary>One-shot particle bursts. The four particle systems are authored in the Fx prefab.</summary>
    public class VfxPool : MonoBehaviour
    {
        [Header("Prefab wiring")]
        public ParticleSystem splash;
        public ParticleSystem sparkle;
        public ParticleSystem eat;
        public ParticleSystem dust;

        void Burst(ParticleSystem ps, Vector2 pos, int n)
        {
            ps.transform.position = new Vector3(pos.x, pos.y, 0f);
            ps.Emit(n);
        }

        public void Splash(Vector2 p) => Burst(splash, p, 22);
        public void SmallSplash(Vector2 p) => Burst(splash, p, 10);
        public void Sparkle(Vector2 p) => Burst(sparkle, p, 12);
        public void EatBurst(Vector2 p) => Burst(eat, p, 20);
        public void Dust(Vector2 p) => Burst(dust, p, 8);
    }
}
