using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

/// <summary>
/// Exports the Android Gradle project that the React Native app consumes
/// (ReactNative_SkillGaming/unity/builds/android).
///
/// Menu:     Tools ▸ Export Android Gradle Project (for React Native)
/// Headless: Unity -batchmode -quit -projectPath &lt;this project&gt;
///                 -executeMethod AndroidExport.ExportGradleProject [-exportPath &lt;dir&gt;]
///
/// Uses the scenes and Player Settings already configured in the project (IL2CPP, ARM64,
/// entry point, graphics API). It only flips the "Export Project" switch so the output is
/// a Gradle project rather than an APK. libil2cpp.so is compiled later by the app's own
/// Gradle build, exactly as with a manual export.
/// </summary>
public static class AndroidExport
{
    const string DefaultRelativePath = "../ReactNative_SkillGaming/unity/builds/android";

    [MenuItem("Tools/Export Android Gradle Project (for React Native)")]
    public static void ExportFromMenu()
    {
        var report = Export(DefaultPath());
        if (report.summary.result != BuildResult.Succeeded)
        {
            EditorUtility.DisplayDialog("Android export failed", report.summary.result.ToString(), "OK");
        }
    }

    /// <summary>Entry point for -executeMethod. Exits the Editor with 0 on success, 1 on failure.</summary>
    public static void ExportGradleProject()
    {
        BuildResult result;
        try
        {
            result = Export(ArgAfter("-exportPath") ?? DefaultPath()).summary.result;
        }
        catch (Exception e)
        {
            Debug.LogException(e);
            result = BuildResult.Failed;
        }
        EditorApplication.Exit(result == BuildResult.Succeeded ? 0 : 1);
    }

    static string DefaultPath() =>
        Path.GetFullPath(Path.Combine(Application.dataPath, "..", DefaultRelativePath));

    static BuildReport Export(string outputDir)
    {
        var scenes = EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray();
        if (scenes.Length == 0)
        {
            throw new InvalidOperationException("No scenes are enabled in Build Settings.");
        }
        Directory.CreateDirectory(outputDir);
        EditorUserBuildSettings.exportAsGoogleAndroidProject = true;
        EditorUserBuildSettings.buildAppBundle = false;

        var options = new BuildPlayerOptions
        {
            scenes = scenes,
            locationPathName = outputDir,
            target = BuildTarget.Android,
            options = BuildOptions.None,
        };
        Debug.Log($"[AndroidExport] Exporting {scenes.Length} scene(s) to {outputDir}");
        var report = BuildPipeline.BuildPlayer(options);
        Debug.Log($"[AndroidExport] Result: {report.summary.result} in {report.summary.totalTime.TotalSeconds:F0}s");
        return report;
    }

    static string ArgAfter(string flag)
    {
        var args = Environment.GetCommandLineArgs();
        for (int i = 0; i < args.Length - 1; i++)
        {
            if (args[i] == flag)
            {
                return args[i + 1];
            }
        }
        return null;
    }
}
