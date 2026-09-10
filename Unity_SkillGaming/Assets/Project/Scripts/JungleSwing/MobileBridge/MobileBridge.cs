using UnityEngine;

namespace JungleSwing
{
    /// <summary>Sends attempt lifecycle and score checkpoints to the host React Native app.</summary>
    public static class MobileBridge
    {
        [System.Serializable]
        class EventMessage
        {
            public string type;
            public string game = "jungleSwing";
            public string sessionId;
        }

        [System.Serializable]
        class ScoreMessage : EventMessage
        {
            public int score;
        }

        [System.Serializable]
        class FinalScoreMessage : ScoreMessage
        {
            public int highScore;
        }

        static string currentSessionId = "";

        public static void SetSessionId(string sessionId)
        {
            currentSessionId = sessionId ?? "";
        }

        public static void SendEvent(string type, string sessionId = null)
        {
            SendPayload(JsonUtility.ToJson(new EventMessage
            {
                type = type,
                sessionId = sessionId ?? currentSessionId
            }));
        }

        public static void SendScoreUpdate(int score)
        {
            SendPayload(JsonUtility.ToJson(new ScoreMessage
            {
                type = "scoreUpdate",
                sessionId = currentSessionId,
                score = score
            }));
        }

        public static void SendScore(int score, int highScore)
        {
            SendPayload(JsonUtility.ToJson(new FinalScoreMessage
            {
                type = "gameOver",
                sessionId = currentSessionId,
                score = score,
                highScore = highScore
            }));
        }

        static void SendPayload(string payload)
        {
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
