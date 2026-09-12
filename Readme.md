# Skill Gaming App

This repository contains three projects that work together to run the Skill Gaming app: a React Native mobile app, a Unity game, and a Firebase/PostgreSQL backend. Players enter Jungle Swing contests, submit scores, view results, and compete in weekly leagues. The current wallet uses **demo money**.

## Target platform and APK testing

**Target platform: Android.** Install the shared APK on an Android device and sign in with **any Google account** to test the app. No dedicated test account is required.

Test-account credentials are not published in this repository or shared publicly, to avoid exposing the account owner's phone number or email address. Please use your own Google account when testing the shared APK.

## Main versions

The table lists the main frameworks, tools, and plugins. Versions come from the npm lockfiles, Node requirements in each project's `package.json`, and Unity/Supabase project configuration.

| Component | Version |
| --- | --- |
| Unity Editor | 6000.1.13f1 |
| React Native | 0.86.0 |
| React | 19.2.3 |
| TypeScript (React Native app) | 5.8.3 |
| Node — React Native tooling | 22.11.0 or later |
| Node — Firebase Functions runtime | 20 |
| `firebase-functions` | 5.1.1 |
| `firebase-admin` | 12.7.0 |
| Unity Addressables / Unity UI | 2.6.0 / 2.0.0 |
| Unity bridge (`@azesmway/react-native-unity`) | 1.1.1 |
| Google Sign-In (`@react-native-google-signin/google-signin`) | 16.1.5 |
| Firebase JavaScript SDK (mobile) | 12.18.0 |
| PostgreSQL | 17 |

The Node entries describe project requirements. Use the appropriate Node version when working in each project.

## Projects

### ReactNative_SkillGaming — Mobile app

The player-facing application. It handles sign-in, navigation, game entry, wallets, results, profiles, and league screens. It embeds the Unity game and communicates with the backend to manage game sessions and display account data.

**[Open the React Native README](ReactNative_SkillGaming/README.md)** for mobile build and run instructions.

### Unity_SkillGaming — Gameplay

The Unity project for **Jungle Swing**, a 2D game where players swing, bounce, and avoid hazards to build a distance-based score. It handles gameplay, physics, world generation, visuals, and audio, and sends session events and scores to the mobile app through a native bridge.

**[Open the Unity README](Unity_SkillGaming/Readme.md)** for Editor setup, gameplay preview, Android export, and key scripts.

### Database_SkillGaming — Backend and database

The server side of the application. Firebase Functions handle authenticated accounts, bet matching, game settlement, wallets, ratings, and league rewards. PostgreSQL/Supabase stores the data, with migrations defining the schema and database rules.

**[Open the Backend README](Database_SkillGaming/Readme.md)** for database setup, Firebase function deployment, key components, and tests.

## How they work together

1. The player signs in through the React Native app and chooses a game entry stake.
2. The app asks the backend to reserve an entry and create a game session, then passes the session ID to Unity.
3. Unity runs the game and sends score updates and the final result to React Native, which forwards them to the backend.
4. The backend matches entries, settles completed contests, and updates wallet, rating, and league records. React Native displays the results.

For an integrated Android run, configure the backend first, export the Unity game into the mobile project, then build and run React Native. Follow the project READMEs above for the exact steps. Unity's Editor preview can also run independently.

## More documentation

- **[Firebase and mobile setup](ReactNative_SkillGaming/FIREBASE_BACKEND_SETUP.md):** connect mobile authentication and backend calls.
- **[Mobile match flow](ReactNative_SkillGaming/MATCH_FLOW.md):** game sessions, recovery, results, and native rebuilds.
- **[Backend game lifecycle](Database_SkillGaming/GAME_LIFECYCLE.md):** matching, settlement, refunds, and wallet behavior.
- **[Weekly leagues](Database_SkillGaming/LEAGUES.md):** crowns, promotions, weekly periods, and payouts.
- **[Mock Data README](Database_SkillGaming/MockData/docs/README.md):** synthetic datasets, reward and platform-profit analysis, charts, and reproduction commands. These simulations do not change live reward pools.
