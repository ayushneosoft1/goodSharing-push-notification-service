# GoodSharing Firebase Push Notification Service – System Design & Milestone 1

**Prepared by:** Nilesh
**Project:** GoodSharing
**Repository:** `goodSharing-push-notification-service`
**Milestone:** Milestone 1 – FCM Device Registration
**Backend Port:** `4003`

---

# 1. Purpose

GoodSharing application ke existing push-notification architecture ko future mein Expo Push Service dependency se migrate karke direct Firebase Cloud Messaging (FCM) architecture par le jaana hai.

Is document ka purpose:

- Proposed notification architecture ko document karna.
- Milestone 1 ka exact scope define karna.
- Notification Service ki responsibilities define karna.
- Native Android FCM registration flow explain karna.
- PostgreSQL device-registration design define karna.
- Authentication aur security decisions document karna.
- Testing aur acceptance criteria define karna.
- Future notification milestones ko Milestone 1 se clearly separate rakhna.

**Important:** Milestone 1 mein complete notification delivery system implement nahi kiya jayega.

---

# 2. Current Notification System

Current system mein mobile application Expo Push Service ke through notifications handle karti thi.

Current conceptual flow:

```text
Mobile App
    |
    | Expo Push Token
    v
Expo Push Service
    |
    v
Android Device
```

Is approach mein Expo Push Service GoodSharing ke notification delivery flow ka important dependency tha.

Milestone 1 mein mobile application ko native device push token flow par migrate kiya gaya hai. Future notification delivery mein Expo Push Service ko remove karke direct Firebase Cloud Messaging use kiya jayega.

---

# 3. Proposed Future Architecture

Final notification architecture ka high-level design:

```text
Android App
    |
    | Native FCM Registration
    v
Apollo Gateway
    |
    v
Notification Service
    |
    +-----------------> PostgreSQL
    |
    +-----------------> Redis Queue
                              |
                              v
                    Firebase Cloud Messaging
                              |
                              v
                        Android Devices
```

Future system mein:

- Mobile application native Firebase registration obtain karegi.
- Apollo Gateway authentication handle karega.
- Notification Service device registrations manage karegi.
- PostgreSQL device-related data store karega.
- Redis asynchronous notification processing ke liye use hoga.
- Firebase Admin SDK backend se FCM ke saath communicate karega.

**Redis, queue processing, retries aur notification sending Milestone 1 ka part nahi hain.**

---

# 4. Milestone 1 – FCM Device Registration

## 4.1 Objective

Milestone 1 ka primary objective hai:

> Android application se native Firebase device token obtain karke authenticated user ke saath Notification Service ke PostgreSQL database mein securely register karna.

Expected flow:

```text
Android App
    |
    | Native FCM Registration
    v
Apollo Gateway
    |
    | Authenticated User Context
    v
Notification Service
    |
    v
PostgreSQL
```

Milestone 1 ka focus reliable, authenticated, duplicate-safe aur lifecycle-aware device registration foundation banana hai.

---

# 5. Milestone 1 Scope

Milestone 1 mein following functionality implement ki gayi hai:

## Notification Service

- Node.js 20
- ES modules
- Apollo GraphQL federated subgraph
- PostgreSQL integration
- Firebase Admin SDK initialization
- Environment-based configuration
- `registerDevice` GraphQL mutation
- `unregisterDevice` GraphQL mutation
- Device deactivation/reactivation
- Health-check endpoint
- PostgreSQL migration
- Input/platform validation
- Duplicate registration protection
- Active FCM token uniqueness
- FCM token rotation support
- Authentication through Gateway `x-user.id`
- Dockerfile
- `.dockerignore`
- README
- `.env.example`
- Automated unit/integration tests

## Mobile Application

- Native Android device push token registration
- Login ke baad device registration
- Signup ke baad device registration
- Authenticated app startup par safe re-registration
- FCM token refresh/change handling
- Logout se pehle device deactivation
- Permission denied hone par authentication continue karna
- Expo Push Token generation remove karna
- Direct Expo Push Service calls remove karna
- Firebase Admin credentials mobile application mein include na karna

