# Who Owes Who? V2

A mobile-first shared expense and debt tracker.

## V2 includes
- Editable groups and people
- Dated expenses
- Persistent unsettled bills + settled history
- Running and net balances per person
- Full and partial settlements
- Payment history
- Expense edit/delete
- Amount validation
- Daily reminder settings
- Optional Supabase email authentication and cloud sync
- Shared-group invite codes (cloud mode)

## Preview locally / StackBlitz

```bash
npm install
npm run dev
```

Without Supabase environment variables the app runs in **Local Demo Mode** and saves to localStorage.

## Enable accounts + cloud sync

1. Create a Supabase project.
2. Run `supabase-schema.sql` in Supabase SQL Editor.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to your environment.
4. Restart the dev server.
5. Sign up from the Account screen.

Never put the Supabase service-role key in this frontend project.

## Daily reminders

V2 includes reminder settings and browser notifications while the app is available to the browser. Reliable push notifications when the site is fully closed require a push service / scheduled backend job; that is intentionally not faked in this build.
