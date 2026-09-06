# Firebase Auth + Backend Sync

After a Google sign-in the app now does two more things:

1. **Signs the user into Firebase Auth** with the Google ID token
   (`signInWithCredential`). This is what makes the account show up in
   Firebase Console → Authentication → Users.
2. **Calls the `onUserLogin` Cloud Function** (in `Database_SkillGaming`),
   which upserts the player into the `users` table in Postgres/Supabase and
   returns the row. The app keeps it as `profile` in `useAuth()`.

The same callable runs again in the background whenever the app launches
with a restored session, so `last_login_at` / `login_count` stay current.

Everything uses the **Firebase JS SDK** (`firebase` npm package), not
`@react-native-firebase`. That means no `google-services.json` /
`GoogleService-Info.plist` wiring, no Gradle plugin, and no `pod install`
changes — important because the iOS Podfile already uses static frameworks
for the Unity integration.

## Files

| File | Purpose |
| --- | --- |
| `src/config/firebaseConfig.ts` | Firebase web-app config (project id, api key, app id), functions region, emulator switch, and `getFunctionsBaseUrl()` (see the React Native note below). |
| `src/services/firebase.ts` | Creates the Firebase app once, with AsyncStorage-backed Auth persistence, and the Functions client. |
| `src/services/userApi.ts` | `syncUserAfterLogin()` → wraps the `onUserLogin` callable and its `BackendUser` type. |
| `src/auth/AuthContext.tsx` | Google → Firebase → backend flow; exposes `user`, `profile`, `signIn`, `signOut`. |
| `../Database_SkillGaming/Scripts/FirebaseFunctions/Auth.js` | The `onUserLogin` callable (region `asia-south1`). |
| `../Database_SkillGaming/supabase/migrations/20260907000000_users_firebase_identity.sql` | Columns + unique index the callable needs on `users`. |

Read the result anywhere in the app:

```tsx
const { user, profile } = useAuth();
// user.uid        → Firebase UID (backend key)
// user.name / user.photo / user.email
// profile?.loginCount, profile?.isNewUser, profile?.createdAt ...
```

## One-time setup

### 1. Firebase Console → Authentication

Sign-in method → **Google** must be **Enabled**. The web client ID shown
there is the one already in `src/config/authConfig.ts`
(`525394427013-2r7c8pf…`). If sign-in fails with `auth/invalid-credential`,
this is the first thing to check.

### 2. Firebase web app (already done)

A web app named **"Skill Gaming RN (JS SDK)"** is registered in project
`skillgaming-b93ea`; its config is in `src/config/firebaseConfig.ts`.
To print it again:

```sh
firebase apps:sdkconfig WEB 1:525394427013:web:f9396a088c462a3b83fdec --project skillgaming-b93ea
```

### 3. Database: add the columns the callable writes

From `Database_SkillGaming/` (the CLI is already linked to the "Skill Gaming"
Supabase project):

```sh
supabase db push
```

or paste `supabase/migrations/20260907000000_users_firebase_identity.sql`
into Supabase Dashboard → SQL Editor. It is idempotent; it will not touch
columns that already exist. If your `users` table already has `NOT NULL`
columns without defaults that are not in that file, add them to the
`INSERT` in `Auth.js` or give them a default.

### 4. Deploy the function

```sh
cd Database_SkillGaming
firebase deploy --only functions:onUserLogin --project skillgaming-b93ea
```

The `.env` in that folder (Postgres connection) is picked up automatically
at deploy time, exactly like it is for the existing `getUsers` function.

### 5. Run the app

```sh
npm run android   # or npm run ios
```

Sign in → the account appears in Firebase Console → Authentication → Users,
and a row appears in `users` in Supabase.

## Local testing against the Functions emulator

```sh
cd Database_SkillGaming && npm run serve
```

then set `FUNCTIONS_EMULATOR.enabled = true` in `src/config/firebaseConfig.ts`.
Auth still goes to the real Firebase project (the emulator only hosts the
function), so the callable receives a real, verifiable ID token.

## React Native note: always pass an absolute URL to `getFunctions()`

`src/services/firebase.ts` calls `getFunctions(app, getFunctionsBaseUrl())`
with a full URL such as `https://asia-south1-skillgaming-b93ea.cloudfunctions.net`,
**not** `getFunctions(app, 'asia-south1')` as the Firebase docs show.

The SDK decides between "region" and "custom domain" by doing
`new URL(value)` and expecting it to throw for a bare region. React Native's
built-in `URL` polyfill never throws and returns an empty `origin`, so the SDK
treated the region as a custom domain of `""` and posted to `/onUserLogin`.
The request never left the device and surfaced as
`FirebaseError: internal [0]` (`functions/internal`) with
`customData.url: '/onUserLogin'`. The same applies to
`connectFunctionsEmulator()`, which is why the emulator URL is built by hand
in `getFunctionsBaseUrl()`.

`__tests__/functionsUrl.test.ts` reproduces the polyfill behaviour and guards
the fix. Installing `react-native-url-polyfill` would also fix the root cause
for every library, but is not required with this approach.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `auth/invalid-credential` on sign-in | Google provider disabled in Firebase Auth, or `webClientId` in `authConfig.ts` belongs to a different project. |
| `functions/not-found` | Function not deployed, or `FUNCTIONS_REGION` ≠ `functions.region(...)` in `Auth.js`. |
| `functions/unauthenticated` | Callable ran before Firebase sign-in completed. `syncUserAfterLogin` must only be called with `firebaseAuth.currentUser` set (AuthContext already guarantees this). |
| `functions/failed-precondition` "Database schema is out of date" | The `users` table is missing a column, the table, or the unique index. Apply the migration in step 3, then sign in again. No redeploy needed. |
| `functions/internal` "Could not save your profile" | Any other Postgres error. Run `firebase functions:log --only onUserLogin --project skillgaming-b93ea` from `Database_SkillGaming/` to see the SQL error. |
| `functions/internal` with message `internal [0]` and no entry in `functions:log` | The request never left the device. Make sure `getFunctions()` receives an absolute URL (see the React Native note above). |
| Signed in, but no row in `users` | Same as above — the app rolls the sign-in back when the callable fails, so check the logs. |

## Alternative: `@react-native-firebase`

If you later want the native SDK (push notifications, Crashlytics, etc.),
swap `src/services/firebase.ts` for `@react-native-firebase/auth` and
`@react-native-firebase/functions`; the `google-services.json` already in
`android/app/` is for that. Nothing else in the flow changes.
