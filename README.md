# Pinellas Sugar Rush Speedway — Live v1.0.1

This is the GitHub Pages deployment package.

## Privacy architecture

The Monday sync calculates the complete eligible ranking, including players who have not opted in.

Two outputs are produced:

- `public/data/rankings.json` — safe public data. Named stats only for opted-in players; anonymous players contain placement only.
- `data/private-weekly.enc` — AES-256-GCM encrypted weekly snapshot containing the private identity→ranking mapping.

The encrypted snapshot can safely live in the public repository because the encryption key exists only in GitHub Actions Secrets.

That means an opt-in change later in the week can regenerate the public leaderboard from Monday's encrypted snapshot without querying Play Hub again.

## GitHub setup

Suggested repository name:

`Pinellas-Sugar-Rush-Speedway`

Upload the contents of this folder. Make sure `.github/workflows/deploy-pages.yml` is present.

Then:

1. Repository **Settings → Pages**
2. Under **Build and deployment**, choose **GitHub Actions**.

### Create the encryption key

On your computer, from this project folder:

```bat
npm.cmd run generate:key
```

It prints a long random value.

Do **not** post that value publicly or paste it into chat.

In GitHub:

**Settings → Secrets and variables → Actions → New repository secret**

Name:

`SPEEDWAY_SNAPSHOT_KEY`

Value:

paste the generated key.

## First online refresh

Go to:

**Actions → Update rankings and deploy site → Run workflow**

Leave **Refresh Play Hub results before deploying** checked.

The action will:

1. collect six weeks of Play Hub matches from the seven configured stores;
2. calculate the Power Rankings;
3. encrypt the complete private snapshot;
4. write the privacy-safe public rankings;
5. commit the encrypted weekly snapshot/public output;
6. deploy GitHub Pages.

## Schedule

The workflow is configured for:

**Monday at 2:17 AM America/New_York**

Ordinary visitors never query Play Hub.

## Opt-in changes between Mondays

Opt-ins are currently administered through:

`data/opt-ins.json`

After adding/removing/updating an opt-in, GitHub will trigger a deployment. The workflow decrypts Monday's stored snapshot and rebuilds the public leaderboard without calling Play Hub again.

You can also manually run the workflow with:

**Refresh Play Hub results before deploying = false**

to force an immediate public rebuild without an API refresh.

## Self-service JOIN / UPDATE / REMOVE

The arcade buttons and form UI are present, but self-service submission is deliberately not connected yet. The ranking itself can go live now; the next step is connecting that form to a lightweight request store/workflow without placing private ranking data in the browser.

## Local testing

```bat
npm.cmd install
npm.cmd run sync
npm.cmd start
```

Without `SPEEDWAY_SNAPSHOT_KEY`, local runs use the ignored plaintext `data/private-weekly.json`.

Open:

`http://localhost:4174`
