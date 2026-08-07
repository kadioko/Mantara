# Manual QA checklist — Foundation

Before beginning this checklist, apply all migrations in the linked Supabase project. Track wider project progress in the [roadmap](roadmap.md).

Automated status as of 7 August 2026: typecheck, production build, and 9 unit tests pass. This checklist remains manual and must be completed with real authenticated users before a pilot.

- [ ] A new user can register, confirm email, sign in, and sign out.
- [ ] An authenticated user without a membership is sent to onboarding.
- [ ] Onboarding creates one organization, an active owner membership, default roles, and the first mine site.
- [ ] A member can only see its own organization and sites.
- [ ] User can change active organization and active mine-site context; each selection persists after a refresh.
- [ ] User can switch between English and Kiswahili on login, onboarding, dashboard, and Workers; the language persists after a refresh.
- [ ] Authorized users can record attendance for an active worker; recording the same worker and date updates the existing record instead of duplicating it.
- [ ] Worker details cannot be opened by a user outside the active organization/site.
- [ ] A company owner can access the Workers and Attendance navigation; a viewer without `worker.read` cannot.
- [ ] Direct URL requests without a session redirect to login.
- [ ] Attempted cross-tenant reads and writes are denied by RLS.
- [ ] Publishable key only is present in the browser; no service-role key is exposed.
