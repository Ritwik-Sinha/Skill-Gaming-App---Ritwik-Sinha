using UnityEngine;
using TMPro;

namespace JungleSwing
{
    /// <summary>Score display, ready hint and the game-over panel. All UI objects are authored
    /// TMP/Image prefabs nested in the HUD prefab and wired here.</summary>
    public class HudUI : MonoBehaviour
    {
        [Header("Prefab wiring")]
        public TextMeshProUGUI score;
        public TextMeshProUGUI hint;
        public TextMeshProUGUI panelScore;
        public TextMeshProUGUI tapText;
        public GameObject panel;

        int lastScore = -1;
        float scorePop, shownAt;

        public void SetScore(int s)
        {
            if (s == lastScore) return;
            lastScore = s;
            score.text = s.ToString();
            if (s > 0 && s % 25 == 0) scorePop = 0.25f;
        }

        public void ShowReady()
        {
            hint.gameObject.SetActive(true);
            panel.SetActive(false);
            tapText.gameObject.SetActive(false);
            score.gameObject.SetActive(true);
            lastScore = -1;
            SetScore(0);
        }

        public void OnRunStarted()
        {
            hint.gameObject.SetActive(false);
        }

        public void ShowGameOver(int s)
        {
            panel.SetActive(true);
            panelScore.text = s.ToString();
            tapText.gameObject.SetActive(true);
            score.gameObject.SetActive(false);
            shownAt = Time.time;
        }

        public void HideGameOver()
        {
            panel.SetActive(false);
            tapText.gameObject.SetActive(false);
            score.gameObject.SetActive(true);
        }

        void Update()
        {
            if (hint.gameObject.activeSelf)
            {
                var c = hint.color;
                c.a = 0.55f + 0.35f * Mathf.Sin(Time.time * 4f);
                hint.color = c;
            }
            if (tapText.gameObject.activeSelf)
            {
                var c = tapText.color;
                c.a = 0.6f + 0.4f * Mathf.Sin((Time.time - shownAt) * 5f);
                tapText.color = c;
            }
            if (scorePop > 0f)
            {
                scorePop -= Time.deltaTime;
                float k = 1f + Mathf.Max(0f, scorePop) * 0.5f;
                score.transform.localScale = new Vector3(k, k, 1f);
            }
            else
            {
                score.transform.localScale = Vector3.one;
            }
        }
    }
}
