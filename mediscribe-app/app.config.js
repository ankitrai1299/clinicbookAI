// Dynamic config, for ONE reason: google-services.json cannot be committed.
//
// ─────────────────────────────────────────────────────────────────────────────
// DIVERGENCE FROM THE REFERENCE APP — see docs/DIVERGENCES.md.
//
// The reference ships a static app.json and nothing else. This file exists
// only to resolve the Firebase config file path at build time; every other
// value still comes from app.json, untouched.
// ─────────────────────────────────────────────────────────────────────────────
//
// Why it is needed: this repository is public, so the Firebase config is not
// committed — and EAS Build uploads only git-tracked files, so a gitignored
// file is simply absent when the build runs. That is exactly how the first FCM
// build failed.
//
// It is supplied instead as an EAS FILE environment variable. The builder
// writes it to a temporary path and passes that path in GOOGLE_SERVICES_JSON.
// Locally the variable is unset and the developer's own copy is used.

module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON || './google-services.json',
  },
});