---

# 6. Milestone 1 mein Kya Implement Nahi Hoga

Following functionality deliberately Milestone 1 se bahar hai:

- `PostCreated` events
- Posts Service integration
- Category subscriptions
- New-post notifications
- Redis
- Queue workers
- Retry processing
- Notification delivery tracking
- Notification batching
- In-app notification migration
- Existing Posts Service notification implementation ka cleanup

Ye functionality future milestones mein implement hogi.

---

# 7. Firebase Setup

GoodSharing ke selected Firebase project ka use kiya jayega.

Android application ka exact package name:

```text
com.neosoft.goodsharing
```

Firebase Android configuration ke liye Firebase project se downloaded:

```text
google-services.json
```

use kiya ja sakta hai as mobile application configuration.

## Important Security Rule

`google-services.json` mobile application configuration ka part ho sakta hai.

Lekin Firebase Admin service-account credential private backend credential hai.

Service-account credential:

- GitHub mein commit nahi hogi.
- Mobile application mein nahi jayegi.
- Chat mein share nahi ki jayegi.
- Logs mein print nahi hogi.
- PostgreSQL mein store nahi hogi.
- Production mein Kubernetes Secret ya equivalent secret mechanism se load hogi.

---

# 8. Firebase Admin SDK

Notification Service Firebase Admin SDK use karti hai for future server-side FCM communication and Firebase project integration.

Backend configuration environment variables/secrets se load hoti hai.

Expected configuration:

```text
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

Alternative production implementation mein service-account credential mounted secret ke through bhi load ki ja sakti hai.

Private Firebase credentials source code mein hard-code nahi kiye jayenge.

**Milestone 1 mein Firebase Admin initialization implemented hai; actual notification sending intentionally out of scope hai.**

---

# 9. Environment Configuration

Local development ke liye `.env` file use hogi.

Example:

```env
PORT=4003

DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB_NAME

FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

`.env.example` mein sirf placeholders honge.

Real values `.env.example` mein nahi hongi.

---

# 10. Git Security

`.gitignore` aur `.dockerignore` sensitive files/patterns ko exclude karte hain:

```text
node_modules/
.env
firebase-service-account.json
*-firebase-adminsdk-*.json
*.pem
*.key
coverage/
dist/
.git/
```

Production credentials, passwords, database credentials aur private keys repository mein commit nahi kiye jayenge.

Agar secret accidentally Git history mein commit ho jaye, to sirf later commit mein delete karna sufficient nahi hoga. Credential rotation aur history cleanup required hoga.

---

# 11. Notification Service Responsibilities

Milestone 1 mein Notification Service ka primary responsibility device registration management hai.

Service:

1. Authenticated user identify karegi.
2. Native FCM registration receive karegi.
3. Device information validate karegi.
4. PostgreSQL mein registration create/update karegi.
5. Existing registration ko duplicate hone se prevent karegi.
6. `updated_at` aur `last_seen_at` maintain karegi.
7. Logout par registration deactivate karegi.
8. Previously deactivated registration ko re-activate kar sakti hai.
9. Invalid requests ke liye appropriate GraphQL errors return karegi.

---

# 12. Authentication Flow

Mobile application directly Notification Service ko trusted user identity provide nahi karegi.

Flow:

```text
Mobile App
    |
    | Authorization: Bearer <JWT>
    v
Apollo Gateway
    |
    | JWT validation
    v
Authenticated User Context
    |
    v
Notification Service
```

Apollo Gateway JWT verify karega aur authenticated user context Notification Service tak forward karega.

Notification Service ko request body mein manually supplied `userId` ko authentication source ke roop mein trust nahi karna chahiye.

---

# 13. Authenticated User Identification

Notification Service authenticated user ko Gateway ke trusted user context se identify karti hai.

Conceptually:

```text
JWT
 |
 v
Apollo Gateway
 |
 | validate JWT
 v
x-user.id
 |
 v
Notification Service
 |
 v
device_registrations.user_id
```

Gateway example:

```text
x-user: {"id":"159","email":"user@example.com"}
```

Notification Service `x-user.id` ko authenticated user ID ke roop mein use karti hai.

Mobile client mutation input mein `userId` provide nahi karta.

Isse client kisi doosre user ke ID ke naam par device registration create nahi kar sakta.

---

# 14. Device Registration Model

Milestone 1 mein ek user ke multiple devices support kiye jaate hain.

Example:

```text
User 101
   |
   +---- Phone
   |
   +---- Tablet
```

Har device ki separate registration hoti hai.

---

# 15. Database Design

Primary table:

```text
device_registrations
```

Columns:

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

## Column Meaning

| Column         | Purpose                                       |
| -------------- | --------------------------------------------- |
| `id`           | Unique database record ID                     |
| `user_id`      | Authenticated GoodSharing user                |
| `device_id`    | Stable application-level device identifier    |
| `fcm_token`    | Native Firebase device token                  |
| `platform`     | Supported mobile platform: `android` or `ios` |
| `is_active`    | Registration active/deactivated state         |
| `created_at`   | Registration creation time                    |
| `updated_at`   | Last record modification time                 |
| `last_seen_at` | Last successful registration/refresh time     |

---

# 16. Device Identification Strategy

Mobile application ek stable application-level `device_id` maintain karti hai.

`device_id` ka purpose current app installation ko identify karna hai.

Ye authenticated `user_id` nahi hai.

Registration identity:

```text
user_id + device_id
```

ko unique logical registration maana jaata hai.

Database level par:

```text
UNIQUE(user_id, device_id)
```

constraint use kiya jaata hai.

---

# 17. Duplicate Prevention

Same user aur same device ke liye multiple records create nahi hone chahiye.

Example:

```text
user_id = 101
device_id = device-abc
```

Agar ye registration dobara submit hoti hai:

```text
registerDevice()
```

to new row create nahi hogi.

Existing registration update hogi:

- `fcm_token`
- `is_active`
- `updated_at`
- `last_seen_at`

Isse app restart ya token refresh ke baad duplicate database records nahi banenge.

Database constraint aur `ON CONFLICT (user_id, device_id)` upsert behavior dono duplicate prevention mein contribute karte hain.

---

# 18. Same Device, Different User

Same physical device par different users different times par login kar sakte hain.

Example:

```text
User A → Device X
User B → Device X
```

Database design:

```text
UNIQUE(user_id, device_id)
```

allow karega:

```text
User A + Device X
User B + Device X
```

lekin prevent karega:

```text
User A + Device X
User A + Device X
```

Important constraint:

Active FCM tokens ke liye database mein partial unique index hai. Isliye same FCM token multiple users ke active registrations mein simultaneously exist nahi kar sakta.

Expected lifecycle:

```text
User A
  |
  +-- Device X + Token T
  |
  +-- logout
  |
  +-- registration inactive
  |
  v
User B
  |
  +-- Device X + Token T
  |
  +-- registration active
```

Logout ke time current authenticated user ki registration deactivate ki jaati hai.

---

# 19. Multiple Devices per User

Ek user multiple devices register kar sakta hai.

Example:

```text
User A
 |
 +-- Android Phone
 |
 +-- Android Tablet
```

Dono registrations independently maintain hongi.

Ye future notification delivery ke liye important hai kyunki same user ke multiple active devices ho sakte hain.

---

# 20. Registration Update Strategy

Agar existing device registration dobara submit hoti hai:

```text
Existing Registration
        |
        v
Update registration
```

instead of:

```text
Create another row
```

Following information refresh hoti hai:

```text
fcm_token
is_active
updated_at
last_seen_at
```

Agar registration previously inactive thi aur same user/device dobara register karta hai, registration active state mein reactivate ho sakti hai.

---

# 21. Logout Strategy

