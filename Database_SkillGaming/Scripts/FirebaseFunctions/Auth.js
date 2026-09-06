/**
 * Auth-related Cloud Functions.
 *
 * onUserLogin — HTTPS callable. The React Native app calls it right after a
 * successful Firebase sign-in, and again whenever an app launch restores a
 * persisted session. It upserts the caller into public.users and returns the
 * row, so the client always has the backend's view of the player.
 *
 * Why a callable instead of an Auth trigger (functions.auth.user().onCreate):
 *   • onCreate fires ONCE, when the Firebase Auth account is first created. It
 *     never runs again, so last_login_at / login_count could not be maintained.
 *   • A trigger cannot return anything to the app and runs asynchronously — the
 *     app's next request can race ahead of the row being written.
 *   • A callable verifies the Firebase ID token for us: context.auth is only set
 *     when the token is valid, so a caller can never write a row for someone else.
 *
 * Client wiring: ReactNative_SkillGaming/src/services/userApi.ts
 * Schema:        supabase/migrations/20260907000000_users_firebase_identity.sql
 */
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { transaction } = require('../db');

if (!admin.apps.length) {
  admin.initializeApp();
}

// Keep in sync with FUNCTIONS_REGION in ReactNative_SkillGaming/src/config/firebaseConfig.ts
const REGION = 'asia-south1';

// PostgreSQL SQLSTATEs that mean the migration has not been applied:
// 42P01 undefined_table, 42703 undefined_column. (`ON CONFLICT (firebase_uid)`
// without its unique index raises 42P10 invalid_column_reference.)
const SCHEMA_ERROR_CODES = new Set(['42P01', '42703', '42P10']);

// Column list shared by the INSERT and UPDATE below; mapped to camelCase in toClient().
const RETURNING = `
  firebase_uid, email, display_name, photo_url, auth_provider,
  login_count, created_at, updated_at, last_login_at`;

/** Trim a string input to a max length; anything that is not a non-empty string → null. */
function clean(value, max) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function toClient(row, isNewUser) {
  return {
    firebaseUid: row.firebase_uid,
    email: row.email,
    displayName: row.display_name,
    photoUrl: row.photo_url,
    authProvider: row.auth_provider,
    loginCount: row.login_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
    isNewUser,
  };
}

exports.onUserLogin = functions.region(REGION).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }

  const { uid, token } = context.auth;
  // Identity always comes from the VERIFIED token. The client payload may only fill
  // gaps (e.g. Google Sign-In returns a larger photo than the token's `picture` claim).
  const email = clean(token.email, 320);
  const displayName = clean(token.name, 120) || clean(data && data.displayName, 120);
  const photoUrl = clean(data && data.photoUrl, 2048) || clean(token.picture, 2048);
  const provider = (token.firebase && token.firebase.sign_in_provider) || 'unknown';

  try {
    const { row, isNewUser } = await transaction(async (client) => {
      // 1. First login → INSERT. ON CONFLICT DO NOTHING makes two concurrent first
      //    logins safe: the loser gets rowCount 0 and falls through to the UPDATE.
      const inserted = await client.query(
        `INSERT INTO users (firebase_uid, email, display_name, photo_url, auth_provider,
                            login_count, last_login_at)
         VALUES ($1, $2, $3, $4, $5, 1, now())
         ON CONFLICT (firebase_uid) DO NOTHING
         RETURNING ${RETURNING}`,
        [uid, email, displayName, photoUrl, provider]
      );
      if (inserted.rowCount === 1) {
        return { row: inserted.rows[0], isNewUser: true };
      }

      // 2. Returning user → refresh profile fields and bump the login counters.
      //    COALESCE keeps the stored value when the token has nothing newer.
      const updated = await client.query(
        `UPDATE users
            SET email         = COALESCE($2, email),
                display_name  = COALESCE($3, display_name),
                photo_url     = COALESCE($4, photo_url),
                auth_provider = $5,
                login_count   = login_count + 1,
                last_login_at = now(),
                updated_at    = now()
          WHERE firebase_uid = $1
          RETURNING ${RETURNING}`,
        [uid, email, displayName, photoUrl, provider]
      );
      if (updated.rowCount !== 1) {
        throw new Error(`users row for ${uid} disappeared between INSERT and UPDATE`);
      }
      return { row: updated.rows[0], isNewUser: false };
    });

    return { user: toClient(row, isNewUser) };
  } catch (error) {
    console.error(`[onUserLogin] failed for uid=${uid}:`, error.message);
    if (SCHEMA_ERROR_CODES.has(error.code)) {
      // The users table is missing a column/table this function writes. Say so
      // explicitly: this is a deployment mistake, not a transient failure.
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Database schema is out of date. Apply ' +
          'Database_SkillGaming/supabase/migrations/20260907000000_users_firebase_identity.sql ' +
          'to the Supabase project.'
      );
    }
    throw new functions.https.HttpsError(
      'internal',
      'Could not save your profile. Please try again.'
    );
  }
});
