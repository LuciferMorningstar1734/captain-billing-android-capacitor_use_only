# Captain Billing — Android (synced with the Windows app)

Sign in with Google on the phone using the **same Google account** as the Windows app. Both read and write the same
Firebase project (`billing-app-70f4f`), so a bill made on the PC appears on the phone within seconds and vice-versa.
Works offline: changes are kept on the phone and upload automatically when the network is back.

**Features:** GST / non-GST bills · bill numbers continue the Windows sequence (same prefixes, width, per financial year) ·
item list, shortcut keys and per-customer price lists from the PC auto-fill rates · discount · CGST/SGST · unpaid/partial/paid ·
PDF + share · WhatsApp message · search/filters · import `.lbb` · backup.

## One-time setup (≈10 minutes)

### 1. Register the Android app in Firebase
Firebase console ▸ project **billing-app-70f4f** ▸ ⚙ Project settings ▸ *Your apps* ▸ **Add app ▸ Android**
- Package name: `com.captainbilling.mobile`
- SHA-1 certificate fingerprint: `60:B2:B1:F4:40:D4:2E:F8:7A:DE:C4:67:A4:D9:9F:34:4C:38:AD:25`
  (this is the fixed key in `signing/captain.keystore`; every build uses it, so Google sign-in keeps working)
- Download **google-services.json** and put it in the repo root (next to `package.json`).

Also check Firebase ▸ Authentication ▸ Sign-in method ▸ **Google is enabled** (it already is if the Windows app signs in).
Your Firestore rules from the Windows app's setup already work — nothing to change.

### 2. Build the APK on GitHub (no Android Studio)
1. Push this folder to a **private** GitHub repo (it contains the signing key and google-services.json).
2. **Actions ▸ Build Android APK** (runs on every push, or *Run workflow*). ~5–8 min.
3. Open the finished run ▸ download **captain-billing-apk** ▸ unzip ▸ copy `app-debug.apk` to the phone and install
   (allow "install unknown apps").

If the build stops with a message about `google-services.json`, it tells you exactly what's wrong.

## Notes
- **Item list, shortcut keys and price lists** are edited on the PC (they sync to the phone). The phone edits business details,
  bill-number settings, bills and contacts.
- Phone settings changes only touch the fields the phone shows, so your logo/signature/price lists on the PC are never overwritten.
- Deleting a bill on the phone deletes it for the PC too.
- PDFs show `Rs.` instead of `₹` (the PDF library's built-in font has no ₹ glyph).
- Trial/subscription status of the Windows app is ignored here (personal use).

## Develop
`src/cloud.js` (Firebase + native) is bundled into `www/vendor/cloud.js` by `npm run prepare-web`. UI is plain JS in `www/`.
`npm test` checks the billing maths and the bill ⇄ Firestore mapping.
