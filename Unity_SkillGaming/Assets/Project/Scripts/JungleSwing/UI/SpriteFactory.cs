using System.Collections.Generic;
using UnityEngine;

namespace JungleSwing
{
    /// <summary>
    /// Procedural art generator. At runtime the game uses baked PNGs + prefabs; this class
    /// is kept as the source generator for the editor bake step (JungleSwing image assets).
    /// </summary>
    public static class SpriteFactory
    {
        static readonly Dictionary<string, Sprite> cache = new Dictionary<string, Sprite>();
        static Material lineMat, particleMat, defaultSpriteMat;
        static Texture2D softTex;

        public static Color C(int r, int g, int b, int a = 255) => new Color(r / 255f, g / 255f, b / 255f, a / 255f);

        public static Material DefaultSpriteMat
        {
            get
            {
                if (defaultSpriteMat == null)
                {
                    var go = new GameObject("_matProbe");
                    defaultSpriteMat = go.AddComponent<SpriteRenderer>().sharedMaterial;
                    Object.Destroy(go);
                }
                return defaultSpriteMat;
            }
        }

        public static Material LineMat
        {
            get
            {
                if (lineMat == null) lineMat = new Material(DefaultSpriteMat);
                return lineMat;
            }
        }

        public static Material ParticleMat
        {
            get
            {
                if (particleMat == null)
                {
                    particleMat = new Material(DefaultSpriteMat);
                    particleMat.mainTexture = SoftTexture();
                }
                return particleMat;
            }
        }

        public static Texture2D SoftTexture()
        {
            if (softTex != null) return softTex;
            const int S = 96;
            softTex = new Texture2D(S, S, TextureFormat.RGBA32, false);
            var px = new Color32[S * S];
            for (int y = 0; y < S; y++)
                for (int x = 0; x < S; x++)
                {
                    float d = Mathf.Sqrt((x - 47.5f) * (x - 47.5f) + (y - 47.5f) * (y - 47.5f)) / 46f;
                    float a = Mathf.Pow(Mathf.Clamp01(1f - d), 1.6f);
                    px[y * S + x] = new Color32(255, 255, 255, (byte)(a * 255f));
                }
            softTex.SetPixels32(px);
            softTex.filterMode = FilterMode.Bilinear;
            softTex.wrapMode = TextureWrapMode.Clamp;
            softTex.Apply(false, false);
            return softTex;
        }

        static Sprite Cached(string key, System.Func<Sprite> build)
        {
            if (cache.TryGetValue(key, out var s) && s != null) return s;
            s = build();
            cache[key] = s;
            return s;
        }

        public static Sprite Pixel() => Cached("pixel", () =>
        {
            var p = new Painter(4, 4);
            p.Clear(Color.white);
            return p.Bake("pixel", 100f, new Vector2(0.5f, 0.5f));
        });

        public static Sprite Soft() => Cached("soft", () =>
            Sprite.Create(SoftTexture(), new Rect(0, 0, 96, 96), new Vector2(0.5f, 0.5f), 96f, 0, SpriteMeshType.FullRect));

        public static Sprite Backdrop() => Cached("backdrop", () =>
        {
            var p = new Painter(32, 256);
            p.VGrad(C(64, 134, 52), C(17, 48, 15));
            return p.Bake("backdrop", 16f, new Vector2(0.5f, 0.5f));
        });

        public static Sprite Water() => Cached("water", () =>
        {
            var p = new Painter(512, 128) { WrapX = true };
            p.VGrad(C(21, 138, 182), C(74, 214, 242));
            float[] bands = { 92f, 62f, 34f };
            foreach (float y0 in bands)
                for (float x = 0; x < 512f; x += 3f)
                {
                    float yc = y0 + Mathf.Sin((x / 128f) * 6.2832f + y0) * 5f;
                    p.Disc(x, yc, 4f, C(16, 116, 158, 80));
                }
            var rnd = new System.Random(7);
            for (int i = 0; i < 26; i++)
                p.Disc((float)rnd.NextDouble() * 512f, 70f + (float)rnd.NextDouble() * 50f, 1.6f, C(255, 255, 255, 46));
            return p.Bake("water", 100f, new Vector2(0.5f, 1f), default, true);
        });

