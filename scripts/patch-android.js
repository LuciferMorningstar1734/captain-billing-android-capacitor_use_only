// Run after `npx cap add android`: wires in google-services.json, Google sign-in, and the fixed signing key.
const fs = require('fs'), path = require('path');
const die = m => { console.error('\n✖ ' + m + '\n'); process.exit(1); };

const gs = 'google-services.json';
if (!fs.existsSync(gs)) die('google-services.json is missing in the repo root.\nFirebase console ▸ Project settings ▸ Your apps ▸ Add Android app (package com.captainbilling.mobile, add the SHA-1 from README) ▸ download google-services.json ▸ put it next to package.json.');
const g = JSON.parse(fs.readFileSync(gs, 'utf8'));
const client = (g.client || []).find(c => c.client_info && c.client_info.android_client_info && c.client_info.android_client_info.package_name === 'com.captainbilling.mobile');
if (!client) die('google-services.json is not for package com.captainbilling.mobile. Re-download it after adding the Android app with exactly that package name.');
const hasAndroidOAuth = (client.oauth_client || []).some(o => o.client_type === 1);
const hasWebOAuth = (g.client || []).some(c => (c.oauth_client || []).some(o => o.client_type === 3));
if (!hasAndroidOAuth || !hasWebOAuth) die('google-services.json has no OAuth client for Google sign-in. Make sure Google sign-in is enabled in Firebase ▸ Authentication, the SHA-1 is added to the Android app, then download google-services.json again.');
fs.copyFileSync(gs, 'android/app/google-services.json');

// Google sign-in dependency of @capacitor-firebase/authentication
const vp = 'android/variables.gradle'; let v = fs.readFileSync(vp, 'utf8');
if (!/rgcfaIncludeGoogle/.test(v)) v = v.replace(/ext\s*\{/, 'ext {\n    rgcfaIncludeGoogle = true');
fs.writeFileSync(vp, v);

// Always sign with the same key: Google sign-in is bound to its SHA-1.
fs.copyFileSync('signing/captain.keystore', 'android/app/captain.keystore');
const bp = 'android/app/build.gradle'; let b = fs.readFileSync(bp, 'utf8');
if (!/captain\.keystore/.test(b)) b = b.replace(/android\s*\{/, `android {
    signingConfigs {
        debug {
            storeFile file('captain.keystore')
            storePassword 'captainbilling'
            keyAlias 'captain'
            keyPassword 'captainbilling'
        }
        release {
            storeFile file('captain.keystore')
            storePassword 'captainbilling'
            keyAlias 'captain'
            keyPassword 'captainbilling'
        }
    }`);
b = b.replace(/(buildTypes\s*\{\s*release\s*\{)/, '$1\n            signingConfig signingConfigs.release');
fs.writeFileSync(bp, b);
console.log('android project patched (google-services, Google sign-in, signing).');
