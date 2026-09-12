# SkillGaming Backend

Firebase Cloud Functions for player accounts, game matching, wallets, results, ratings, and weekly leagues. The code runs on **Node.js 20** in Firebase region **`asia-south1`** and stores data in **PostgreSQL/Supabase** through `pg`.

The React Native app signs players in with Firebase Auth, then calls the backend with their Firebase identity. The backend updates PostgreSQL inside transactions. Wallet balances are stored in integer cents; the current top-up and withdrawal functions manage **demo money**, with no payment-provider integration.

## Set up and deploy the backend

### 1. Install and select your Firebase project

Requirements: Node.js 20, npm, the Firebase CLI, the Supabase CLI, access to a Firebase project with Authentication configured, and a development Supabase database running PostgreSQL 17. Version 17 is required by the transaction timeout used in `Scripts/db.js`.

From the repository root:

```sh
cd Database_SkillGaming
npm ci
firebase login
firebase use YOUR_FIREBASE_PROJECT_ID
```

Replace the uppercase placeholder with your project ID. The checked-in `.firebaserc` also provides the alias `skillgame` for `skillgaming-b93ea`; use it only when that is your intended project. There is no separate compilation step.

### 2. Prepare the database

From this folder, link the intended **development** Supabase project and apply the migrations:

```sh
supabase login
supabase link --project-ref YOUR_SUPABASE_PROJECT_REF
supabase db push --dry-run
supabase db push
```

The seven files in `supabase/migrations/` create the complete schema, starting with `users` and adding bets, attempts, wallets, refunds, ratings, and leagues. Apply them through migration history in filename order. No seed file is provided.

Create or update the git-ignored `.env` in this folder using your database connection details:

```dotenv
PG_HOST=your-database-host
PG_PORT=5432
PG_DATABASE=postgres
PG_USER=your-database-user
PG_PASSWORD=your-database-password
```

Use the host, port, and username from your chosen Supabase connection configuration; a transaction pooler commonly uses port `6543`. These are database credentials, not a Supabase API key. Firebase loads the environment file for the Functions runtime.

### 3. Deploy a Firebase function

After completing the project and database setup above, run these commands from `Database_SkillGaming/`. Replace `YOUR_FIREBASE_PROJECT_ID` with your Firebase project ID and `onUserLogin` with the exported function you want to deploy:

```sh
npm test
firebase deploy --only functions:onUserLogin --project YOUR_FIREBASE_PROJECT_ID
```

The Firebase CLI uploads the code and creates or updates **only the selected function** in the cloud. In this example, that function is `onUserLogin`. The name after `functions:` is the exported function name, not its filename. For example, `Auth.js` exports `onUserLogin`, and the root `index.js` exposes it for deployment. To add a new function, export it from its module and make sure that module's exports are included in the root `index.js`.

To deploy several functions together, list their exported names separated by commas:

```sh
firebase deploy --only functions:onUserLogin,functions:getMyWallet --project YOUR_FIREBASE_PROJECT_ID
```

When changing shared code such as `Bet/service.js` or `Scripts/db.js`, redeploy every function affected by that change. Deploying one function does not update the others.

To deploy **all exported functions**, use the package script:

```sh
npm run deploy -- --project YOUR_FIREBASE_PROJECT_ID
```

**All-function deployment includes `getUsers`**, the unauthenticated debug endpoint in [`Test.js`](Scripts/FirebaseFunctions/Test.js) that returns all user rows. Restrict or remove that export before a production deployment. Deployment publishes Functions only; apply database migrations separately using step 2.

### 4. Verify the deployment

After the CLI reports success, call the function from the mobile app and inspect its logs:

```sh
firebase functions:log --only onUserLogin --project YOUR_FIREBASE_PROJECT_ID
```

For `onUserLogin`, sign in through the app and confirm the profile loads and the user's login record updates in PostgreSQL. Match the app's Firebase project and `asia-south1` region in [`firebaseConfig.ts`](../ReactNative_SkillGaming/src/config/firebaseConfig.ts) to this deployment. Most endpoints require a signed-in user; see the [Firebase setup guide](../ReactNative_SkillGaming/FIREBASE_BACKEND_SETUP.md) for client authentication setup.

## Key components

- **[`index.js`](index.js):** exports every Firebase function; this is the deployment entry point.
- **[`Scripts/db.js`](Scripts/db.js):** shared PostgreSQL connection pool, transactions, connection retries, and timeout handling.
- **[`Auth.js`](Scripts/FirebaseFunctions/Auth.js):** `onUserLogin` creates or updates the user profile from the authenticated Firebase identity.
- **[`Bet/`](Scripts/FirebaseFunctions/Bet/):** authenticated game and wallet endpoints. `index.js` handles Firebase requests; `service.js` handles stake reservations, matching, score checkpoints, settlement, refunds, results, and ratings. `finalizeStaleGames` handles expired attempts and unmatched bets.
- **[`League/`](Scripts/FirebaseFunctions/League/):** league standings, player events, rollover, and reward delivery. `settleLeagues` closes overdue periods and delivers payouts; the default weekly boundary is Monday midnight in New York.
- **[`supabase/migrations/`](supabase/migrations/):** database tables, constraints, indexes, and SQL functions/triggers, including league and rating rules.
- **[`test/`](test/):** unit tests and PostgreSQL integration tests for game settlement, concurrency, wallets, and leagues.

Detailed behavior is documented in [Game lifecycle](GAME_LIFECYCLE.md) and [Weekly leagues](LEAGUES.md).

## Mock data and docs

The `MockData/` folder contains synthetic datasets, weekly reward and platform-profit analysis, scenario comparisons, and charts. Documentation is grouped in `MockData/docs/`, with separate folders for input/output data, generation and analysis scripts, and tests. These simulations do not change live league pools.

**[Open the Mock Data README](MockData/docs/README.md)** for the document index, folder layout, dataset explanations, and commands to regenerate the results and charts.

## Tests

```sh
npm test
```

Unit tests need no database. For integration tests, create a disposable local PostgreSQL 17 database named `skillgaming_test`, following the Docker example in [Game lifecycle — Validation](GAME_LIFECYCLE.md#validation), then run:

```sh
export TEST_DATABASE_URL='postgres://postgres:YOUR_TEST_PASSWORD@127.0.0.1:55439/skillgaming_test'
npm run test:integration
node --test test/leagues.integration.test.js
```

Both integration suites **drop and recreate the database's `public` schema**. They enforce a local test database; run them sequentially when sharing it.

`Scripts/deploy-leagues.js` is a separate helper for applying **only** the league migration to an existing database. It uses its own migration tracking; do not use it as a fresh setup command or after Supabase has already applied the league migration. See [Weekly leagues](LEAGUES.md) for that workflow.
