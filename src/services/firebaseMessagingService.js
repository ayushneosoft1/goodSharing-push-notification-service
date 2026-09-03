import { getMessaging } from "firebase-admin/messaging";
import { getFirebaseApp } from "../config/firebase.js";

function normalizeData(data = {}) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [String(key), String(value)]),
  );
}

function validateNotification({ title, body }) {
  if (!title) {
    throw new Error("Notification title is required");
  }

  if (!body) {
    throw new Error("Notification body is required");
  }
}

/**
 * Send a push notification to a single FCM token.
 *
 * Kept for single-device use and backward compatibility.
 */
export async function sendPushNotification({ token, title, body, data = {} }) {
  if (!token) {
    throw new Error("FCM token is required");
  }

  validateNotification({ title, body });

  // Firebase Admin must be initialized before accessing Messaging.
  getFirebaseApp();

  const messaging = getMessaging();

  const message = {
    token,

    notification: {
      title,
      body,
    },

    data: normalizeData(data),

    android: {
      priority: "high",
      notification: {
        channelId: "default",
      },
    },
  };

  return messaging.send(message);
}

/**
 * Send a push notification to multiple FCM tokens.
 *
 * Uses Firebase Admin sendEachForMulticast().
 *
 * Returns the Firebase BatchResponse so the caller can inspect
 * individual token failures and deactivate invalid tokens.
 */
export async function sendPushNotificationToTokens({
  tokens,
  title,
  body,
  data = {},
}) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    throw new Error("At least one FCM token is required");
  }

  validateNotification({ title, body });

  // Firebase Admin must be initialized before accessing Messaging.
  getFirebaseApp();

  const messaging = getMessaging();

  const message = {
    tokens,

    notification: {
      title,
      body,
    },

    data: normalizeData(data),

    android: {
      priority: "high",
      notification: {
        channelId: "default",
      },
    },
  };

  return messaging.sendEachForMulticast(message);
}

export function isInvalidFcmTokenError(error) {
  const code = error?.code;

  return (
    code === "messaging/registration-token-not-registered" ||
    code === "messaging/invalid-registration-token"
  );
}