        public static Sprite Foam() => Cached("foam", () =>
        {
            var p = new Painter(512, 40) { WrapX = true };
            for (float x = 0; x < 512f; x += 32f)
                p.Disc(x, 16f, 9.5f, C(190, 236, 252, 150));
            p.Rect(0, 22, 512, 40, Color.white);
            for (float x = 0; x < 512f; x += 32f)
                p.Disc(x + 16f, 22f, 11f, Color.white);
            return p.Bake("foam", 100f, new Vector2(0.5f, 1f), default, true);
        });

        public static Sprite Canopy() => Cached("canopy", () =>
        {
            var p = new Painter(512, 128) { WrapX = true };
            p.Rect(0, 100, 512, 128, C(23, 58, 20));
            for (float x = 0; x < 512f; x += 64f) p.Disc(x + 32f, 100f, 40f, C(23, 58, 20));
            for (float x = 0; x < 512f; x += 64f) p.Disc(x, 78f, 28f, C(28, 70, 24));
            for (float x = 0; x < 512f; x += 64f) p.Disc(x + 16f, 60f, 18f, C(34, 84, 29));
            for (float t = 0f; t <= 1f; t += 0.004f)
            {
                float gx = t * 512f;
                float gy = 36f + 150f * (t - 0.5f) * (t - 0.5f);
                p.Disc(gx, gy, 1.6f, C(30, 66, 26));
            }
            for (float t = 0.03f; t < 1f; t += 0.055f)
            {
                float gx = t * 512f;
                float gy = 36f + 150f * (t - 0.5f) * (t - 0.5f);
                p.Disc(gx, gy - 4f, 4.4f, C(40, 92, 34));
            }
            p.Capsule(96f, 128f, 92f, 44f, 1.7f, C(30, 66, 26));
            p.Disc(88f, 52f, 4f, C(40, 92, 34));
            p.Disc(97f, 60f, 4f, C(40, 92, 34));
            p.Disc(90f, 72f, 4f, C(40, 92, 34));
            p.Capsule(352f, 128f, 356f, 70f, 1.7f, C(30, 66, 26));
            p.Disc(350f, 76f, 4f, C(40, 92, 34));
            p.Disc(361f, 84f, 4f, C(40, 92, 34));
            return p.Bake("canopy", 100f, new Vector2(0.5f, 1f), default, true);
        });

        public static Sprite Trees() => Cached("trees", () =>
        {
            var p = new Painter(512, 320) { WrapX = true };
            p.Clear(new Color(0f, 0f, 0f, 0f));
            Color trunkA = C(34, 72, 28), trunkB = C(30, 64, 25), leaf = C(40, 86, 33, 210);
            p.Poly(trunkA, 54f, 0f, 68f, 0f, 64f, 320f, 58f, 320f);
            p.Capsule(61f, 210f, 92f, 248f, 3.4f, trunkA);
            p.Poly(trunkB, 220f, 0f, 242f, 0f, 236f, 320f, 226f, 320f);
            p.Capsule(231f, 170f, 196f, 210f, 3.8f, trunkB);
            p.Capsule(231f, 250f, 262f, 282f, 3.2f, trunkB);
            p.Poly(trunkA, 414f, 0f, 428f, 0f, 424f, 320f, 418f, 320f);
            p.Capsule(421f, 190f, 448f, 224f, 3f, trunkA);
            p.Disc(64f, 306f, 40f, leaf);
            p.Disc(120f, 318f, 34f, leaf);
            p.Disc(232f, 300f, 46f, leaf);
            p.Disc(300f, 318f, 36f, leaf);
            p.Disc(422f, 308f, 42f, leaf);
            p.Disc(480f, 320f, 34f, leaf);
            p.Disc(20f, 318f, 30f, leaf);
            return p.Bake("trees", 100f, new Vector2(0.5f, 0f), default, true);
        });

