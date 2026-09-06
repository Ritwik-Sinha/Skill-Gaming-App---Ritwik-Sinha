/**
 * Google OAuth connection values.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ TODO: Replace the placeholder values below with your own credentials.   │
 * │                                                                         │
 * │ Get them from Google Cloud Console → APIs & Services → Credentials:     │
 * │   https://console.cloud.google.com/apis/credentials                     │
 * │                                                                         │
 * │ 1. webClientId  → OAuth client ID of type "Web application".            │
 * │                   Required on BOTH platforms to receive an idToken.     │
 * │ 2. iosClientId  → OAuth client ID of type "iOS".                        │
 * │                   Also paste its REVERSED form into                     │
 * │                   ios/SkillGaming/Info.plist (CFBundleURLSchemes).      │
 * │ 3. For Android, create an OAuth client ID of type "Android" with your   │
 * │    package name (com.skillgaming) and SHA-1 fingerprint. Nothing to     │
 * │    paste here — it only needs to exist in the Cloud Console project.    │
 * │    Debug SHA-1: cd android && ./gradlew signingReport                   │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
export const GOOGLE_AUTH_CONFIG = {
  webClientId: '525394427013-2r7c8pfmnkn53ifci2jru0ht2va60shq.apps.googleusercontent.com',
  iosClientId: '525394427013-2r7c8pfmnkn53ifci2jru0ht2va60shq.apps.googleusercontent.com',

  // Set to true (and configure a backend) if you need a serverAuthCode to
  // exchange for tokens server-side (e.g. Supabase / Firebase functions).
  offlineAccess: false,

  // Size in px of the profile image URL returned by Google.
  profileImageSize: 120,
};
