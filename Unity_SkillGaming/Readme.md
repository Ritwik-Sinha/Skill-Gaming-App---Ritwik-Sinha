# Unity Skill Gaming — Jungle Swing

The Unity gameplay project for the Skill Gaming app. **Jungle Swing** is a 2D endless game: hold to swing using the chameleon’s tongue, release to fly, bounce on logs, and avoid the water and chasing snake. Distance determines the score.

Unity handles gameplay and sends scores to the React Native app. The host app handles paid sessions, results and navigation.

## Requirements

- **Unity 6000.1.13f1**, installed through Unity Hub; see [ProjectVersion.txt](ProjectSettings/ProjectVersion.txt).
- Let Unity restore the packages in [manifest.json](Packages/manifest.json), including **Addressables 2.6.0** and Unity UI.
- For Android export, install that Editor version’s **Android Build Support**, including SDK, NDK and OpenJDK.

## Run in the Unity Editor

1. Add the `Unity_SkillGaming` folder to Unity Hub and open it with the version above.
2. Wait for asset import and compilation to finish; resolve any Console errors before playing.
3. Open [LoadingScene.unity](Assets/Project/Scenes/LoadingScene.unity).
4. In **Window → Asset Management → Addressables → Groups**, use **Play Mode Script → Use Asset Database (fastest)** for local testing.
5. Press **Play**. In Editor mode, `SceneLoader` automatically starts an `editor-preview` session and loads Jungle Swing. No backend session is required for this preview.
6. In the Game view, **hold the left mouse button** to start and latch onto a nearby swing; **release** to launch. On a device, use touch-and-hold instead.

After game over, stop and restart Play mode for another run. The game currently waits for the host to open results rather than offering an in-scene restart. `[MobileBridge]` messages in the Editor Console are expected preview output.

## Run inside the Android app

1. Switch the active Unity build platform to **Android**. Keep `LoadingScene` enabled in the scene list; `JungleSwing` is an Addressable scene.
2. Build Addressables content for Android, or enable **Build Addressables on Player Build** in the Editor’s Addressables preferences. The export helper relies on that preference rather than explicitly building content itself.
3. Choose **Tools → Export Android Gradle Project (for React Native)**.
4. The export goes directly to `../ReactNative_SkillGaming/unity/builds/android`. Build and run the host using its [README](../ReactNative_SkillGaming/README.md) and [backend setup guide](../ReactNative_SkillGaming/FIREBASE_BACKEND_SETUP.md).

On mobile, the loading scene waits for React Native to call `GameSceneLoader.LoadGameScene(sessionId)` with the server-created bet ID. The host later calls `ResetLoadingScene(sessionId)` to unload that attempt. Launching the Unity export alone will not automatically start a game.

After changing Unity C# or game assets, **re-export and rebuild the native app**; refreshing Metro is insufficient. If Gradle cannot find `unityLibrary` on macOS/Linux, check [settings.gradle](../ReactNative_SkillGaming/android/settings.gradle): its checked-in Windows-style path should resolve to `../unity/builds/android/unityLibrary` on those systems.

**iOS:** bridge code exists, but there is no equivalent export helper or exported iOS framework in the host’s Unity build folder. UnityFramework/native plug-in integration must be completed separately before running on iOS.

## Key components

Most gameplay code lives in [Assets/Project/Scripts/JungleSwing](Assets/Project/Scripts/JungleSwing):

- **[SceneLoader](Assets/Project/Scripts/JungleSwing/Addressables/SceneLoader.cs):** loads and unloads the game through Addressables, tracks session IDs, and controls the loading screen.
- **[GameManager](Assets/Project/Scripts/JungleSwing/Managers/GameManager.cs):** coordinates `Ready → Playing → Dying → GameOver`, spawns actors, calculates distance, saves the local best score and reports results.
- **[PlayerController](Assets/Project/Scripts/JungleSwing/Player/PlayerController.cs):** handles mouse/touch input, tongue attachment, swing physics, launches and log bounces.
- **[WorldGenerator](Assets/Project/Scripts/JungleSwing/Managers/WorldGenerator.cs) and [World scripts](Assets/Project/Scripts/JungleSwing/World):** create swings, logs and scenery ahead of the camera and remove old objects. Fireflies provide visual feedback rather than score bonuses.
- **[SnakeChaser](Assets/Project/Scripts/JungleSwing/Player/SnakeChaser.cs) and [CameraRig](Assets/Project/Scripts/JungleSwing/Player/CameraRig.cs):** provide the pursuing hazard, camera following and impact shake.
- **[HudUI](Assets/Project/Scripts/JungleSwing/UI/HudUI.cs), [effects](Assets/Project/Scripts/JungleSwing/Fx) and [audio/haptics](Assets/Project/Scripts/JungleSwing/Managers):** display the score and prompts, and provide particles, sound and vibration.
- **[MobileBridge](Assets/Project/Scripts/JungleSwing/MobileBridge/MobileBridge.cs):** sends session-tagged lifecycle events, `scoreUpdate` checkpoints and `gameOver` results to `@azesmway/react-native-unity`.
- **[AndroidExport](Assets/Editor/AndroidExport.cs):** implements the export menu and the command-line entry point `AndroidExport.ExportGradleProject`.

Scenes and reusable objects are wired through the Inspector in [Scenes](Assets/Project/Scenes) and [Prefabs](Assets/Project/Prefabs). Preserve those references when editing. Treat `Library/` and exported build folders as generated output; make gameplay changes in `Assets/Project/`.
