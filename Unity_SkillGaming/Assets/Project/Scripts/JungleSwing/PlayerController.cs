using UnityEngine;

namespace JungleSwing
{
    /// <summary>The chameleon. Hold to shoot the tongue at the best swing and pendulum around it;
    /// release to fly with momentum. Bounces off logs. All parts are wired in the Player prefab.</summary>
    public class PlayerController : MonoBehaviour
    {
        public const float Reach = 7.2f;
        const float GravityScale = 1.9f;
        const float Pump = 5.4f;
        const float MaxSwingSpeed = 12.5f;

        [Header("Prefab wiring")]
        public SpriteRenderer sr;
        public Transform visual;
        public LineRenderer tongue;
        public ParticleSystem trail;

        Rigidbody2D rb;
        DistanceJoint2D joint;
        Swing attached;
        bool held;
        bool requireRelease;
        float facing = 1f;
        float apGlide;

        public Vector2 Velocity => rb.linearVelocity;
        public bool IsAttached => attached != null;

        void Awake()
        {
            rb = GetComponent<Rigidbody2D>();
            joint = GetComponent<DistanceJoint2D>();
            requireRelease = Pressed();
        }

        static bool Pressed() => Input.GetMouseButton(0) || Input.touchCount > 0;

        public void StartOnSwing(Swing s)
        {
            Vector2 a = s.AnchorWorld;
            rb.position = a + new Vector2(0f, -4.1f);
            transform.position = rb.position;
            Latch(s, 4.1f, silent: true);
        }

        public void OnRunStarted()
        {
            rb.gravityScale = GravityScale;
            rb.linearVelocity = new Vector2(3.2f, 0f);
        }

        void Update()
        {
            var gm = GameManager.Instance;
            if (gm == null) return;
            if (gm.State == GameState.Ready || gm.State == GameState.Playing)
            {
                if (GameManager.Autopilot) AutopilotInput(gm);
                else HumanInput();
            }
            UpdateTongue();
            UpdateVisual(gm);
        }

        void HumanInput()
        {
            bool down = Pressed();
            if (requireRelease)
            {
                if (!down) requireRelease = false;
                return;
            }
            SetHeld(down);
        }

        void AutopilotInput(GameManager gm)
        {
            bool want = held;
            if (gm.State == GameState.Ready) want = true;
            else if (attached != null)
            {
                Vector2 a = joint.connectedAnchor;
                var v = rb.linearVelocity;
                if (v.x > 4.0f && v.y > 3.5f && v.y > 0.4f * Mathf.Abs(v.x) && rb.position.x > a.x - 0.6f)
                {
                    want = false;
                    apGlide = 0.35f;
                }
            }
            else
            {
                apGlide -= Time.deltaTime;
                if (apGlide <= 0f) want = true;
            }
            SetHeld(want);
        }

        public void SetHeld(bool h)
        {
            if (h == held) return;
            held = h;
            var gm = GameManager.Instance;
            if (h)
            {
                if (gm.State == GameState.Ready) gm.BeginRun();
                if (attached == null) TryLatch();
            }
            else if (gm.State == GameState.Playing)
            {
                Detach();
            }
        }

        void FixedUpdate()
        {
            var gm = GameManager.Instance;
            if (gm == null || gm.State != GameState.Playing) return;
            if (held && attached == null) TryLatch();
            if (attached != null) PumpSwing();
            var v = rb.linearVelocity;
            v.x = Mathf.Clamp(v.x, -10f, 15f);
            v.y = Mathf.Clamp(v.y, -19f, 17f);
            rb.linearVelocity = v;
        }

        void TryLatch()
        {
            var s = WorldGenerator.Instance.FindSwing(rb.position, Reach);
            if (s != null) Latch(s, -1f, silent: false);
        }

