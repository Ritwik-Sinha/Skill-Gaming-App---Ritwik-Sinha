using UnityEngine;

namespace JungleSwing
{
    /// <summary>Plays the synthesized sound effects and the ambient jungle loop.
    /// Sources and clips are wired in the AudioManager prefab.</summary>
    public class AudioManager : MonoBehaviour
    {
        public static AudioManager Instance { get; private set; }

        [Header("Prefab wiring")]
        public AudioSource sfxSource;
        public AudioSource ambientSource;

        [Header("Clips")]
        public AudioClip latch;
        public AudioClip release;
        public AudioClip bounce;
        public AudioClip splash;
        public AudioClip chomp;
        public AudioClip gameOver;
        public AudioClip tap;
        public AudioClip sparkle;

        void Awake()
        {
            Instance = this;
        }

        void Play(AudioClip clip, float volume, float pitchJitter = 0.06f)
        {
            if (clip == null || sfxSource == null) return;
            sfxSource.pitch = 1f + Random.Range(-pitchJitter, pitchJitter);
            sfxSource.PlayOneShot(clip, volume);
        }

        public void PlayLatch() => Play(latch, 0.8f);
        public void PlayRelease() => Play(release, 0.55f);
        public void PlayBounce() => Play(bounce, 0.9f);
        public void PlaySplash() => Play(splash, 0.95f, 0.03f);
        public void PlayChomp() => Play(chomp, 1f, 0.03f);
        public void PlayGameOver() => Play(gameOver, 0.85f, 0f);
        public void PlayTap() => Play(tap, 0.7f);
        public void PlaySparkle() => Play(sparkle, 0.35f);
    }
}
