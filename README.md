# GoodSharing Push Notification Service - Milestone 1

GoodSharing Push Notification Service is a GraphQL subgraph responsible for registering and managing mobile device FCM tokens for authenticated GoodSharing users.

This service is part of the GoodSharing backend microservice architecture.

---

## Milestone 1 Scope

This service currently provides:

- FCM device registration
- FCM device unregistration/deactivation
- Authenticated user identification through the GoodSharing Gateway
- Firebase Admin SDK initialization
- PostgreSQL device registration persistence
- FCM token ownership and uniqueness protection
- Idempotent device registration
- FCM token rotation handling
- Device ownership handling when users change on the same device

The following are intentionally NOT part of this milestone:

- Post creation notifications
- Redis
- Notification retries
- Background notification processing
- Notification sending triggered by post creation

---

# Requirements

## Node.js

Node.js 20.x is required.

Verify the installed version:

```bash
node --version
```

Expected:

```text
v20.x.x
```

The Docker image uses:

```text
node:20-slim
```

npm is also required.

Verify:

```bash
npm --version
```

---

# Environment Variables

Create a `.env` file in the project root.

Example:

```env
PORT=4003

DATABASE_URL=postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE

FIREBASE_PROJECT_ID=your-firebase-project-id

FIREBASE_CLIENT_EMAIL=your-firebase-client-email

FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----\n"
```

### Environment variable description

| Variable                | Required | Description                                 |
| ----------------------- | -------- | ------------------------------------------- |
| `PORT`                  | Yes      | Port on which the service runs              |
| `DATABASE_URL`          | Yes      | PostgreSQL connection URL                   |
| `FIREBASE_PROJECT_ID`   | Yes      | Firebase project ID                         |
| `FIREBASE_CLIENT_EMAIL` | Yes      | Firebase Admin service-account client email |
| `FIREBASE_PRIVATE_KEY`  | Yes      | Firebase Admin service-account private key  |

### Important security rules

Never commit the following to Git:

- `.env`
- Firebase service-account JSON files
- Firebase private keys
- `.pem` files
- `.key` files

Firebase Admin credentials must only be provided through environment variables or another secure secret-management mechanism.

---

# PostgreSQL Setup

The service requires PostgreSQL.

Create or use a PostgreSQL database and provide its connection URL through:

```env
DATABASE_URL=postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE
```

Example format:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/notification_db
```

The service uses the `device_registrations` table to persist registered devices and FCM tokens.

The migration file is:

```text
migrations/001_create_device_registrations.sql
```

The important database fields are:

- `id` - UUID primary key
- `user_id` - BIGINT
- `device_id` - device identifier
- `fcm_token` - native FCM token
- `platform` - mobile platform
- `is_active` - registration status
- `created_at`
- `updated_at`
- `last_seen_at`

`user_id` is `BIGINT` because existing GoodSharing user IDs are BIGINT.

---

# Database Migration

The migration file is:

```text
migrations/001_create_device_registrations.sql
```

Run the migration using the project's migration script:

```bash
node src/db/migrate.js
```

The migration creates the `device_registrations` table and its required indexes and constraints.

After migration, verify the table from PostgreSQL.

Example:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'device_registrations'
ORDER BY ordinal_position;
```

Verify that `user_id` is:

```text
bigint
```

Verify indexes:

```sql
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'device_registrations';
```

---

# Installing Dependencies

Install project dependencies:

```bash
npm ci
```

For development, this installs the exact versions from `package-lock.json`.

---

# Running Locally

## 1. Use Node.js 20

```bash
nvm use 20
```

If Node.js 20 is not installed:

```bash
nvm install 20
nvm use 20
```

Verify:

```bash
node --version
```

Expected:

```text
v20.x.x
```

---

## 2. Install dependencies

```bash
npm ci
```

---

## 3. Configure environment variables

Create:

```text
.env
```

and configure:

```env
PORT=4003
DATABASE_URL=postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=your-firebase-client-email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----\n"
```

---

## 4. Run the database migration

```bash
node src/db/migrate.js
```

---

## 5. Start the service

```bash
npm start
```

The service runs on:

```text
http://localhost:4003
```

GraphQL endpoint:

```text
http://localhost:4003/graphql
```

Health endpoint:

```text
http://localhost:4003/health
```

---

# Health Check

After starting the service, verify:

```bash
curl http://localhost:4003/health
```

Expected response:

```json
{
  "status": "ok"
}
```

The health endpoint also checks the PostgreSQL connection.

---

# Running with Docker

The project contains a Dockerfile based on:

```text
node:20-slim
```

## Build the image

From the project root:

```bash
docker build -t goodsharing-push-notification-service .
```

## Run the container

Pass environment variables to the container:

```bash
docker run --rm \
  --env-file .env \
  -p 4003:4003 \
  goodsharing-push-notification-service
```