Milestone 1 mein logout ke time registration ko permanently delete karne ke bajay **deactivate** kiya jaata hai.

Example:

```text
is_active = false
```

Advantages:

- Registration history retain hoti hai.
- Debugging easier hoti hai.
- Same user/device future login par registration reactivate ho sakti hai.
- Database identity stable rehti hai.

Logout flow:

```text
Mobile App
    |
    | unregister/deactivate device
    v
Apollo Gateway
    |
    v
Notification Service
    |
    v
PostgreSQL
    |
    | is_active = false
    v
Device Registration
```

JWT ko local storage se delete karne se pehle logout/deactivation request complete karne ki koshish ki jaati hai.

---

# 22. Permission Denied Behavior

Agar user notification permission deny karta hai:

- Login fail nahi hoga.
- Signup fail nahi hoga.
- App crash nahi karegi.
- Device registration optional rahegi.
- Notification registration gracefully skip hogi.

Example:

```text
Login
 |
 +--> Permission granted
 |       |
 |       v
 |   Register FCM
 |
 +--> Permission denied
         |
         v
     Continue app normally
```

Notification registration errors authentication flow ko fail nahi karte.

---

# 23. Token / Registration Refresh

FCM registration token change ho sakta hai.

Isliye application:

- Login ke baad registration karegi.
- Signup ke baad registration karegi.
- Already-authenticated app start par registration refresh karegi.
- Native token refresh event par backend registration update karegi.
- Registration refresh ko idempotent rakhegi.

FCM token rotation ke case mein existing `(user_id, device_id)` registration update hoti hai instead of creating an unnecessary duplicate.

---

# 24. Mobile App Flow

## Login

```text
User Login
    |
    v
JWT received
    |
    v
Notification permission/status check
    |
    v
Native FCM device token
    |
    v
registerDevice()
```

---

# 25. Signup

```text
User Signup
    |
    v
Authenticated session
    |
    v
Notification permission/status check
    |
    v
Native FCM device token
    |
    v
registerDevice()
```

---

# 26. Authenticated App Restart

Already authenticated user ke case mein:

```text
App Start
    |
    v
Existing JWT/session
    |
    v
Native FCM registration refresh
    |
    v
registerDevice()
    |
    v
Update registration timestamps/token
```

Registration idempotent hone ki wajah se app restart duplicate registration create nahi karta.

---

# 27. Logout

```text
Logout
    |
    v
unregisterDevice()
    |
    v
is_active = false
    |
    v
Delete local JWT/session
```

Logout request current authenticated user aur current `device_id` ke basis par registration deactivate karti hai.

---

# 28. GraphQL API

Milestone 1 ke primary operations:

## `registerDevice`

Purpose:

- Device registration create/update karna.
- Existing registration ko reactivate karna.
- Token rotation update karna.

Expected input:

```text
deviceId
fcmToken
platform
```

Authenticated user `x-user.id` ke through context se identify hota hai.

`userId` mutation input ka part nahi hai.

## `unregisterDevice`

Purpose:

- Current authenticated user's device registration deactivate karna.

Expected input:

```text
deviceId
```

User identity Gateway-provided authentication context se identify hoti hai.

## Device Registration Response

Response mein FCM token unnecessary exposure se avoid kiya jaata hai.

Useful fields:

```text
id
userId
deviceId
platform
isActive
createdAt
updatedAt
lastSeenAt
```

Complete FCM token GraphQL response mein return nahi kiya jaata.

---

# 29. GraphQL Error Handling

Common situations:

## Unauthenticated Request

Example:

```text
Authentication required
```

## Invalid Authentication Context

Example:

```text
Invalid x-user header
```

## Invalid Input

Examples:

```text
userId is required
deviceId is required
fcmToken is required
Invalid platform. Supported platforms are android and ios
```

## Database Error

Internal error response with sensitive database details hidden.

## Firebase Configuration Error

Server-side configuration issue log ho sakta hai, lekin private credential/error details client ko return nahi kiye jayenge.

---

# 30. FCM Token Security

