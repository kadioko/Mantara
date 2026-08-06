# Manual QA checklist — Foundation

- [ ] A new user can register, confirm email, sign in, and sign out.
- [ ] An authenticated user without a membership is sent to onboarding.
- [ ] Onboarding creates one organization, an active owner membership, default roles, and the first mine site.
- [ ] A member can only see its own organization and sites.
- [ ] Direct URL requests without a session redirect to login.
- [ ] Attempted cross-tenant reads and writes are denied by RLS.
- [ ] Publishable key only is present in the browser; no service-role key is exposed.
