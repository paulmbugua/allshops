# Staff account activation

Owners and authorized administrators create staff from **Settings → Users** on
web or **Users & roles** in the mobile app. AllShops generates an employee ID,
a high-entropy temporary password and a one-time activation token. Only hashes
are stored; the plaintext temporary password exists only long enough to place
it in the invitation email.

The recipient activates the assigned role and branch through the email button,
then signs in with the temporary password. `mustChangePassword` restricts the
authenticated session to `/auth/me`, logout and
`/auth/change-temporary-password` until a different private password is saved.
The private password is never shown to the inviting administrator.

Invitations created or resent from mobile use `/mobile/*` email links. Android
App Links open those links directly in `com.allshops.pos` when domain
verification succeeds. The handoff page also invokes the `allshops://account`
scheme for installed Android and iOS apps, then falls back to the equivalent
web form if the app is unavailable. Web-originated emails remain in the web
activation/reset flow.

Resending a pending invitation revokes older invitation tokens, rotates the
temporary password and emails the replacement credentials. Password-reset
links remain one-time, expire after one hour and clear the forced-change flag
after the new password is saved.