        public static Sprite Bush() => Cached("bush", () =>
        {
            var p = new Painter(512, 96) { WrapX = true };
            Color c = C(29, 66, 24);
            p.Rect(0, 0, 512, 44, c);
            for (float x = 0; x < 512f; x += 56f) p.Disc(x + 28f, 44f, 30f, c);
            for (float x = 0; x < 512f; x += 56f) p.Disc(x, 58f, 20f, c);
            return p.Bake("bush", 100f, new Vector2(0.5f, 0f), default, true);
        });

        public static Sprite Fern() => Cached("fern", () =>
        {
            var p = new Painter(512, 160) { WrapX = true };
            p.Clear(new Color(0f, 0f, 0f, 0f));
            float[] xs = { 64f, 192f, 320f, 448f };
            float[] angles = { -64f, -40f, -16f, 8f, 32f, 56f };
            float[] lens = { 66f, 84f, 95f, 92f, 80f, 64f };
            for (int f = 0; f < xs.Length; f++)
            {
                float xb = xs[f];
                for (int i = 0; i < angles.Length; i++)
                {
                    float rad = (angles[i] + ((f * 7 + i * 3) % 5) - 2f) * Mathf.Deg2Rad;
                    float dx = Mathf.Sin(rad), dy = Mathf.Cos(rad);
                    float L = lens[i] * (0.92f + 0.05f * ((f + i) % 3));
                    float mx = xb + dx * L * 0.5f, my = 8f + dy * L * 0.5f;
                    Color col = (i % 2 == 0) ? C(74, 160, 62) : C(58, 138, 50);
                    p.Ellipse(mx, my, L * 0.5f, 12f, Mathf.Atan2(dy, dx) * Mathf.Rad2Deg, col);
                    p.Capsule(xb, 8f, xb + dx * L * 0.92f, 8f + dy * L * 0.92f, 1.8f, C(44, 108, 40, 200));
                }
                p.Disc(xb, 10f, 6f, C(50, 116, 44));
            }
            return p.Bake("fern", 100f, new Vector2(0.5f, 0f), default, true);
        });

        public static Sprite GrassTuft() => Cached("tuft", () =>
        {
            var p = new Painter(128, 96);
            p.Clear(new Color(0f, 0f, 0f, 0f));
            float[] spread = { -34f, -22f, -10f, 0f, 10f, 22f, 34f };
            float[] hs = { 40f, 58f, 72f, 84f, 74f, 60f, 44f };
            for (int i = 0; i < spread.Length; i++)
            {
                Color col = (i % 2 == 0) ? C(95, 191, 58) : C(63, 148, 40);
                p.Poly(col, 64f - 5f, 8f, 64f + 5f, 8f, 64f + spread[i], 8f + hs[i]);
            }
            p.Disc(64f, 10f, 14f, C(47, 116, 36));
            return p.Bake("tuft", 100f, new Vector2(0.5f, 0.04f));
        });

        public static Sprite Log() => Cached("log", () =>
        {
            var p = new Painter(256, 80);
            p.Clear(new Color(0f, 0f, 0f, 0f));
            p.RoundRect(128f, 40f, 236f, 52f, 24f, C(139, 74, 47));
            p.RoundRect(128f, 30f, 226f, 24f, 12f, C(94, 47, 29, 190));
            p.RoundRect(124f, 53f, 218f, 15f, 7f, C(181, 113, 77, 215));
            p.Capsule(60f, 38f, 150f, 40f, 2.2f, C(94, 47, 29, 130));
            p.Capsule(90f, 30f, 190f, 31f, 2f, C(94, 47, 29, 110));
            p.Ellipse(232f, 40f, 16f, 26f, 0f, C(110, 58, 36));
            p.Ellipse(232f, 40f, 10f, 17f, 0f, C(160, 96, 60));
            p.Ellipse(232f, 40f, 5f, 8f, 0f, C(110, 58, 36));
            p.Ellipse(24f, 40f, 12f, 24f, 0f, C(94, 47, 29));
            return p.Bake("log", 80f, new Vector2(0.5f, 0.5f));
        });