FCM registration token operationally sensitive data hai.

Isliye:

- Complete token unnecessary production logs mein print nahi hoga.
- GraphQL response mein token return nahi kiya jaata.
- Token PostgreSQL mein securely store hota hai.
- Firebase Admin private credentials PostgreSQL mein store nahi hote.
- Firebase Admin credentials mobile application mein nahi jayenge.

---

# 31. Firebase Client vs Firebase Admin Credentials

Do alag configurations hain.

## Mobile Application

Firebase Android application configuration:

```text
google-services.json
```

Ye mobile Firebase configuration hai.

## Backend Notification Service

Firebase Admin credentials:

```text
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
```

Ye private backend credentials hain.

**Firebase Admin credentials kabhi mobile application mein nahi jayenge.**

---

# 32. Health Check

Notification Service mein health-check endpoint provide kiya gaya hai.

Example:

```text
GET /health
```

Expected response:

```json
{
  "status": "ok"
}
```

Health check ka purpose service availability aur database connectivity verify karna hai.

---

# 33. Docker Support

Notification Service ke liye Dockerfile provide kiya gaya hai.

Expected runtime:

```text
Node.js 20
```

Container mein:

- Application code
- Production dependencies
- Environment-based configuration

include honge.

Secrets image ke andar bake nahi kiye jayenge.

`.dockerignore` exclude karta hai:

```text
.env
.env.*
Firebase service-account JSON
private keys
node_modules
coverage
dist
.git
```

---

# 34. Testing Strategy

Milestone 1 mein automated tests multiple levels par available hain.

## Registration Tests

- New device registration
- Existing device update
- Repeated registration/idempotency
- FCM token rotation
- Same device with different users
- Deactivation
- Reactivation
- Invalid platform/input
- Missing required fields

## Authentication Tests

- `x-user.id` authentication
- Unauthenticated `registerDevice` mutation
- Malformed `x-user`
- `userId` ko authentication source ke roop mein reject karna
- Authenticated mutation context

## Database Integration Tests

- `user_id` type validation
- `(user_id, device_id)` unique constraint
- Active FCM token unique partial index
- Duplicate active FCM token rejection
- Inactive-token reuse
- Database-backed uniqueness behavior

Current automated test result:

```text
Test Files: 3 passed
Tests: 27 passed
```

---

# 35. Milestone 1 Manual Verification

Manual verification flow:

```text
1. Start Notification Service
2. Start PostgreSQL
3. Start Apollo Gateway
4. Build/install Android application
5. Login
6. Verify native Firebase device token
7. Verify PostgreSQL registration
8. Restart application
9. Verify no duplicate row
10. Verify registration/timestamp refresh
11. Logout
12. Verify registration inactive
```

---

# 36. Screen Recording Requirements

Screen recording mein following demonstrate kiya jayega:

1. User login.
2. Native Firebase/FCM device token generation.
3. Token registration request completion.
4. PostgreSQL mein device registration save hona.
5. Application restart karna.
6. Duplicate registration create na hona.
7. Logout karna.
8. PostgreSQL mein registration inactive/deactivated hona.

Recording mein hide karna hai:

- Complete FCM tokens
- Passwords
- JWTs
- Database credentials
- Firebase Admin service-account credentials
- Private keys

---

# 37. Repository Requirements

Notification Service repository mein:

```text
src/
  ...

migrations/
  ...

tests/
  authentication.test.js
  deviceRegistration.test.js
  database.integration.test.js

Dockerfile
.dockerignore
.env.example
.gitignore
package.json
package-lock.json
README.md
```

README mein:

- Prerequisites
- Node.js 20 requirement
- Environment setup
- PostgreSQL setup
- Migration instructions
- Firebase Admin configuration
- Local server start
- Docker startup
- Tests run karne ka command
- Health-check instructions
- Authenticated GraphQL examples
- Authentication flow
- Token uniqueness behavior
- Logout/deactivation behavior

document kiya gaya hai.

---

# 38. Git and Pull Request Strategy

