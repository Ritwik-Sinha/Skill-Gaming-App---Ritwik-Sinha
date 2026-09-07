using System.Collections;
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

		AsyncOperationHandle<SceneInstance> sceneHandle;
		Coroutine sceneOperation;
		bool sceneLoaded;

		void Awake()
		{
			LoadGameScene("");
		}

		public void LoadGameScene(string _)
		{
			if (sceneOperation != null || sceneLoaded)
			{
				return;
			}

			if (loadingScreen != null)
			{
				loadingScreen.SetActive(true);
			}

			sceneOperation = StartCoroutine(LoadGameSceneAsync());
		}

		IEnumerator LoadGameSceneAsync()
		{
			sceneHandle = Addressables.LoadSceneAsync(SceneAddress, LoadSceneMode.Additive, true);
			yield return sceneHandle;
			sceneOperation = null;

			if (sceneHandle.Status == AsyncOperationStatus.Succeeded)
			{
				sceneLoaded = true;
				if (loadingScreen != null)
				{
					loadingScreen.SetActive(false);
				}

				MobileBridge.SendEvent("gameSceneLoaded");
				yield break;
			}

			Debug.LogError("[SceneLoader] Failed to load " + SceneAddress);
			sceneHandle = default;
			MobileBridge.SendEvent("gameSceneLoadFailed");
		}

		public void ResetLoadingScene(string _)
		{
			if (loadingScreen != null)
			{
				loadingScreen.SetActive(true);
			}

			if (sceneOperation != null)
			{
				StopCoroutine(sceneOperation);
				sceneOperation = null;
			}

			sceneOperation = StartCoroutine(UnloadGameSceneAsync());
		}

		IEnumerator UnloadGameSceneAsync()
		{
			if (sceneHandle.IsValid())
			{
				var unloadOperation = Addressables.UnloadSceneAsync(sceneHandle, true);
				yield return unloadOperation;
			}

			sceneHandle = default;
			sceneLoaded = false;
			sceneOperation = null;
			if (loadingScreen != null)
			{
				loadingScreen.SetActive(true);
			}

			MobileBridge.SendEvent("gameSceneUnloaded");
		}
	}
}