        public static Sprite Bar() => Cached("bar", () =>
        {
            var p = new Painter(128, 24);
            p.Clear(new Color(0f, 0f, 0f, 0f));
            p.RoundRect(64f, 12f, 116f, 11f, 5f, C(122, 59, 34));
            p.Capsule(16f, 15f, 112f, 15f, 1.6f, C(178, 108, 70, 160));
            p.RoundRect(12f, 12f, 18f, 17f, 7f, C(179, 58, 46));
            p.RoundRect(116f, 12f, 18f, 17f, 7f, C(179, 58, 46));
            return p.Bake("bar", 116f, new Vector2(0.5f, 0.5f));
        });

        public static Sprite Chameleon() => Cached("chameleon", () =>
        {
            var p = new Painter(128, 112);
            p.Clear(new Color(0f, 0f, 0f, 0f));
            Color body = C(62, 208, 195), dark = C(42, 167, 149), belly = C(185, 242, 232);
            Color crest = C(255, 166, 77), white = C(244, 251, 240), pupil = C(20, 40, 45);
            for (float t = 0f; t <= 1f; t += 0.02f)
            {
                float th = -0.5f + t * 5.0f;
                float rr = 15f * (1f - 0.82f * t);
                float cx = 30f + rr * Mathf.Cos(th), cy = 42f + rr * Mathf.Sin(th);
                p.Disc(cx, cy, 6.2f * (1f - 0.7f * t) + 1.4f, body);
            }
            p.Capsule(46f, 38f, 40f, 22f, 5.2f, dark);
            p.Disc(40f, 21f, 5.2f, dark);
            p.Ellipse(60f, 52f, 27f, 16.5f, -10f, body);
            p.Ellipse(56f, 45f, 20f, 10f, -8f, belly);
            p.Ellipse(50f, 52f, 3.4f, 14f, -12f, C(42, 167, 149, 140));
            p.Ellipse(63f, 54f, 3.4f, 15f, -6f, C(42, 167, 149, 140));
            p.Ellipse(75f, 56f, 3.2f, 13f, 0f, C(42, 167, 149, 140));
            p.Poly(crest, 44f, 64f, 50f, 74f, 56f, 66f);
            p.Poly(crest, 56f, 67f, 62f, 77f, 68f, 68f);
            p.Poly(crest, 68f, 68f, 74f, 77f, 79f, 67f);
            p.Capsule(70f, 40f, 78f, 24f, 5.4f, body);
            p.Disc(78f, 23f, 5.4f, body);
            p.Disc(88f, 62f, 15.5f, body);
            p.Ellipse(100f, 58f, 9f, 7.5f, -15f, body);
            p.Poly(dark, 78f, 72f, 88f, 84f, 96f, 70f);
            p.Capsule(96f, 52f, 106f, 55f, 1.2f, dark);
            p.Disc(88f, 64f, 8.6f, dark);
            p.Disc(88f, 64f, 7.2f, white);
            p.Disc(90.5f, 64.5f, 3.1f, pupil);
            p.Disc(91.6f, 65.8f, 1.1f, C(255, 255, 255, 230));
            p.Disc(103f, 57f, 1.1f, dark);
            return p.Bake("chameleon", 128f, new Vector2(0.5f, 0.42f));
        });

        public static Sprite SnakeHead() => Cached("snakeHead", () =>
        {
            var p = new Painter(128, 128);
            p.Clear(new Color(0f, 0f, 0f, 0f));
            Color pur = C(124, 55, 150), purD = C(74, 30, 92), mouth = C(46, 10, 58);
            Color fang = C(245, 240, 235), eyeY = C(255, 214, 64);
            p.Poly(mouth, 18f, 64f, 104f, 92f, 104f, 40f);
            p.Ellipse(58f, 86f, 44f, 17f, 14f, pur);
            p.Ellipse(52f, 44f, 40f, 15f, -12f, purD);
            p.Disc(24f, 64f, 26f, pur);
            p.Poly(fang, 88f, 80f, 84f, 62f, 96f, 76f);
            p.Poly(fang, 80f, 50f, 78f, 66f, 90f, 56f);
            p.Disc(46f, 92f, 7.5f, purD);
            p.Disc(46f, 92f, 6.2f, eyeY);
            p.Ellipse(46f, 92f, 1.8f, 4.6f, 0f, C(30, 8, 40));
            p.Disc(96f, 94f, 1.6f, purD);
            return p.Bake("snakeHead", 72f, new Vector2(0.10f, 0.5f));
        });