        void Latch(Swing s, float forceLen, bool silent)
        {
            attached = s;
            Vector2 a = s.AnchorWorld;
            float d = forceLen > 0f ? forceLen : Mathf.Max(1.2f, Vector2.Distance(rb.position, a));
            d = Mathf.Min(d, a.y + 5.3f);
            joint.connectedBody = null;
            joint.connectedAnchor = a;
            joint.distance = d;
            joint.enabled = true;
            s.SetLatched(true);
            if (!silent)
            {
                if (AudioManager.Instance != null) AudioManager.Instance.PlayLatch();
                Haptics.Light();
            }
        }

        public void Detach()
        {
            if (attached == null) return;
            attached.SetLatched(false);
            attached = null;
            joint.enabled = false;
            var v = rb.linearVelocity;
            v.x *= 1.05f;
            v.y += 1.2f;
            rb.linearVelocity = v;
            if (AudioManager.Instance != null) AudioManager.Instance.PlayRelease();
        }

        void PumpSwing()
        {
            Vector2 a = joint.connectedAnchor;
            Vector2 rope = rb.position - a;
            Vector2 tang = new Vector2(-rope.y, rope.x).normalized;
            float dir = Vector2.Dot(tang, rb.linearVelocity) >= 0f ? 1f : -1f;
            if (rb.linearVelocity.magnitude < MaxSwingSpeed)
                rb.AddForce(tang * dir * (Pump * rb.mass));
        }

        public void HitLog(LogPad log)
        {
            var gm = GameManager.Instance;
            if (gm.State != GameState.Playing) return;
            if (rb.linearVelocity.y > 1f) return;
            if (attached != null) Detach();
            var v = rb.linearVelocity;
            v.y = 13.5f;
            v.x = Mathf.Max(v.x * 1.02f, 4f);
            rb.linearVelocity = v;
            log.Dip(0.3f);
            gm.Fx.SmallSplash(new Vector2(rb.position.x, log.TopY - 0.1f));
            gm.Fx.Dust(new Vector2(rb.position.x, log.TopY));
            gm.CamRig.Shake(0.12f);
            if (AudioManager.Instance != null) AudioManager.Instance.PlayBounce();
            Haptics.Medium();
        }

        void UpdateTongue()
        {
            if (attached != null && joint.enabled)
            {
                tongue.enabled = true;
                Vector3 mouth = visual.TransformPoint(new Vector3(0.16f * facing, 0.2f, 0f));
                tongue.SetPosition(0, mouth);
                tongue.SetPosition(1, (Vector3)(Vector2)joint.connectedAnchor);
            }
            else
            {
                tongue.enabled = false;
            }
        }

        void UpdateVisual(GameManager gm)
        {
            var v = rb.linearVelocity;
            if (v.x > 0.8f) facing = 1f;
            else if (v.x < -2.5f) facing = -1f;
            sr.flipX = facing < 0f;
            float target;
            if (attached != null)
            {
                Vector2 rope = rb.position - (Vector2)joint.connectedAnchor;
                target = Vector2.SignedAngle(Vector2.down, rope) * 0.55f;
            }
            else
            {
                target = Mathf.Clamp(v.y * 1.9f, -26f, 28f);
            }
            float z = Mathf.LerpAngle(visual.localEulerAngles.z, target, Time.deltaTime * 10f);
            visual.localRotation = Quaternion.Euler(0f, 0f, z);
            float stretch = Mathf.Min(v.magnitude * 0.008f, 0.10f);
            visual.localScale = new Vector3(1f + stretch, 1f - stretch * 0.8f, 1f);

            var em = trail.emission;
            em.enabled = gm.State == GameState.Playing && attached == null;
        }

        public void DieWater()
        {
            held = false;
            ForceRelease();
            var v = rb.linearVelocity;
            rb.linearVelocity = new Vector2(v.x * 0.12f, -1.6f);
            rb.gravityScale = 0.35f;
            var em = trail.emission;
            em.enabled = false;
        }

        public void DieEaten()
        {
            held = false;
            ForceRelease();
            rb.simulated = false;
            sr.enabled = false;
            tongue.enabled = false;
            var em = trail.emission;
            em.enabled = false;
        }

        void ForceRelease()
        {
            if (attached != null)
            {
                attached.SetLatched(false);
                attached = null;
            }
            joint.enabled = false;
        }
    }
}
