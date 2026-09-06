# Google Sign-In Setup

Google authentication now gates the Unity view: `<UnityView />` (inside
`src/screens/GameScreen.tsx`) is only mounted after a successful sign-in.
The app builds and runs with the placeholders in place, but the Google
sign-in dialog will fail until you fill in real client IDs.

## How it works

| File | Purpose |
| --- | --- |
| `src/config/authConfig.ts` | **All connection values (placeholders) live here.** |
| `src/auth/AuthContext.tsx` | `AuthProvider` / `useAuth()` — sign-in, sign-out, session restore. Persists the user profile (name, email, photo, id, idToken) to AsyncStorage under `@skillgaming/auth_user`. |
| `src/screens/SignInScreen.tsx` | Shown while signed out (Google sign-in button). |
| `src/screens/GameScreen.tsx` | Unity view + user header; only mounted when authenticated. |
| `src/components/UserHeader.tsx` | Displays the signed-in user's photo (or initials) and name, with sign-out. |
| `App.tsx` | Routes: restoring → spinner, signed out → `SignInScreen`, signed in → `GameScreen`. |

Anywhere in the app you can read the user with:

```tsx
import { useAuth } from './src/auth/AuthContext';

const { user } = useAuth();
// user.name, user.photo, user.email, user.id, user.idToken
```

## Values you must fill in

Create OAuth client IDs in [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
(configure the OAuth consent screen first if you haven't).

### 1. Web client ID — `src/config/authConfig.ts`

Create an OAuth client of type **Web application**. Paste its ID into
`webClientId`. This is required on **both** platforms to get an `idToken`
(which you'll need if you later verify the user in Supabase/Firebase).

### 2. iOS client ID — two places

Create an OAuth client of type **iOS** with bundle ID `com.skillgaming`
(or whatever your `PRODUCT_BUNDLE_IDENTIFIER` is).

- Paste the client ID into `iosClientId` in `src/config/authConfig.ts`.
- Paste its **reversed** form into `ios/SkillGaming/Info.plist` under
  `CFBundleURLTypes → CFBundleURLSchemes`, replacing
  `com.googleusercontent.apps.YOUR_IOS_CLIENT_ID`.
  (Reversed means: `1234-abcd.apps.googleusercontent.com` →
  `com.googleusercontent.apps.1234-abcd`.)

### 3. Android client ID — Cloud Console only

Create an OAuth client of type **Android** with:

- Package name: `com.skillgaming`
- SHA-1 fingerprint — for debug builds get it with:

  ```sh
  cd android && ./gradlew signingReport
  ```

Nothing gets pasted into the repo for this one — it just has to exist in the
same Cloud Console project as the web client ID. No `google-services.json`
is needed (we're not using Firebase for auth).

## After filling in values

```sh
# iOS (requires the Unity iOS export at unity/builds/ios first)
cd ios && bundle exec pod install && cd .. && npm run ios

# Android
npm run android
```

Note: `pod install` currently fails at the `react-native-unity` copy step
because `unity/builds/ios/` doesn't exist yet — export the Unity project for
iOS to that folder first. The Google Sign-In pods themselves resolve fine.

## Later: hooking auth to Supabase

`user.idToken` is stored with the profile. When you're ready, exchange it
server-side (e.g. `supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })`)
— set `offlineAccess: true` in `authConfig.ts` if you also need a
`serverAuthCode`.
