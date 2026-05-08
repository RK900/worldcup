// Lightweight env-presence check that does NOT import the Firebase SDK.
// Imported by Home + other always-loaded code so the SDK stays in the
// lazy chunk used by pool routes only.

export function isFirebaseConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_FIREBASE_API_KEY &&
      import.meta.env.VITE_FIREBASE_PROJECT_ID &&
      import.meta.env.VITE_FIREBASE_APP_ID,
  );
}
