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