        public static Sprite SnakeWall() => Cached("snakeWall", () =>
        {
            var p = new Painter(64, 256);
            p.HGrad(C(38, 16, 54), C(94, 44, 120));
            for (int i = 0; i < 4; i++)
                p.Capsule(10f + i * 13f, 0f, 10f + i * 13f, 256f, 2.4f, C(30, 12, 44, 60));
            p.Capsule(61f, 0f, 61f, 256f, 2.2f, C(150, 90, 180, 150));
            return p.Bake("snakeWall", 100f, new Vector2(1f, 0.5f));
        });

        public static Sprite FireflyBody() => Cached("firefly", () =>
        {
            var p = new Painter(64, 64);
            p.Clear(new Color(0f, 0f, 0f, 0f));
            p.Ellipse(22f, 40f, 12f, 6f, 25f, C(242, 231, 201, 200));
            p.Ellipse(42f, 40f, 12f, 6f, -25f, C(242, 231, 201, 200));
            p.Ellipse(32f, 30f, 8f, 12f, 0f, C(138, 90, 34));
            p.Disc(32f, 42f, 5f, C(92, 60, 22));
            p.Disc(32f, 22f, 6.5f, C(255, 215, 94));
            return p.Bake("firefly", 100f, new Vector2(0.5f, 0.82f));
        });

        public static Sprite Panel() => Cached("panel", () =>
        {
            var p = new Painter(128, 128);
            p.Clear(new Color(0f, 0f, 0f, 0f));
            p.RoundRect(64f, 64f, 124f, 124f, 27f, C(87, 230, 216, 26));
            p.RoundRect(64f, 64f, 118f, 118f, 25f, C(87, 230, 216, 48));
            p.RoundRect(64f, 64f, 112f, 112f, 24f, C(87, 230, 216, 255));
            p.RoundRect(64f, 64f, 104f, 104f, 20f, C(16, 34, 64, 242));
            return p.Bake("panel", 100f, new Vector2(0.5f, 0.5f), new Vector4(34f, 34f, 34f, 34f));
        });
    }

    /// <summary>2x supersampled software rasterizer used by SpriteFactory.</summary>
    internal class Painter
    {
        const int SS = 2;
        readonly int lw, lh, w, h;
        readonly Color[] px;
        public bool WrapX;

        public Painter(int width, int height)
        {
            lw = width; lh = height;
            w = width * SS; h = height * SS;
            px = new Color[w * h];
        }

        public void Clear(Color c)
        {
            for (int i = 0; i < px.Length; i++) px[i] = c;
        }

        static Color Over(Color d, Color s)
        {
            float a = s.a + d.a * (1f - s.a);
            if (a < 1e-4f) return Color.clear;
            return new Color(
                (s.r * s.a + d.r * d.a * (1f - s.a)) / a,
                (s.g * s.a + d.g * d.a * (1f - s.a)) / a,
                (s.b * s.a + d.b * d.a * (1f - s.a)) / a, a);
        }

        void B(int x, int y, Color c, float cov)
        {
            if (cov <= 0f || y < 0 || y >= h) return;
            if (WrapX) x = ((x % w) + w) % w;
            else if (x < 0 || x >= w) return;
            c.a *= Mathf.Min(cov, 1f);
            if (c.a <= 0f) return;
            int i = y * w + x;
            px[i] = Over(px[i], c);
        }

        public void Disc(float cx, float cy, float r, Color c)
        {
            cx *= SS; cy *= SS; r *= SS;
            int x0 = Mathf.FloorToInt(cx - r - 1f), x1 = Mathf.CeilToInt(cx + r + 1f);
            int y0 = Mathf.Max(0, Mathf.FloorToInt(cy - r - 1f)), y1 = Mathf.Min(h - 1, Mathf.CeilToInt(cy + r + 1f));
            for (int y = y0; y <= y1; y++)
                for (int x = x0; x <= x1; x++)
                {
                    float d = Mathf.Sqrt((x + 0.5f - cx) * (x + 0.5f - cx) + (y + 0.5f - cy) * (y + 0.5f - cy));
                    B(x, y, c, r - d + 0.5f);
                }
        }

