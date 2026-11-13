# Leaderboard on x1racing.com (Lovable + Supabase)

The sim keeps a leaderboard of the best clean lap per X handle. On x1racing.com it uses the site's Supabase database. Until that is connected, the board only shows laps from the visitor's own device.

## What the site needs

1. The tables in `docs/leaderboard.sql`.
2. A small file, `x1-sim-config.json`, in the same folder as the sim's HTML file:

   ```json
   { "supabaseUrl": "https://YOUR-PROJECT.supabase.co", "supabaseAnonKey": "YOUR-ANON-KEY" }
   ```

   The anon key is the public one that is safe to ship in a web page. Never put the service role key in this file.

The sim looks for the file next to the page, in the page's own folder, and at the site root. No rebuild of the sim is needed.

## Prompt to paste into Lovable

> Add a leaderboard backend for the flying car sim at /sim. Do not change any page design.
>
> 1. If this project is not connected to Supabase yet, connect it.
> 2. Run this SQL as a migration, exactly as written: *(paste the whole of `docs/leaderboard.sql` here)*
> 3. Create a static file `public/x1-sim-config.json` containing this project's Supabase URL and anon (publishable) key, in this exact shape: `{ "supabaseUrl": "...", "supabaseAnonKey": "..." }`. Use the anon key only, never the service role key.
> 4. Make sure `/x1-sim-config.json` and `/X1_SkyRacer_Ships.bin` are served as static files and are not caught by the app's page router.
> 5. Confirm the row level security: anonymous visitors can insert into `x1_laps` and select from the `x1_leaderboard` view, and cannot select, update or delete rows in `x1_laps`.

## Checking it

Open x1racing.com/sim, press B (or Leaderboard in the menu). Under the title it should say "x1racing.com leaderboard". If it says "This device only", the config file was not found. If it says it could not reach the leaderboard, the SQL or the key is wrong; the reason is shown in brackets.

## Limits to know about

- Handles are typed in, not verified. Anyone can enter any handle. Proving ownership needs "Sign in with X", which is a bigger change.
- Times are sent by the visitor's browser, so a determined person can submit a fake time. The database rejects laps under 40 seconds and limits each handle to 30 entries an hour. To remove an entry, run the delete line at the bottom of the SQL file.
