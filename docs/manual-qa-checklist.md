# Manual QA checklist — Foundation

Before beginning this checklist, apply the foundation migration to the linked Supabase project. Track wider project progress in the [roadmap](roadmap.md).

- [ ] A new user can register, confirm email, sign in, and sign out.
- [ ] An authenticated user without a membership is sent to onboarding.
- [ ] Onboarding creates one organization, an active owner membership, default roles, and the first mine site.
- [ ] A member can only see its own organization and sites.
- [ ] User can change active organization and active mine-site context; each selection persists after a refresh.
- [ ] User can switch between English and Kiswahili on login, onboarding, dashboard, and Workers; the language persists after a refresh.
- [ ] Authorized users can record attendance for an active worker; recording the same worker and date updates the existing record instead of duplicating it.
- [ ] Direct URL requests without a session redirect to login.
- [ ] Attempted cross-tenant reads and writes are denied by RLS.
- [ ] Publishable key only is present in the browser; no service-role key is exposed.