        public void Ellipse(float cx, float cy, float rx, float ry, float deg, Color c)
        {
            cx *= SS; cy *= SS; rx *= SS; ry *= SS;
            float rad = deg * Mathf.Deg2Rad;
            float co = Mathf.Cos(rad), si = Mathf.Sin(rad);
            float ext = Mathf.Max(rx, ry) + 1f;
            int x0 = Mathf.FloorToInt(cx - ext), x1 = Mathf.CeilToInt(cx + ext);
            int y0 = Mathf.Max(0, Mathf.FloorToInt(cy - ext)), y1 = Mathf.Min(h - 1, Mathf.CeilToInt(cy + ext));
            float mr = Mathf.Min(rx, ry);
            for (int y = y0; y <= y1; y++)
                for (int x = x0; x <= x1; x++)
                {
                    float dx = x + 0.5f - cx, dy = y + 0.5f - cy;
                    float u = dx * co + dy * si, v = -dx * si + dy * co;
                    float f = Mathf.Sqrt(u * u / (rx * rx) + v * v / (ry * ry));
                    B(x, y, c, 0.5f - (f - 1f) * mr);
                }
        }

        public void Capsule(float ax, float ay, float bx, float by, float r, Color c)
        {
            ax *= SS; ay *= SS; bx *= SS; by *= SS; r *= SS;
            float minx = Mathf.Min(ax, bx) - r - 1f, maxx = Mathf.Max(ax, bx) + r + 1f;
            float miny = Mathf.Min(ay, by) - r - 1f, maxy = Mathf.Max(ay, by) + r + 1f;
            int x0 = Mathf.FloorToInt(minx), x1 = Mathf.CeilToInt(maxx);
            int y0 = Mathf.Max(0, Mathf.FloorToInt(miny)), y1 = Mathf.Min(h - 1, Mathf.CeilToInt(maxy));
            float abx = bx - ax, aby = by - ay;
            float len2 = abx * abx + aby * aby;
            for (int y = y0; y <= y1; y++)
                for (int x = x0; x <= x1; x++)
                {
                    float pxx = x + 0.5f - ax, pyy = y + 0.5f - ay;
                    float t = len2 > 0f ? Mathf.Clamp01((pxx * abx + pyy * aby) / len2) : 0f;
                    float qx = pxx - t * abx, qy = pyy - t * aby;
                    float d = Mathf.Sqrt(qx * qx + qy * qy);
                    B(x, y, c, r - d + 0.5f);
                }
        }

        public void RoundRect(float cx, float cy, float wd, float ht, float rad, Color c)
        {
            cx *= SS; cy *= SS; wd *= SS; ht *= SS; rad *= SS;
            float hw = wd * 0.5f, hh = ht * 0.5f;
            int x0 = Mathf.FloorToInt(cx - hw - 1f), x1 = Mathf.CeilToInt(cx + hw + 1f);
            int y0 = Mathf.Max(0, Mathf.FloorToInt(cy - hh - 1f)), y1 = Mathf.Min(h - 1, Mathf.CeilToInt(cy + hh + 1f));
            for (int y = y0; y <= y1; y++)
                for (int x = x0; x <= x1; x++)
                {
                    float qx = Mathf.Abs(x + 0.5f - cx) - (hw - rad);
                    float qy = Mathf.Abs(y + 0.5f - cy) - (hh - rad);
                    float d = Mathf.Sqrt(Mathf.Max(qx, 0f) * Mathf.Max(qx, 0f) + Mathf.Max(qy, 0f) * Mathf.Max(qy, 0f)) - rad;
                    B(x, y, c, 0.5f - d);
                }
        }

