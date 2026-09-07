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
        public static bool Autopilot = false;

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
                    }
                    break;
                case GameState.GameOver:
                    if (Autopilot && Time.time - diedAt > 2f)
                    {
                        ResetRun();
                        break;
                    }
                    if (Time.time - diedAt > 1.6f && PressedDown())
                    {
                        if (AudioManager.Instance != null) AudioManager.Instance.PlayTap();
                        MobileBridge.SendScore(Meters, HighScore);
                        ResetRun();
                    }
                    break;
            }
        }

        static bool PressedDown() =>
            Input.GetMouseButtonDown(0) ||
            (Input.touchCount > 0 && Input.GetTouch(0).phase == TouchPhase.Began);

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
        }

        void ResetRun()
        {
            Destroy(Player.gameObject);
            Destroy(Snake.gameObject);
            Player = null;
            Snake = null;
            Meters = 0;
            farthestX = 0f;
            world.ResetWorld();
            SpawnActors();
            ambient.ResetFx();
            hud.HideGameOver();
            hud.ShowReady();
            camRig.Snap(0f);
            State = GameState.Ready;
        }
    }
}
