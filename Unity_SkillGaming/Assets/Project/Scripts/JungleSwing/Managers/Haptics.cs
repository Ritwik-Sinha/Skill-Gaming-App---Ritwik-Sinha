using UnityEngine;

namespace JungleSwing
{
    /// <summary>Best-effort mobile haptics. Android: amplitude-controlled one-shots via
    /// VibrationEffect (API 26+) with a legacy fallback. iOS: system vibration on heavy
    /// impacts only (finer impacts need a native plugin). Editor/other: no-op.</summary>
    public static class Haptics
    {
#if UNITY_ANDROID && !UNITY_EDITOR
        static AndroidJavaObject vibrator;
        static int sdk;
        static bool ready;

        static void Init()
        {
            if (ready) return;
            ready = true;
            try
            {
                using (var up = new AndroidJavaClass("com.unity3d.player.UnityPlayer"))
                using (var act = up.GetStatic<AndroidJavaObject>("currentActivity"))
                    vibrator = act.Call<AndroidJavaObject>("getSystemService", "vibrator");
                using (var ver = new AndroidJavaClass("android.os.Build$VERSION"))
                    sdk = ver.GetStatic<int>("SDK_INT");
            }
            catch (System.Exception e)
            {
                Debug.LogWarning("[Haptics] init failed: " + e.Message);
            }
        }
#endif

        public static void Light() => Impact(18, 90);
        public static void Medium() => Impact(30, 150);
        public static void Heavy() => Impact(55, 255);

        static void Impact(long ms, int amplitude)
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            Init();
            if (vibrator == null) return;
            try
            {
                if (sdk >= 26)
                {
                    using (var fx = new AndroidJavaClass("android.os.VibrationEffect"))
                    {
                        var eff = fx.CallStatic<AndroidJavaObject>("createOneShot", ms, amplitude);
                        vibrator.Call("vibrate", eff);
                    }
                }
                else
                {
                    vibrator.Call("vibrate", ms);
                }
            }
            catch { }
#elif UNITY_IOS && !UNITY_EDITOR
            if (amplitude >= 200) Handheld.Vibrate();
#endif
        }
    }
}