The service will be available at:

```text
http://localhost:4003
```

GraphQL:

```text
http://localhost:4003/graphql
```

Health:

```text
http://localhost:4003/health
```

### Docker security

The `.dockerignore` excludes:

- `.env`
- environment-specific files
- Firebase service-account JSON
- Firebase Admin SDK JSON
- private keys
- certificates
- `node_modules`
- coverage
- build output
- Git files
- logs

Firebase Admin credentials must not be copied into the Docker image.

---

# Running Tests

Run the test suite:

```bash
npm test
```

The project uses Vitest.

Tests are located under:

```text
tests/
```

The tests cover the Milestone 1 device registration behaviour.

---

# GraphQL API

The service exposes the following mutations:

```graphql
registerDevice
unregisterDevice
```

Authentication is obtained from the `x-user` header provided by the GoodSharing Gateway.

The client does NOT provide `userId` as GraphQL mutation input.

---

# Authentication Flow

The authentication flow is:

```text
Mobile App
    |
    | JWT
    v
GoodSharing Gateway
    |
    | validates authenticated user
    |
    | x-user: {"id":"159","email":"user@example.com"}
    v
Push Notification Service
    |
    | reads x-user.id
    v
device_registrations
```

The Gateway sends the authenticated user information through:

```http
x-user
```

Example:

```text
{"id":"159","email":"user@example.com"}
```

The notification service reads:

```javascript
user.id;
```

and uses that value as the authenticated `user_id`.

The client cannot provide or override the authenticated user ID through the GraphQL mutation.

---

# registerDevice

`registerDevice` registers the authenticated user's device and FCM token.

## Example authenticated request

Request:

```http
POST /graphql
Content-Type: application/json
x-user: {"id":"159","email":"user@example.com"}
```

GraphQL:

```graphql
mutation RegisterDevice($input: RegisterDeviceInput!) {
  registerDevice(input: $input) {
    id
    userId
    deviceId
    platform
    isActive
    createdAt
    updatedAt
    lastSeenAt
  }
}
```

Variables:

```json
{
  "input": {
    "deviceId": "android-device-001",
    "fcmToken": "native-fcm-token-example",
    "platform": "android"
  }
}
```

Important:

The request does NOT contain:

```text
userId
```

The service obtains the user ID from:

```http
x-user
```

---

# unregisterDevice

`unregisterDevice` deactivates the authenticated user's device registration.

Example:

```http
POST /graphql
Content-Type: application/json
x-user: {"id":"159","email":"user@example.com"}
```

GraphQL:

```graphql
mutation UnregisterDevice($input: UnregisterDeviceInput!) {
  unregisterDevice(input: $input) {
    id
    userId
    deviceId
    platform
    isActive
    createdAt
    updatedAt
    lastSeenAt
  }
}
```

Variables:

```json
{
  "input": {
    "deviceId": "android-device-001"
  }
}
```

The service determines the user from:

```text
x-user.id
```

and does not accept `userId` from the client.

---

# Token Ownership and Uniqueness

The `device_registrations` table enforces the following rules.

## User + Device uniqueness

A user cannot have duplicate registrations for the same device.

This is enforced by:

```sql
UNIQUE (user_id, device_id)
```

Therefore, repeatedly registering the same user/device combination does not create duplicate registrations.

---

## Active FCM token uniqueness

An active FCM token cannot belong to multiple users.

This is enforced using a partial unique index:

```sql
CREATE UNIQUE INDEX idx_device_registrations_active_fcm_token_unique
ON device_registrations (fcm_token)
WHERE is_active = TRUE;
```

Therefore:

```text
User A -> active token ABC
```

and:

```text
User B -> active token ABC
```

cannot exist at the same time.

---

# Idempotent Registration

Registering the same device multiple times for the same authenticated user must not create duplicate rows.

Example:

```text
User 159
Device: android-device-001
Token: ABC
```

Registering it again results in the existing registration being updated/reactivated rather than creating another registration.

This allows safe registration during application startup and after application restart.

---

# FCM Token Rotation

FCM tokens can change.

When a device receives a new FCM token, the existing device registration is updated with the new token.

Example:

```text
Old token:
ABC
```

becomes:

```text
New token:
XYZ
```

The registration remains associated with the same authenticated user and device.

The old token is no longer the active token for that registration.

---

# Same Device - Different User

The service supports the following scenario:

```text
User A
   |
   | Login
   v
Device 001
   |
   | FCM Token ABC
   v
Registration A
```

When User A logs out, the device registration is deactivated.

Then:

```text
User B
   |
   | Login
   v
Device 001
   |
   | FCM Token ABC
   v
Registration B
```

Because inactive registrations do not participate in the active FCM-token uniqueness constraint, the device can be registered for the new authenticated user.

The active token can belong to only one user at a time.

---

# Logout Behaviour

Before logout, the mobile application calls:

```graphql
unregisterDevice
```

using the authenticated user's context.

The service sets the registration to inactive:

```text
is_active = false
```

The registration is retained in the database instead of being unnecessarily deleted.

This preserves the registration history and allows it to be safely reactivated later.

---

# Reactivation

If the same authenticated user logs in again and registers the same device, the existing inactive registration can be reactivated.

This avoids unnecessary duplicate database records.

---

# Database Compatibility

Existing GoodSharing user IDs are `BIGINT`.

Therefore:

```sql
user_id BIGINT NOT NULL
```

is used in `device_registrations`.

The device registration service does not create or own the GoodSharing user records.

The authenticated user is resolved by the Gateway.

For this reason, the notification service does not require a local foreign key to the user table when the user table belongs to another microservice/database.

The `user_id` value is treated as the authenticated GoodSharing user identifier supplied by the Gateway.

---

# Firebase Admin Initialization

Firebase Admin is initialized during service startup.

The service requires:

```text
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
```

If required Firebase configuration is missing, service initialization fails with a clear configuration error.

Firebase service-account JSON files and private keys must never be committed to Git.

---

# Security

The following files must never be committed:

```text
.env
*.pem
*.key
*-firebase-adminsdk-*.json
firebase-service-account.json
```

The project `.gitignore` and `.dockerignore` exclude these sensitive files.

---

# Project Structure

```text
.
├── migrations/
│   └── 001_create_device_registrations.sql
├── src/
│   ├── config/
│   │   ├── env.js
│   │   └── firebase.js
│   ├── db/
│   │   ├── migrate.js
│   │   └── pool.js
│   ├── graphql/
│   │   ├── resolvers.js
│   │   └── schema.js
│   ├── services/
│   │   └── deviceRegistrationService.js
│   ├── app.js
│   └── index.js
├── tests/
│   └── deviceRegistration.test.js
├── Dockerfile
├── .dockerignore
├── .gitignore
├── .env.example
├── package.json
└── README.md
```

---

# Milestone 1 Out of Scope

The following features are intentionally not implemented in Milestone 1:

- Notification sending after post creation
- Redis integration
- Retry mechanisms
- Background workers
- Notification queues
- Post creation integration
- Automatic notification delivery

These features belong to a later milestone.

---

# Verification Checklist

Before considering Milestone 1 complete, verify:

- [ ] Node.js 20 is installed
- [ ] Environment variables are configured
- [ ] PostgreSQL connection works
- [ ] Database migration succeeds
- [ ] `device_registrations.user_id` is BIGINT
- [ ] Firebase Admin initializes during startup
- [ ] Missing Firebase configuration causes startup failure
- [ ] `registerDevice` uses `x-user.id`
- [ ] `userId` is not accepted as mutation input
- [ ] Unauthenticated mutations are rejected
- [ ] Repeated registration does not create duplicates
- [ ] FCM token rotation updates the registration
- [ ] Active FCM tokens are unique
- [ ] Logout deactivates the registration
- [ ] A previously deactivated registration can be reactivated
- [ ] Docker image builds successfully
- [ ] Secrets are excluded from Docker
- [ ] Tests pass

# Milestone 2 — Controlled Push Notification Delivery

Milestone 2 introduces controlled Firebase Cloud Messaging (FCM) push notification delivery for authenticated GoodSharing users.

The objective of this milestone is to prove the complete controlled push-notification flow from an authenticated GraphQL request through the GoodSharing Gateway and Notification Service to Firebase Cloud Messaging and an Android device.

Milestone 2 is intentionally limited to controlled test notification delivery.

The Posts Service is **not connected** in this milestone.

Background queues, workers, retry mechanisms, event-driven post notifications, and other later-milestone functionality are **not implemented**.

---

# Milestone 2 Scope

The Milestone 2 flow is:

```text
Authenticated User / Test Trigger
                |
                | GraphQL request
                v
        GoodSharing Gateway
                |
                | JWT authentication
                | x-user
                v
     Push Notification Service
                |
                | context.userId
                v
       PostgreSQL
   device_registrations
                |
                | Active FCM tokens
                v
       Firebase Admin SDK
                |
                | FCM multicast
                v
          Android Device
                |
        +-------+-------+
        |       |       |
        v       v       v
    Foreground Background Killed
        |       |       |
        v       v       v
     Banner   Tray    Tray
                         |
                         v
                    App Launch
```

The Notification Service determines the notification targets from the authenticated user's active device registrations.

The client does not provide arbitrary FCM tokens or another user's ID.

---

# Milestone 2 Objective

The primary objective is to implement a secure, controlled test notification mechanism.

The system must:

