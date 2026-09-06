import UnityView from '@azesmway/react-native-unity';

/**
 * A UnityView that survives React unmounts.
 *
 * With this Unity 6 export, Unity as a Library can be created only ONCE per
 * Android process. The stock <UnityView> calls unloadUnity() in
 * componentWillUnmount, and the next mount then boots a second UnityPlayer,
 * which logs "Graphics device is null", dies with SIGTRAP about a second
 * later, and force-finishes the activity. That is exactly what happened on
 * sign-out → sign-in (GameScreen unmounts and remounts) and on a full Metro
 * reload.
 *
 * This subclass never unloads. On unmount it pauses the engine and lets the
 * native bridge park the Unity frame off-screen (its onDetachedFromWindow
 * does that). On the next mount the bridge's createViewInstance re-attaches
 * the still-live player instead of creating a new one, and we resume it.
 */

// The bridge's onViewAttachedToWindow re-applies a pending pause 300ms after a
// re-mount, so the resume is issued twice: immediately, and once that timer
// has certainly fired.
const RESUME_RETRY_MS = 600;

export default class PersistentUnityView extends UnityView {
  private resumeTimer: ReturnType<typeof setTimeout> | null = null;

  componentDidMount() {
    // On the very first mount the player does not exist yet and both calls are
    // no-ops natively; on a re-mount they undo the pause from the last unmount.
    this.resumeUnity();
    this.resumeTimer = setTimeout(() => {
      this.resumeTimer = null;
      this.resumeUnity();
    }, RESUME_RETRY_MS);
  }

  componentWillUnmount() {
    if (this.resumeTimer) {
      clearTimeout(this.resumeTimer);
      this.resumeTimer = null;
    }
    // Deliberately NOT calling super.componentWillUnmount(): that unloads the
    // engine, and a reload after unload crashes (see above). Pause instead so
    // the parked player stops burning CPU while no screen shows it.
    this.windowFocusChanged(false);
    this.pauseUnity(true);
  }
}