        public void Rect(float x0f, float y0f, float x1f, float y1f, Color c)
        {
            int x0 = Mathf.RoundToInt(x0f * SS), x1 = Mathf.RoundToInt(x1f * SS);
            int y0 = Mathf.Max(0, Mathf.RoundToInt(y0f * SS)), y1 = Mathf.Min(h, Mathf.RoundToInt(y1f * SS));
            for (int y = y0; y < y1; y++)
                for (int x = x0; x < x1; x++)
                    B(x, y, c, 1f);
        }

        public void Poly(Color c, params float[] xy)
        {
            int n = xy.Length / 2;
            var X = new float[n];
            var Y = new float[n];
            float minx = float.MaxValue, maxx = float.MinValue, miny = float.MaxValue, maxy = float.MinValue;
            for (int i = 0; i < n; i++)
            {
                X[i] = xy[i * 2] * SS; Y[i] = xy[i * 2 + 1] * SS;
                minx = Mathf.Min(minx, X[i]); maxx = Mathf.Max(maxx, X[i]);
                miny = Mathf.Min(miny, Y[i]); maxy = Mathf.Max(maxy, Y[i]);
            }
            int px0 = Mathf.FloorToInt(minx), px1 = Mathf.CeilToInt(maxx);
            int py0 = Mathf.Max(0, Mathf.FloorToInt(miny)), py1 = Mathf.Min(h - 1, Mathf.CeilToInt(maxy));
            for (int y = py0; y <= py1; y++)
            {
                float fy = y + 0.5f;
                for (int x = px0; x <= px1; x++)
                {
                    float fx = x + 0.5f;
                    bool inside = false;
                    for (int i = 0, j = n - 1; i < n; j = i++)
                    {
                        if (((Y[i] > fy) != (Y[j] > fy)) &&
                            fx < (X[j] - X[i]) * (fy - Y[i]) / (Y[j] - Y[i]) + X[i])
                            inside = !inside;
                    }
                    if (inside) B(x, y, c, 1f);
                }
            }
        }

        public void VGrad(Color bottom, Color top)
        {
            for (int y = 0; y < h; y++)
            {
                Color c = Color.Lerp(bottom, top, y / (float)(h - 1));
                for (int x = 0; x < w; x++) px[y * w + x] = c;
            }
        }

        public void HGrad(Color left, Color right)
        {
            for (int x = 0; x < w; x++)
            {
                Color c = Color.Lerp(left, right, x / (float)(w - 1));
                for (int y = 0; y < h; y++) px[y * w + x] = c;
            }
        }

        public Sprite Bake(string name, float ppu, Vector2 pivot, Vector4 border = default, bool repeat = false)
        {
            var tex = new Texture2D(lw, lh, TextureFormat.RGBA32, false) { name = name };
            var outp = new Color32[lw * lh];
            for (int Y = 0; Y < lh; Y++)
                for (int X = 0; X < lw; X++)
                {
                    float a = 0f, r = 0f, g = 0f, b = 0f;
                    for (int sy = 0; sy < SS; sy++)
                        for (int sx = 0; sx < SS; sx++)
                        {
                            Color s = px[(Y * SS + sy) * w + X * SS + sx];
                            a += s.a; r += s.r * s.a; g += s.g * s.a; b += s.b * s.a;
                        }
                    float am = a / (SS * SS);
                    outp[Y * lw + X] = am <= 0.001f
                        ? new Color32(0, 0, 0, 0)
                        : new Color32(
                            (byte)(Mathf.Clamp01(r / a) * 255f),
                            (byte)(Mathf.Clamp01(g / a) * 255f),
                            (byte)(Mathf.Clamp01(b / a) * 255f),
                            (byte)(Mathf.Clamp01(am) * 255f));
                }
            tex.SetPixels32(outp);
            tex.filterMode = FilterMode.Bilinear;
            tex.wrapMode = repeat ? TextureWrapMode.Repeat : TextureWrapMode.Clamp;
            tex.Apply(false, false);
            return Sprite.Create(tex, new Rect(0, 0, lw, lh), pivot, ppu, 0, SpriteMeshType.FullRect, border);
        }
    }
}
