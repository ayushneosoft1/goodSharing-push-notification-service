import admin from "firebase-admin";
import { env } from "./env.js";

let firebaseApp;

export function getFirebaseApp() {
  if (firebaseApp) {
    return firebaseApp;
  }

  if (
    !env.firebase.projectId ||
    !env.firebase.clientEmail ||
    !env.firebase.privateKey
  ) {
    throw new Error(
      "Firebase configuration is missing. Check FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.",
    );
  }

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: env.firebase.projectId,
      clientEmail: env.firebase.clientEmail,
      privateKey: env.firebase.privateKey.replace(/\\n/g, "\n"),
    }),
  });

  return firebaseApp;
}
