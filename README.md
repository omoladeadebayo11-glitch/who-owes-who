# Who Owes Who? V2.1

Mobile-first Nigerian Naira expense splitter built with React + Vite.

## V2.1 account/cloud behavior
- Signed-out mode keeps a local workspace on that browser/device.
- Each signed-in Supabase account loads only groups that account belongs to.
- New accounts automatically receive a fresh cloud group.
- Expense, people, payment, settlement and group-name changes save to Supabase while signed in.
- Signing out restores the separate signed-out local workspace.
- A signed-in user can optionally copy their old signed-out local workspace into the current cloud group.
- Shared groups remain shared through Supabase group membership/invite codes.

## Supabase
Run `supabase-schema.sql` in the Supabase SQL Editor, then provide:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

The value used for `VITE_SUPABASE_ANON_KEY` can be the browser-safe Supabase publishable key.

## Run
```bash
npm install
npm run dev
```