1. Authenticate the notification request.
2. Resolve the authenticated user from `x-user.id`.
3. Fetch all active device registrations for that user.
4. Extract the active FCM tokens.
5. Send a notification through Firebase Admin SDK.
6. Support multiple active devices.
7. Include notification and custom data payloads.
8. Use Android high-priority delivery.
9. Use the `default` Android notification channel.
10. Detect invalid or stale FCM tokens.
11. Deactivate invalid registrations.
12. Return successful and failed delivery counts.
13. Support foreground, background, and killed/terminated Android application states.

---

# Milestone 2 Security Requirements

Notification sending requires an authenticated user.

The Notification Service uses the authenticated user supplied by the GoodSharing Gateway.

The Gateway sends:

```http
x-user
```

For example:

```text
{"id":"159","email":"user@example.com"}
```

The Notification Service reads:

```javascript
context.userId;
```

which is derived from:

```javascript
user.id;
```

The client cannot override the authenticated user by supplying a different `userId`.

---

## No Client-Provided userId

The `sendTestNotification` mutation does not accept:

```text
userId
```

The authenticated user is always taken from:

```text
x-user.id
```

This prevents a client from requesting notifications for another user.

---

## No Raw FCM Token Input

The notification mutation also does not accept:

```text
fcmToken
```

The service obtains FCM tokens from PostgreSQL:

```text
Authenticated User
       |
       v
device_registrations
       |
       | user_id = authenticated user
       | is_active = TRUE
       v
Active FCM Tokens
```

This prevents arbitrary client-selected devices from being targeted.

---

## Unauthenticated Requests

If the request does not contain valid authenticated user context, the mutation returns:

```text
Authentication required
```

Unauthenticated users cannot trigger push notifications.

---

# GraphQL API

Milestone 2 adds the following GraphQL input:

```graphql
input SendTestNotificationInput {
  title: String!
  body: String!
  type: String
  targetId: String
}
```

The mutation is:

```graphql
sendTestNotification(
  input: SendTestNotificationInput!
): TestNotificationResult!
```

The result type is:

```graphql
type TestNotificationResult {
  successCount: Int!
  failureCount: Int!
  totalTokens: Int!
}
```

---

# sendTestNotification

`sendTestNotification` sends a controlled test notification to all active FCM registrations belonging to the authenticated user.

Example:

```graphql
mutation SendTestNotification($input: SendTestNotificationInput!) {
  sendTestNotification(input: $input) {
    successCount
    failureCount
    totalTokens
  }
}
```

Variables:

```json
{
  "input": {
    "title": "GoodSharing Test Notification",
    "body": "This is a Milestone 2 test notification.",
    "type": "test",
    "targetId": "test-001"
  }
}
```

The request must contain authenticated user context:

```http
x-user: {"id":"159","email":"user@example.com"}
```

The mutation does **not** contain:

```text
userId
fcmToken
deviceId
```

for recipient selection.

---

# sendTestNotification Processing Flow

The resolver performs the following operations:

```text
1. Read context.userId
        |
        v
2. Reject unauthenticated request
        |
        v
3. Fetch active device registrations
        |
        v
4. Extract FCM tokens
        |
        v
5. Validate title and body
        |
        v
6. Build Firebase notification
        |
        v
7. Send multicast notification
        |
        v
8. Inspect individual FCM responses
        |
        v
9. Deactivate invalid tokens
        |
        v
10. Return delivery counts
```

---

# Active Device Selection

The service queries active registrations belonging to the authenticated user.

The database lookup is equivalent to:

```sql
SELECT
    id,
    user_id,
    device_id,
    fcm_token,
    platform,
    is_active,
    created_at,
    updated_at,
    last_seen_at
FROM device_registrations
WHERE user_id = $1
  AND is_active = TRUE
ORDER BY updated_at DESC;
```

Only registrations satisfying both conditions are selected:

```text
user_id = authenticated user
is_active = TRUE
```

Inactive registrations are not sent notifications.

---

# No Active Devices

If the authenticated user has no active FCM registrations, the service returns:

```json
{
  "successCount": 0,
  "failureCount": 0,
  "totalTokens": 0
}
```

No Firebase request is made when there are no active tokens.

---

# Multiple Active Devices

A single user can have multiple active devices.

Example:

```text
User 159
   |
   +-- Device A
   |      |
   |      +-- FCM Token A
   |
   +-- Device B
   |      |
   |      +-- FCM Token B
   |
   +-- Device C
          |
          +-- FCM Token C
```

The Notification Service collects all active FCM tokens:

```text
[
  "FCM_TOKEN_A",
  "FCM_TOKEN_B",
  "FCM_TOKEN_C"
]
```

and sends the notification using Firebase Admin multicast delivery.

---

# Firebase Admin SDK

The Notification Service uses Firebase Admin SDK for server-side FCM delivery.

Firebase configuration is supplied through environment variables:

```text
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
```

Firebase credentials remain on the backend.

They must never be exposed to the mobile application.

They must never be committed to Git.

---

# Firebase Initialization

