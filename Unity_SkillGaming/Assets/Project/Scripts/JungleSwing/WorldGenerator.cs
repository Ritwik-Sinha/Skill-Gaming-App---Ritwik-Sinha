using System.Collections.Generic;
using UnityEngine;

namespace JungleSwing
{
    /// <summary>Endless world generation: swings, logs, fireflies and shoreline plants ahead of the
    /// camera, all instantiated from prefabs wired on the WorldGen prefab.</summary>
    public class WorldGenerator : MonoBehaviour
    {
        public static WorldGenerator Instance { get; private set; }

        [Header("Prefab wiring")]
        public Swing swingPrefab;
        public LogPad logPrefab;
        public Firefly fireflyPrefab;
        public SpriteRenderer tuftPrefab;

        readonly List<Swing> swings = new List<Swing>();
        readonly List<LogPad> logs = new List<LogPad>();
        readonly List<Firefly> flies = new List<Firefly>();
        readonly List<Transform> deco = new List<Transform>();

        Transform root;
        float genX, lastAnchorY, nextLogX, nextBackTuftX, nextFrontTuftX;

        public Swing FirstSwing { get; private set; }

        public void Init()
        {
            Instance = this;
            ResetWorld();
        }

        public void ResetWorld()
        {
            if (root != null) Destroy(root.gameObject);
            root = new GameObject("Dynamic").transform;
            root.SetParent(transform, false);
            swings.Clear(); logs.Clear(); flies.Clear(); deco.Clear();
            genX = 0f;
            lastAnchorY = 3.3f;
            nextLogX = 11f;
            nextBackTuftX = -6f;
            nextFrontTuftX = 2f;
            FirstSwing = SpawnSwing(0f, 3.3f);
            Tick(0f);
        }

        Swing SpawnSwing(float x, float anchorY)
        {
            var s = Instantiate(swingPrefab, new Vector3(x, Swing.CeilingY, 0f), Quaternion.identity, root);
            s.Init(anchorY);
            swings.Add(s);
            return s;
        }

        public void Tick(float camX)
        {
            while (genX < camX + 30f) SpawnStep();
            Cull(camX - 16f);
        }

        void SpawnStep()
        {
            float dx = Random.Range(3.2f, 4.7f);
            float ny = Mathf.Clamp(lastAnchorY + Random.Range(-1.6f, 1.6f), 1.8f, 4.6f);
            float nx = genX + dx;
            SpawnSwing(nx, ny);

            if (Random.value < 0.55f)
            {
                float fx = genX + dx * Random.Range(0.35f, 0.65f);
                float fy = Random.Range(0.6f, 3.6f);
                var f = Instantiate(fireflyPrefab, new Vector3(fx, Swing.CeilingY, 0f), Quaternion.identity, root);
                f.Init(fy, true);
                flies.Add(f);
            }
            while (nextLogX < nx)
            {
                var l = Instantiate(logPrefab, new Vector3(nextLogX, WaterLine.SurfaceY + 0.12f, 0f), Quaternion.identity, root);
                l.Init(Random.Range(2.4f, 3.6f));
                logs.Add(l);
                nextLogX += Random.Range(9f, 16f);
            }
            while (nextBackTuftX < nx)
            {
                deco.Add(MakeTuft(nextBackTuftX, WaterLine.SurfaceY + 0.42f, 22, Random.Range(0.7f, 1.15f), 0.82f));
                nextBackTuftX += Random.Range(2.5f, 5f);
            }
            while (nextFrontTuftX < nx)
            {
                deco.Add(MakeTuft(nextFrontTuftX, WaterLine.SurfaceY - 0.75f, 36, Random.Range(1.3f, 2.0f), 1f));
                nextFrontTuftX += Random.Range(6f, 11f);
            }
            genX = nx;
            lastAnchorY = ny;
        }

        Transform MakeTuft(float x, float y, int order, float scale, float shade)
        {
            var sr = Instantiate(tuftPrefab, new Vector3(x, y, 0f), Quaternion.identity, root);
            sr.transform.localScale = new Vector3(scale * (Random.value < 0.5f ? -1f : 1f), scale, 1f);
            sr.sortingOrder = order;
            sr.color = new Color(shade, shade, shade, 1f);
            return sr.transform;
        }

        void Cull(float minX)
        {
            for (int i = swings.Count - 1; i >= 0; i--)
            {
                var s = swings[i];
                if (s == null) { swings.RemoveAt(i); continue; }
                if (s.X < minX) { Destroy(s.gameObject); swings.RemoveAt(i); }
            }
            for (int i = logs.Count - 1; i >= 0; i--)
            {
                var l = logs[i];
                if (l == null) { logs.RemoveAt(i); continue; }
                if (l.X < minX) { Destroy(l.gameObject); logs.RemoveAt(i); }
            }
            for (int i = flies.Count - 1; i >= 0; i--)
            {
                var f = flies[i];
                if (f == null) { flies.RemoveAt(i); continue; }
                if (f.X < minX) { Destroy(f.gameObject); flies.RemoveAt(i); }
            }
            for (int i = deco.Count - 1; i >= 0; i--)
            {
                var d = deco[i];
                if (d == null) { deco.RemoveAt(i); continue; }
                if (d.position.x < minX) { Destroy(d.gameObject); deco.RemoveAt(i); }
            }
        }

        /// <summary>Best latch candidate: near, mostly ahead of and above the player.</summary>
        public Swing FindSwing(Vector2 from, float reach)
        {
            Swing best = null;
            float bestCost = float.MaxValue;
            foreach (var s in swings)
            {
                if (s == null) continue;
                Vector2 a = s.AnchorWorld;
                float dxa = a.x - from.x;
                if (dxa < -1.5f) continue;
                if (a.y < from.y - 0.5f) continue;
                float d = Vector2.Distance(a, from);
                if (d > reach) continue;
                float cost = d - dxa * 0.6f;
                if (cost < bestCost)
                {
                    bestCost = cost;
                    best = s;
                }
            }
            return best;
        }
    }
}