Milestone 1 ke liye do separate pull requests hain:

## PR 1

```text
Notification Service
```

## PR 2

```text
GoodSharing Mobile App
```

Main branch par direct commit nahi kiya jana chahiye.

Meaningful commits use kiye jayenge.

---

# 39. Suggested Commit Structure

Example:

```text
docs: define notification service design

chore: initialize notification service

feat: add postgres device registration migration

feat: add firebase admin initialization

feat: implement device registration graphql API

feat: implement device deactivation

test: add device registration tests

feat: integrate native fcm registration in mobile app

test: verify device registration lifecycle

docs: update milestone 1 documentation
```

Actual commit structure implementation ke according adjust kiya ja sakta hai.

---

# 40. Migration from Expo Push Service

Previous flow:

```text
Current:
Mobile App
    |
    v
Expo Push Service
```

Milestone 1 mobile registration flow:

```text
Mobile App
    |
    v
Native Device Push Token
    |
    v
Apollo Gateway
    |
    v
Notification Service
    |
    v
PostgreSQL
```

Future notification delivery flow direct FCM ke through hoga.

Existing Expo Push Tokens ko native FCM registrations ke equivalent ke roop mein migrate nahi kiya jayega.

Users fresh native Firebase device registration ke through register honge.

---

# 41. Future Notification Flow

Milestone 1 ke baad future architecture:

```text
User creates Post
       |
       v
Posts Service
       |
       | PostCreated Event
       v
Notification Service
       |
       v
Find subscribed users
       |
       v
Find active device registrations
       |
       v
Redis Queue
       |
       v
Firebase Cloud Messaging
       |
       v
User Devices
```

Ye Milestone 1 mein implement nahi kiya gaya hai.

---

# 42. Future Database Entities

Future milestones mein following entities add/modify ho sakti hain:

## Category Subscriptions

```text
category_subscriptions
```

## Notification Records

```text
notification_records
```

Lekin Milestone 1 ka primary database entity:

```text
device_registrations
```

hai.

---

# 43. Important Design Decisions

## Decision 1 – Multiple Devices

One user → many device registrations.

**Reason:** User multiple mobile devices use kar sakta hai.

## Decision 2 – Duplicate Prevention

Use:

```text
UNIQUE(user_id, device_id)
```

**Reason:** Same user ke same device ke duplicate registrations prevent karna.

## Decision 3 – Active FCM Token Uniqueness

Use partial unique index:

```text
UNIQUE(fcm_token) WHERE is_active = true
```

**Reason:** Same active FCM token simultaneously multiple active users/registrations ko represent nahi karna chahiye.

## Decision 4 – Logout

Registration deactivate ki jayegi:

```text
is_active = false
```

**Reason:** History retain karna aur future reactivation support karna.

## Decision 5 – Authentication

User identity Gateway ke validated authentication context se aayegi.

**Reason:** Client-provided user ID ko blindly trust nahi karna.

## Decision 6 – Firebase Credentials

Admin credentials backend-only rahengi.

**Reason:** Firebase Admin credentials privileged server-side credentials hain.

## Decision 7 – Permission Denied

Permission denial login ko block nahi karega.

**Reason:** Push notification permission authentication ka prerequisite nahi hai.

---

# 44. Milestone 1 Acceptance Criteria

Milestone 1 implementation ke acceptance criteria:

- [x] App native Firebase/FCM device token flow use kare, Expo Push Token flow nahi.
- [x] Registration authenticated user se correctly associate ho.
- [x] One user multiple devices register kar sake.
- [x] Same user/device registration duplicate record create na kare.
- [x] Authenticated app startup registration safely refresh ho.
- [x] `last_seen_at` / update information refresh ho.
- [x] Logout correct device registration ko deactivate kare.
- [x] Unauthenticated user device register na kar sake.
- [x] Notification permission denied hone par login/application fail na ho.
- [x] FCM token rotation existing registration ko update kare.
- [x] Previously deactivated registration reactivate ho sake.
- [x] Firebase Admin credentials backend-only rahen.
- [x] Private credentials repository mein commit na hon.
- [x] PostgreSQL migration available ho.
- [x] GraphQL schema/resolvers available hon.
- [x] Health endpoint available ho.
- [x] Dockerfile available ho.
- [x] `.dockerignore` sensitive files exclude kare.
- [x] README exact local/Docker/test setup explain kare.
- [x] Automated tests pass hon.
- [x] Database-backed migration/constraint tests pass hon.
- [x] Notification Service PR prepared ho.
- [x] Mobile App PR prepared ho.
- [ ] Required screen recording complete aur submitted ho.
- [x] Milestone 2 notification-sending work abhi start nahi kiya gaya hai.

**Current automated verification:** `27/27 tests passed`.

---

# 45. Manager Review Questions – Prepared Answers

## 1. Expo push token aur native Firebase registration mein difference kya hai?

Expo push token Expo Push Service ke through notification delivery ke liye use hota tha.

Native device push token Firebase Cloud Messaging ke saath direct device registration ko represent karta hai.

Milestone 1 mein native Firebase device token flow use kiya ja raha hai.

---

## 2. Firebase Admin credentials mobile application mein kyun nahi rakh sakte?

Firebase Admin credentials privileged backend credentials hain.

Agar ye mobile APK mein chale jayein to attacker credentials extract karke Firebase project par unauthorized server-side operations kar sakta hai.

Isliye ye sirf backend/server-side environment mein rahenge.

---

## 3. One user ke multiple device registrations kyun?

User ek se zyada mobile devices use kar sakta hai.

Example:

```text
Phone
Tablet
```

Dono devices ko independently register karna required hai.

---

## 4. Application reinstall hone par kya ho sakta hai?

Reinstall ke baad local application state aur generated device identity change ho sakti hai.

Fresh installation native Firebase registration obtain karegi aur backend par new registration create kar sakti hai.

Old registration future cleanup strategy ke according inactive reh sakti hai.

---

## 5. Database duplicates kaise prevent karega?

Database constraint:

```text
UNIQUE(user_id, device_id)
```

same user aur same device ke duplicate records prevent karega.

Additionally application registration `ON CONFLICT` update behavior use karti hai.

---

## 6. Same registration dobara submit hone par?

New record create nahi hoga.

Existing registration update hogi:

```text
fcm_token
updated_at
last_seen_at
is_active
```

---

## 7. Same device par doosra user login kare to?

Current user's registration logout ke time deactivate ki jaati hai.

Doosre authenticated user ke login par same device ke liye us user ke context mein separate registration create/update ki ja sakti hai.

Active FCM token uniqueness constraint ensure karta hai ki same token multiple active registrations mein simultaneously remain na kare.

---

## 8. Logout par delete ya deactivate?

Milestone 1 mein deactivate preferred hai:

```text
is_active = false
```

Isse registration history retain hoti hai aur future login par registration update/reactivate ki ja sakti hai.

---

## 9. Notification Service authenticated user ko kaise identify karegi?

Apollo Gateway JWT validate karega aur authenticated user context Notification Service ko forward karega.

Notification Service `x-user.id` ko authenticated user identity ke roop mein use karti hai.

Client ke arbitrary `userId` ko authentication source nahi maana jayega.

---

## 10. Login, signup, restart aur logout ke baad kaunsa code execute hoga?

### Login

```text
Login success
→ native device token
→ registerDevice
```

### Signup

```text
Signup success
→ native device token
→ registerDevice
```

### Authenticated App Restart

```text
App startup
→ authenticated session detected
→ native device token refresh
→ registerDevice
```

### Logout

```text
Logout
→ unregisterDevice
→ is_active = false
→ local JWT/session removal
```

---

## 11. Notification permission denied ho to?

Application login/signup continue karegi.

FCM registration skip ho sakti hai.

Application crash nahi karegi aur authentication block nahi hoga.

---

## 12. Firebase configuration aur private credential mein difference?