Firebase Admin is initialized during service startup.

The service calls:

```javascript
getFirebaseApp();
```

during application creation.

If Firebase configuration is missing, the service fails during startup with a clear configuration error.

Required configuration:

```text
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
```

The private key handles escaped newline characters so that environment-based configuration works correctly.

---

# Firebase Multicast Sending

For multiple active FCM tokens, the service uses:

```javascript
messaging.sendEachForMulticast(message);
```

The message contains:

```javascript
{
  tokens,
  notification: {
    title,
    body,
  },
  data,
  android: {
    priority: "high",
    notification: {
      channelId: "default",
    },
  },
}
```

The Firebase response contains:

```text
successCount
failureCount
responses[]
```

Each response corresponds to the token at the same array index.

---

# Notification Payload

Milestone 2 sends a standard notification payload containing:

```json
{
  "notification": {
    "title": "GoodSharing Test Notification",
    "body": "This is a Milestone 2 test notification."
  }
}
```

The notification payload allows Android to display the notification in the system notification UI when applicable.

---

# Custom Data Payload

Milestone 2 also sends custom data.

Example:

```json
{
  "data": {
    "type": "test",
    "targetId": "test-001"
  }
}
```

The supported fields are:

```text
type
targetId
```

`type` defaults to:

```text
test
```

if it is not provided.

`targetId` is optional.

Data values are normalized to strings before sending through FCM.

---

# Android FCM Configuration

The backend configures Android delivery with:

```javascript
android: {
  priority: "high",
  notification: {
    channelId: "default",
  },
}
```

Therefore:

```text
Priority:
high

Channel:
default
```

The mobile application must create the corresponding Android notification channel.

---

# Android Notification Channel

The mobile application uses the:

```text
default
```

notification channel.

The channel should use high importance and support:

```text
Sound
Vibration
```

Conceptually:

```text
Channel ID:
default

Importance:
HIGH

Sound:
Enabled

Vibration:
Enabled
```

The backend sends:

```text
channelId = default
```

so the notification is routed to the expected Android channel.

---

# Invalid FCM Token Handling

FCM registrations can become invalid or stale.

Milestone 2 detects these Firebase error codes:

```text
messaging/registration-token-not-registered
```

and:

```text
messaging/invalid-registration-token
```

The helper:

```javascript
isInvalidFcmTokenError(error);
```

identifies these errors.

---

# Invalid Token Deactivation

When Firebase reports an invalid token, the Notification Service deactivates its registration.

The database update is equivalent to:

```sql
UPDATE device_registrations
SET
    is_active = FALSE,
    updated_at = NOW(),
    last_seen_at = NOW()
WHERE fcm_token = $1
  AND is_active = TRUE;
```

The invalid registration is retained in the database.

It is not deleted.

This prevents the same invalid token from continuing to participate in future active-device queries.

---

# Multiple Invalid Tokens

If multiple tokens are invalid during the same multicast request, each invalid token is processed independently.

Example:

```text
Token A -> success
Token B -> invalid
Token C -> invalid
Token D -> success
```

Result:

```text
successCount = 2
failureCount = 2
totalTokens  = 4
```

The registrations corresponding to Token B and Token C are marked:

```text
is_active = false
```

---

# Valid Token Behaviour

A valid token remains active after successful notification delivery.

Example:

```text
Token A
   |
   v
Firebase success
   |
   v
is_active remains TRUE
```

Only tokens explicitly identified as invalid/stale by Firebase are deactivated.

---

# Notification Result

The GraphQL response contains:

```text
successCount
failureCount
totalTokens
```

Example:

```json
{
  "data": {
    "sendTestNotification": {
      "successCount": 1,
      "failureCount": 1,
      "totalTokens": 2
    }
  }
}
```

This allows the caller to understand the result of the multicast operation.

---

# Mobile Notification Lifecycle

Milestone 2 requires notification handling for three Android application states:

```text
Foreground
Background
Killed / Terminated
```

---

# Foreground Notification

When the application is open and active:

```text
FCM
 |
 v
Android Application
 |
 v
Notification Handler
 |
 v
Visible notification/banner
```

The mobile application configures:

```javascript
Notifications.setNotificationHandler(...)
```

to allow a notification to be presented while the application is in the foreground.

The foreground notification should be visibly presented to the user.

---

# Background Notification

When the application is running in the background:

```text
FCM
 |
 v
Android System
 |
 v
Notification Tray
 |
 | User taps
 v
Application
 |
 v
Notification Response Handler
```

The notification is displayed by the Android system notification UI.

When the user taps the notification, the application reads the notification response and its custom data.

---

# Killed / Terminated Notification

When the application has been terminated:

```text
FCM
 |
 v
Android System
 |
 v
Notification Tray
 |
 | User taps
 v
Application launches
 |
 v
getLastNotificationResponseAsync()
 |
 v
Notification data
```

