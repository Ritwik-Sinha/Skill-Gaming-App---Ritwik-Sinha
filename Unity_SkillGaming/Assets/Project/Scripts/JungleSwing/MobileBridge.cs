using UnityEngine;

namespace JungleSwing
{
    /// <summary>Sends the final score to the host React Native app (same channel as ButtonBehavior).</summary>
    public static class MobileBridge
    {
        public static void SendScore(int score, int highScore)
        {
            string payload = "{\"type\":\"gameOver\",\"game\":\"jungleSwing\",\"score\":" + score +
                             ",\"highScore\":" + highScore + "}";
            try
            {
                if (Application.platform == RuntimePlatform.Android)
                {
                    using (var jc = new AndroidJavaClass("com.azesmwayreactnativeunity.ReactNativeUnityViewManager"))
                        jc.CallStatic("sendMessageToMobileApp", payload);
                }
#if UNITY_IOS && !UNITY_EDITOR
                else if (Application.platform == RuntimePlatform.IPhonePlayer)
                {
                    NativeAPI.sendMessageToMobileApp(payload);
                }
#endif
                else
                {
                    Debug.Log("[MobileBridge] " + payload);
                }
            }
            catch (System.Exception e)
            {
                Debug.LogWarning("[MobileBridge] send failed: " + e.Message);
            }
        }
    }
}