Mobile app:

```text
google-services.json
```

Firebase Android application configuration ke liye hai.

Backend:

```text
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
```

Firebase Admin SDK ke privileged credentials hain.

Backend credentials mobile application mein nahi jayenge.

---

# 46. Milestone 1 Completion Boundary

Milestone 1 ka final implementation boundary:

```text
Android App
    |
    | Native Firebase Device Token
    v
Apollo Gateway
    |
    | Authenticated User Context
    v
Notification Service
    |
    | Register / Update / Deactivate
    v
PostgreSQL
```

Is point par notification **send nahi ki jayegi**.

Milestone 1 ka goal reliable, authenticated, duplicate-safe aur lifecycle-aware device registration foundation banana hai.

---

# 47. Final Understanding

GoodSharing ke future notification system mein Expo Push Service ko replace karke direct Firebase Cloud Messaging use kiya jayega.

Milestone 1 mein hum complete notification delivery system nahi bana rahe hain.

Hum pehle foundation bana rahe hain:

```text
Native FCM Device Registration
        ↓
Authenticated User
        ↓
Notification Service
        ↓
PostgreSQL
```

Is foundation ke through GoodSharing securely identify kar sakta hai ki kaunse authenticated user ke kaunse devices notification registration ke liye active hain.

Future milestones mein isi registration data ko use karke category-based post notifications, queues, retries aur Firebase notification delivery implement ki jayegi.

---

# 48. Official Documentation

- Firebase Cloud Messaging: https://firebase.google.com/docs/cloud-messaging
- Firebase Admin SDK: https://firebase.google.com/docs/admin/setup
- Expo Notifications: https://docs.expo.dev/push-notifications/overview/
- Expo Notifications API: https://docs.expo.dev/versions/latest/sdk/notifications/
- Apollo Federation: https://www.apollographql.com/docs/graphos/schema-design/federated-schemas
- PostgreSQL: https://www.postgresql.org/docs/

---

# 49. Milestone Status

**Current status: Milestone 1 Implementation Complete**

## Completed backend work

- Git repository and feature branch setup
- Node.js 20 runtime
- ES modules configuration
- Environment configuration
- PostgreSQL device registration migration
- Firebase Admin SDK initialization
- Apollo federated subgraph
- `registerDevice` GraphQL mutation
- `unregisterDevice` GraphQL mutation
- Gateway `x-user.id` authentication integration
- Device registration validation
- Duplicate registration protection
- Active FCM token uniqueness protection
- FCM token rotation handling
- Same-device user switching support
- Device deactivation
- Device reactivation
- Health endpoint
- Dockerfile
- `.dockerignore`
- README
- Automated unit/integration tests

## Completed mobile work

- Native device push token registration
- Removal of `getExpoPushTokenAsync`
- Removal of direct Expo Push Service calls
- Device registration after login
- Device registration after signup
- Authenticated app-startup re-registration
- FCM token refresh/change handling
- Device unregistration before logout
- Permission-denied handling without breaking authentication
- No Firebase Admin credentials in the mobile application

## Automated verification

Current backend test result:

```text
Test Files: 3 passed
Tests: 27 passed
```

Coverage includes:

- `x-user.id` authentication
- Unauthenticated GraphQL mutation
- Repeated registration
- FCM token rotation
- Same-device user switching
- Logout/deactivation
- Reactivation
- Invalid platform/input
- Database-backed migration and constraint behavior

## Remaining submission activities

- Final PR review/cleanup
- Mobile physical-device verification
- PostgreSQL end-to-end demonstration
- Required screen recording
- PR submission/review

## Milestone 2 boundary

The following remain intentionally out of scope until Milestone 1 review/approval is complete:

- Post creation notification sending
- Posts Service notification integration
- Redis
- Queues
- Retries
- Background notification workers
- Category-based notification delivery
- Notification batching
- Notification delivery tracking

**Milestone 1 implementation and automated verification are complete; final submission requires the physical-device demonstration/recording and PR review.**