The application checks:

```javascript
Notifications.getLastNotificationResponseAsync();
```

to determine whether the application was launched because of a notification.

This supports handling notifications that were tapped while the application was terminated.

---

# Notification Response Listener

The mobile application registers:

```javascript
Notifications.addNotificationResponseReceivedListener(...)
```

The listener receives notification responses when the user interacts with a notification.

The handler extracts custom notification data such as:

```json
{
  "type": "test",
  "targetId": "test-001"
}
```

The listener is removed during component cleanup/unmount.

This prevents unnecessary listener accumulation.

---

# Notification Data Handling

The mobile application can use the custom data payload to determine what action should happen after the user taps the notification.

Example:

```text
type = test
targetId = test-001
```

The application can read:

```text
response.notification.request.content.data
```

and use the data for notification handling.

Milestone 2 only requires reading and handling the test notification data.

Business-specific post/category navigation is outside this milestone.

---

# Test Notification Button

A mobile test UI may provide a:

```text
Send Test Push Notification
```

button.

The button should trigger the authenticated GraphQL mutation:

```text
sendTestNotification
```

The backend then determines the user's active FCM devices.

The mobile application must not send arbitrary FCM tokens to the backend.

---

# Backend Automated Testing

Milestone 2 includes unit, resolver, authentication, Firebase, and database-backed integration tests.

The tests cover:

- authenticated notification sending
- unauthenticated notification rejection
- active device selection
- no active device handling
- single-token sending
- multiple-token sending
- notification title and body
- custom notification data
- Android high priority
- Android notification channel
- Firebase Admin initialization
- Firebase multicast sending
- Firebase errors
- invalid token detection
- invalid token deactivation
- multiple invalid token cleanup
- active token ownership
- inactive registration behaviour
- device reactivation
- user/device registration behaviour
- database-backed notification flow

---

# Running Tests

Use Node.js 20 or newer.

Check the current Node version:

```bash
node -v
```

Example:

```text
v20.20.2
```

Install dependencies:

```bash
npm install
```

Run the complete test suite:

```bash
npm test
```

Current verified test result:

```text
Test Files  6 passed (6)
Tests       62 passed (62)
```

Therefore the current automated Milestone 2 verification is:

```text
62/62 tests passing
```

---

# Milestone 2 Integration Test

The integration test validates the complete backend notification flow.

The test path is:

```text
HTTP GraphQL Request
        |
        v
x-user authentication context
        |
        v
sendTestNotification resolver
        |
        v
getActiveDeviceRegistrations()
        |
        v
PostgreSQL
        |
        v
Active FCM tokens
        |
        v
Firebase multicast
        |
        v
FCM response
        |
        v
Invalid token cleanup
        |
        v
PostgreSQL
```

The integration test verifies:

- authenticated user context
- active registrations only
- user ownership
- Firebase multicast request
- notification payload
- custom data payload
- Android priority
- default channel
- invalid token detection
- invalid token deactivation
- valid token remains active

---

# Milestone 2 Test Scenarios

## Scenario 1 — Single Active Device

```text
User 159
   |
   +-- Device A
          |
          +-- Token A
```

Expected:

```text
totalTokens = 1
```

Firebase receives Token A.

---

## Scenario 2 — Multiple Active Devices

```text
User 159
   |
   +-- Device A -> Token A
   +-- Device B -> Token B
   +-- Device C -> Token C
```

Expected:

```text
totalTokens = 3
```

All three active tokens are included in the multicast request.

---

## Scenario 3 — No Active Devices

```text
User 159
   |
   +-- No active registrations
```

Expected:

```json
{
  "successCount": 0,
  "failureCount": 0,
  "totalTokens": 0
}
```

Firebase is not called.

---

## Scenario 4 — Invalid Token

```text
Token A -> Firebase success
Token B -> invalid-registration-token
```

Expected:

```text
Token A -> remains active
Token B -> is_active = false
```

---

## Scenario 5 — Unauthenticated Request

```text
No authenticated user
        |
        v
sendTestNotification
        |
        v
Authentication required
```

Expected:

```text
Request rejected
```

No notification should be sent.

---

## Scenario 6 — User Ownership

Example:

```text
User A -> Token A
User B -> Token B
```

If User A calls:

```text
sendTestNotification
```

only Token A can be selected.

Token B must not be targeted.

---

# Milestone 2 Database Behaviour

The existing `device_registrations` table is reused.

Important columns:

```text
id
user_id
device_id
fcm_token
platform
is_active
created_at
updated_at
last_seen_at
```

The user identifier remains:

```sql
user_id BIGINT NOT NULL
```

Active registrations are selected using:

```text
user_id = authenticated user
is_active = TRUE
```

Invalid tokens are deactivated rather than deleted.

---

# Token Lifecycle

The Milestone 2 token lifecycle is:

