using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;
using UnityEngine.ResourceManagement.ResourceProviders;
using UnityEngine.SceneManagement;

namespace JungleSwing
{
	public class SceneLoader : MonoBehaviour
	{
		[SerializeField] public GameObject loadingScreen;
		const string SceneAddress = "Assets/Project/Scenes/JungleSwing.unity";

		readonly HashSet<string> attemptedSessions = new HashSet<string>();
		AsyncOperationHandle<SceneInstance> sceneHandle;
		Coroutine sceneOperation;
		bool sceneLoaded;
		string currentSessionId;
		string requestedSessionId;

		void Awake()
		{
			ShowLoading(true);
#if UNITY_EDITOR
			LoadGameScene("editor-preview");
#endif
		}

		// React Native supplies the server-created bet id as the raw string argument.
		public void LoadGameScene(string sessionId)
		{
			if (string.IsNullOrWhiteSpace(sessionId))
			{
				Debug.LogWarning("[SceneLoader] A session id is required to load a paid attempt.");
				MobileBridge.SendEvent("gameSceneLoadFailed", sessionId ?? "");
				return;
			}

			if (sessionId == requestedSessionId || sessionId == currentSessionId)
			{
				if (sceneLoaded && sessionId == requestedSessionId && sessionId == currentSessionId)
					MobileBridge.SendEvent("gameSceneLoaded", sessionId);
				else if (currentSessionId != requestedSessionId)
					ProcessSceneRequest();
				return;
			}

			if (attemptedSessions.Contains(sessionId))
			{
				MobileBridge.SendEvent("gameSceneLoadFailed", sessionId);
				return;
			}

			attemptedSessions.Add(sessionId);
			requestedSessionId = sessionId;
			ShowLoading(true);
			ProcessSceneRequest();
		}

		public void ResetLoadingScene(string sessionId)
		{
			if (string.IsNullOrWhiteSpace(sessionId)) return;
			if (currentSessionId == null && requestedSessionId == null)
			{
				MobileBridge.SendEvent("gameSceneUnloaded", sessionId);
				return;
			}

			// A delayed reset from an old screen must not tear down a newer paid attempt.
			if (sessionId != requestedSessionId)
			{
				if (sessionId == currentSessionId && requestedSessionId == null)
					ProcessSceneRequest();
				return;
			}
			requestedSessionId = null;
			// The host may cancel in the frame before the coroutine starts loading.
			if (currentSessionId != sessionId)
				MobileBridge.SendEvent("gameSceneUnloaded", sessionId);
			ShowLoading(true);
			ProcessSceneRequest();
		}

		void ProcessSceneRequest()
		{
			if (sceneOperation == null)
				sceneOperation = StartCoroutine(ReconcileScenes());
		}

		IEnumerator ReconcileScenes()
		{
			// Always yield before completion so sceneOperation cannot retain a finished coroutine.
			yield return null;
			while (true)
			{
				if (currentSessionId != null && currentSessionId != requestedSessionId)
				{
					string unloadedSessionId = currentSessionId;
					if (sceneHandle.IsValid())
					{
						// Never cancel an in-flight Addressables load: finish it, then unload it.
						var unloadOperation = Addressables.UnloadSceneAsync(sceneHandle, false);
						yield return unloadOperation;
						bool unloaded = unloadOperation.Status == AsyncOperationStatus.Succeeded;
						if (unloadOperation.IsValid()) Addressables.Release(unloadOperation);
						if (!unloaded)
						{
							// Keep the old scene/session bound until a repeated host command retries.
							MobileBridge.SendEvent("gameSceneUnloadFailed", unloadedSessionId);
							break;
						}
					}

					sceneHandle = default;
					sceneLoaded = false;
					currentSessionId = null;
					MobileBridge.SendEvent("gameSceneUnloaded", unloadedSessionId);
					MobileBridge.SetSessionId(null);
				}

				if (requestedSessionId == null || sceneLoaded) break;

				string loadingSessionId = requestedSessionId;
				currentSessionId = loadingSessionId;
				MobileBridge.SetSessionId(loadingSessionId);
				sceneHandle = Addressables.LoadSceneAsync(SceneAddress, LoadSceneMode.Additive, true);
				yield return sceneHandle;

				if (sceneHandle.Status == AsyncOperationStatus.Succeeded)
				{
					sceneLoaded = true;
					if (requestedSessionId == loadingSessionId)
					{
						ShowLoading(false);
						MobileBridge.SendEvent("gameSceneLoaded", loadingSessionId);
					}
					continue;
				}

				Debug.LogError("[SceneLoader] Failed to load " + SceneAddress);
				if (sceneHandle.IsValid()) Addressables.Release(sceneHandle);
				sceneHandle = default;
				currentSessionId = null;
				if (requestedSessionId == loadingSessionId) requestedSessionId = null;
				MobileBridge.SendEvent("gameSceneLoadFailed", loadingSessionId);
				MobileBridge.SendEvent("gameSceneUnloaded", loadingSessionId);
				MobileBridge.SetSessionId(null);
			}

			sceneOperation = null;
		}

		void ShowLoading(bool visible)
		{
			if (loadingScreen != null) loadingScreen.SetActive(visible);
		}
	}
}
