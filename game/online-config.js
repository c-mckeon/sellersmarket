// Sellers Market: online play settings.
//
// To play online (Con and Kev, each on their own device), paste your Firebase web app settings here.
// Firebase console → your project → Project settings → General → Your apps → Web app → "SDK setup and
// configuration" → Config. It must include databaseURL (create a Realtime Database first).
// These settings only say which database to use; they're safe to publish.
//
// Leave it as null to play on one device only.

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCMRFY1FCRVLWZXl8EXKAJefBsyloaE4os",
  authDomain: "notes-f8588.firebaseapp.com",
  databaseURL: "https://notes-f8588-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "notes-f8588",
  storageBucket: "notes-f8588.firebasestorage.app",
  messagingSenderId: "106653771180",
  appId: "1:106653771180:web:f9414f2731fb9953664609",
};

// The people who can log in. The first time someone logs in, the password they type becomes theirs.
const ONLINE_PLAYERS = ["Con", "Kev"];