```text
Mobile Login
     |
     v
registerDevice
     |
     v
FCM token stored
     |
     v
is_active = TRUE
     |
     v
sendTestNotification
     |
     v
FCM delivery
     |
     +------------------+
     |                  |
     v                  v
  Success            Invalid
     |                  |
     v                  v
 Remains active    is_active=false
```

When the user logs in again and registers the device, the existing registration can be reactivated according to the Milestone 1 registration behaviour.

---

# API Security Model

The secure design is:

```text
Client
  |
  | JWT
  v
Gateway
  |
  | validates JWT
  |
  | x-user
  v
Notification Service
  |
  | authenticated user ID
  v
PostgreSQL
  |
  | active registrations owned by user
  v
Firebase
```

The insecure design that is intentionally avoided is:

```text
Client
  |
  | arbitrary userId
  | arbitrary fcmToken
  v
Notification Service
  |
  v
Firebase
```

The second design could allow unauthorized device targeting.

Milestone 2 therefore derives notification recipients exclusively from authenticated ownership.

---

# Kubernetes Deployment

The Notification Service runs inside the Kubernetes `services` namespace.

Service:

```text
notification-service
```

Port:

```text
4003
```

Internal GraphQL endpoint:

```text
http://notification-service:4003/graphql
```

Internal health endpoint:

```text
http://notification-service:4003/health
```

The service is exposed internally as a Kubernetes `ClusterIP`.

The public GraphQL entry point remains the GoodSharing Gateway.

---

# Kubernetes Environment Variables

The Notification Service deployment requires:

```text
PORT
DATABASE_URL
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
```

Sensitive values are stored in the Kubernetes Secret:

```text
notification-service-secret
```

The deployment should reference the Secret rather than storing credentials directly in the deployment manifest.

---

# Kubernetes Health Check

The service exposes:

```http
GET /health
```

A healthy service returns:

```json
{
  "status": "ok"
}
```

The health endpoint also checks database connectivity.

If the database check fails, the endpoint returns an unhealthy response.

---

# Docker

The Notification Service is containerized.

The Docker image must be built for the architecture used by the Kubernetes nodes.

For an AMD64 Kubernetes cluster:

```bash
docker build --platform=linux/amd64 \
  -t nileshjs/goodsharing-push-notification-service:<version> .
```

Push the image:

```bash
docker push nileshjs/goodsharing-push-notification-service:<version>
```

The Kubernetes Deployment should reference the corresponding image tag.

Avoid reusing an old image tag when deploying changed Milestone 2 code.

A unique image tag makes deployment verification easier.

---

# Production Deployment Verification

After deploying a new Notification Service image:

```bash
kubectl rollout status deployment/notification-service -n services
```

Check the pod:

```bash
kubectl get pods -n services
```

Check the deployment image:

```bash
kubectl get deployment notification-service \
  -n services \
  -o jsonpath='{.spec.template.spec.containers[0].image}'
```

Check the service health:

```bash
kubectl run curl-test \
  -n services \
  --rm -it \
  --image=curlimages/curl:8.10.1 \
  --restart=Never \
  -- curl -i http://notification-service:4003/health
```

Expected:

```text
HTTP 200
{"status":"ok"}
```

---

# GraphQL Schema Verification

The Notification Service schema can be checked using:

```bash
kubectl run graphql-test \
  -n services \
  --rm -it \
  --image=curlimages/curl:8.10.1 \
  --restart=Never \
  -- \
  curl -s http://notification-service:4003/graphql \
  -H 'Content-Type: application/json' \
  --data '{"query":"{ __schema { types { name } } }"}'
```

Milestone 2 schema must include:

```text
SendTestNotificationInput
TestNotificationResult
```

and:

```text
sendTestNotification
```

The deployed pod must contain the same Milestone 2 schema as the tested source code.

---

# Gateway Integration

The intended production request path is:

```text
Android Mobile App
        |
        v
https://goodsharing.cloud/graphql
        |
        v
NGINX Ingress
        |
        v
GoodSharing Gateway
        |
        | x-user
        v
Notification Service
        |
        v
Firebase Admin SDK
        |
        v
FCM
        |
        v
Android Device
```

The Gateway is responsible for authentication.

The Notification Service is responsible for notification delivery.

---

# Real Device Verification

Automated backend tests do not prove real Android FCM delivery.

Milestone 2 therefore requires real-device verification.

The following three states must be tested.

---

## Test 1 — Foreground

Steps:

```text
1. Open the Android application.
2. Keep the application in the foreground.
3. Trigger sendTestNotification.
4. Observe the device.
```

Expected:

```text
Visible foreground notification/banner
```

---

## Test 2 — Background

Steps:

```text
1. Open the Android application.
2. Put the application in the background.
3. Trigger sendTestNotification.
4. Observe the notification tray.
5. Tap the notification.
```

Expected:

