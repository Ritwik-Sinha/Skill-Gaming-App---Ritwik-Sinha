using UnityEngine;

namespace JungleSwing
{
    public enum GameState { Ready, Playing, Dying, GameOver }

    /// <summary>Entry point and state machine. Scene systems (world, camera, HUD, fx, ambient)
    /// are prefab instances wired in the Inspector; the player and snake are spawned per run
    /// from their prefabs.</summary>
    public class GameManager : MonoBehaviour
    {
        public static GameManager Instance { get; private set; }

        /// <summary>Editor/testing aid: plays the game by itself when enabled.</summary>
#if UNITY_EDITOR
        public static bool Autopilot = false;
#else
        public static bool Autopilot => false;
#endif

        public const float MetersPerUnit = 2f;

        [Header("Actor prefabs")]
        public PlayerController playerPrefab;
        public SnakeChaser snakePrefab;

        [Header("Scene wiring")]
        public WorldGenerator world;
        public CameraRig camRig;
        public HudUI hud;
        public AmbientFx ambient;
        public VfxPool fx;
        public Transform actorsRoot;

        public GameState State { get; private set; } = GameState.Ready;
        public int Meters { get; private set; }
        public int HighScore { get; private set; }
        public PlayerController Player { get; private set; }
        public SnakeChaser Snake { get; private set; }

        public WorldGenerator World => world;
        public CameraRig CamRig => camRig;
        public HudUI Hud => hud;
        public AmbientFx Ambient => ambient;
        public VfxPool Fx => fx;

        float farthestX;
        float diedAt;
        float nextScoreUpdateAt;
        int lastReportedScore = -1;

        void Awake()
        {
            Instance = this;
            Application.targetFrameRate = 60;
            HighScore = PlayerPrefs.GetInt("jungleswing_high", 0);

            world.Init();
            SpawnActors();
            hud.ShowReady();
            camRig.Snap(0f);
        }

        void SpawnActors()
        {
            Player = Instantiate(playerPrefab, actorsRoot);
            Player.StartOnSwing(world.FirstSwing);
            Snake = Instantiate(snakePrefab, new Vector3(-15f, 0f, 0f), Quaternion.identity, actorsRoot);
        }

        public void BeginRun()
        {
            if (State != GameState.Ready) return;
            State = GameState.Playing;
            Player.OnRunStarted();
            hud.OnRunStarted();
            // Keep the first checkpoint out of this frame: the Android view event
            // dispatcher may coalesce same-frame messages and drop gameStarted.
            nextScoreUpdateAt = Time.unscaledTime + 1f;
            MobileBridge.SendEvent("gameStarted");
        }

        void Update()
        {
            switch (State)
            {
                case GameState.Playing:
                {
                    float px = Player.transform.position.x;
                    if (px > farthestX) farthestX = px;
                    Meters = Mathf.RoundToInt(farthestX * MetersPerUnit);
                    hud.SetScore(Meters);
                    ReportScore();
                    world.Tick(camRig.transform.position.x);
                    ambient.Tick(Meters, px - Snake.HeadX);
                    if (Player.transform.position.y < WaterLine.SurfaceY + 0.05f)
                    {
                        Debug.Log("[JS] death=water meters=" + Meters);
                        fx.Splash(new Vector2(px, WaterLine.SurfaceY + 0.1f));
                        camRig.Shake(0.25f);
                        Player.DieWater();
                        if (AudioManager.Instance != null) AudioManager.Instance.PlaySplash();
                        Haptics.Heavy();
                        StartDying();
                    }
                    break;
                }
                case GameState.Ready:
                    ambient.Tick(0f, 99f);
                    break;
                case GameState.Dying:
                    if (Time.time - diedAt > 0.9f)
                    {
                        State = GameState.GameOver;
                        if (Meters > HighScore)
                        {
                            HighScore = Meters;
                            PlayerPrefs.SetInt("jungleswing_high", HighScore);
                            PlayerPrefs.Save();
                        }
                        hud.ShowGameOver(Meters);
                        if (AudioManager.Instance != null) AudioManager.Instance.PlayGameOver();
                        ReportScore(true);
                        MobileBridge.SendScore(Meters, HighScore);
                    }
                    break;
                case GameState.GameOver:
                    // The host owns results and creating the next paid attempt. This run
                    // remains terminal until the host unloads the scene.
                    break;
            }
        }

        void ReportScore(bool force = false)
        {
            if (!force && (Meters == lastReportedScore || Time.unscaledTime < nextScoreUpdateAt)) return;
            lastReportedScore = Meters;
            nextScoreUpdateAt = Time.unscaledTime + 1f;
            MobileBridge.SendScoreUpdate(Meters);
        }

        void OnApplicationPause(bool paused)
        {
            if (paused && (State == GameState.Playing || State == GameState.Dying))
                ReportScore(true);
        }

        public void PlayerEaten()
        {
            if (State != GameState.Playing) return;
            Debug.Log("[JS] death=eaten meters=" + Meters);
            fx.EatBurst(Player.transform.position);
            camRig.Shake(0.35f);
            Player.DieEaten();
            Snake.Lunge();
            if (AudioManager.Instance != null) AudioManager.Instance.PlayChomp();
            Haptics.Heavy();
            StartDying();
        }

        void StartDying()
        {
            State = GameState.Dying;
            diedAt = Time.time;
            ReportScore(true);
        }

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
        }
    }
}