```text
Notification appears in system tray.
Tap launches/opens the application.
Notification data is received by the response handler.
```

---

## Test 3 — Killed / Terminated

Steps:

```text
1. Open the Android application.
2. Register the device.
3. Completely terminate the application.
4. Trigger sendTestNotification.
5. Observe the notification tray.
6. Tap the notification.
```

Expected:

```text
Notification appears in the system tray.
Tap launches the application.
getLastNotificationResponseAsync()
can retrieve the notification response.
Custom data is available.
```

---

# Invalid Token Real Database Verification

An invalid/stale FCM token must eventually result in:

```text
is_active = false
```

The database should be checked after the notification request.

Example query:

```sql
SELECT
    id,
    user_id,
    device_id,
    fcm_token,
    is_active,
    updated_at
FROM device_registrations
ORDER BY updated_at DESC;
```

The invalid registration should show:

```text
is_active = false
```

The registration should remain present in the database.

---

# Milestone 2 Verification Checklist

## Backend

- [x] `sendTestNotification` mutation implemented
- [x] `SendTestNotificationInput` implemented
- [x] `TestNotificationResult` implemented
- [x] Authentication required
- [x] `context.userId` used
- [x] Authenticated user comes from `x-user.id`
- [x] Client cannot provide `userId`
- [x] Client cannot provide raw FCM token
- [x] Active registrations queried from PostgreSQL
- [x] Only authenticated user's active registrations are targeted
- [x] Multiple active devices supported
- [x] Firebase Admin SDK used
- [x] Firebase multicast implemented with `sendEachForMulticast`
- [x] Notification title/body implemented
- [x] Custom data payload implemented
- [x] Data values normalized to strings
- [x] Android priority set to `high`
- [x] Android channel ID set to `default`
- [x] Invalid FCM token detection implemented
- [x] `registration-token-not-registered` handled
- [x] `invalid-registration-token` handled
- [x] Invalid token registrations deactivated
- [x] Invalid registrations retained in database
- [x] No retry queue implemented
- [x] No background worker implemented
- [x] Database-backed integration test implemented
- [x] Automated tests passing: 62/62

---

## Mobile

- [ ] Default Android notification channel verified on real device
- [ ] High importance channel verified
- [ ] Sound verified
- [ ] Vibration verified
- [ ] Foreground notification banner verified
- [ ] Background notification verified
- [ ] Background notification tap verified
- [ ] Killed/terminated notification verified
- [ ] Killed/terminated notification tap verified
- [ ] `getLastNotificationResponseAsync()` verified
- [ ] Custom notification data verified
- [ ] Notification response listener cleanup verified

---

## End-to-End

- [ ] Mobile App → Gateway verified
- [ ] Gateway → Notification Service verified
- [ ] Notification Service → PostgreSQL verified
- [ ] Notification Service → Firebase verified
- [ ] Firebase → real Android device verified
- [ ] Foreground delivery verified
- [ ] Background delivery verified
- [ ] Killed/terminated delivery verified
- [ ] Notification tap handling verified
- [ ] Invalid token becomes `is_active = false`
- [ ] Short demonstration recording completed

---

# Milestone 2 Automated Test Result

Current verified backend test result:

```text
Test Files  6 passed (6)
Tests       62 passed (62)
```

Status:

```text
62/62 PASS
```

This confirms the implemented backend behaviour covered by the automated test suite.

Real-device FCM verification remains a separate acceptance step.

---

# Milestone 2 Out of Scope

The following functionality must **not** be implemented as part of Milestone 2:

- Posts Service integration
- `PostCreated` events
- Category subscription notification delivery
- Notification delivery triggered by post creation
- Redis notification queues
- BullMQ
- Kafka
- Background notification workers
- Exponential backoff
- Retry loops
- Dead-letter queues
- Notification retry infrastructure
- In-app notification database tables
- Notification history
- Category subscription migration
- Automatic post-based notification delivery
- Removing legacy notification logic from Posts Service

These features belong to later milestones.

---

# Milestone 2 Completion Criteria

Milestone 2 is considered technically implemented when the following backend flow works:

```text
Authenticated User
        |
        v
sendTestNotification
        |
        v
GoodSharing Gateway
        |
        v
Notification Service
        |
        v
Authenticated user's active FCM registrations
        |
        v
Firebase Admin SDK
        |
        v
FCM
```

The real Android device acceptance must demonstrate:

```text
1. Foreground notification
2. Background notification
3. Killed/terminated notification
```

Notification tapping must also expose the custom data payload.

Invalid FCM registrations must be automatically deactivated.

The final acceptance state is:

```text
62/62 automated tests passing
+
Real Android foreground test
+
Real Android background test
+
Real Android killed/terminated test
+
Invalid token database verification
```

No Posts Service integration, background queues, retries, or other later-milestone functionality should be introduced as part of Milestone 2.
