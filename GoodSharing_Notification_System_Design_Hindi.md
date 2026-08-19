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
- Notification Service ke responsibilities define karna.
- Native Android FCM registration flow explain karna.
- PostgreSQL device-registration design define karna.
- Authentication aur security decisions document karna.
- Testing aur acceptance criteria define karna.
- Future notification milestones ko Milestone 1 se clearly separate rakhna.

**Important:** Milestone 1 mein complete notification system implement nahi kiya jayega.

---

# 2. Current Notification System

Current system mein mobile application Expo Push Service ke through notifications handle karti hai.

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

Is approach mein Expo Push Service GoodSharing ke notification delivery flow ka important dependency hai.

Future architecture mein Expo Push Service ko remove karke direct Firebase Cloud Messaging use kiya jayega.

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

**Redis, queue processing aur notification sending Milestone 1 ka part nahi hain.**

---

# 4. Milestone 1 – FCM Device Registration

## 4.1 Objective

Milestone 1 ka primary objective hai:

> Android application se native Firebase registration obtain karke authenticated user ke saath Notification Service ke PostgreSQL database mein securely register karna.

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

---

# 5. Milestone 1 Scope

Milestone 1 mein following functionality implement ki jayegi:

### Notification Service

- Node.js 20
- ES modules
- Apollo GraphQL federated subgraph
- PostgreSQL integration
- Firebase Admin SDK initialization
- Environment-based configuration
- Device registration GraphQL operations
- Device deactivation/unregistration
- Health-check endpoint
- PostgreSQL migration
- Automated tests
- Dockerfile
- README
- `.env.example`
- `.gitignore`

### Mobile Application

- Firebase Android application configuration
- Native Firebase registration obtain karna
- Login ke baad registration
- Signup ke baad registration
- Authenticated app restart par registration refresh
- Logout par device deactivation
- Permission denied hone par application ko continue karna
- Expo Push Token generation remove karna
- Expo Push Service ke direct calls remove karna

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

GoodSharing ke permanently selected Firebase Spark project ka use kiya jayega.

Android application ka exact package name:

```text
com.neosoft.goodsharing
```

Firebase Android configuration ke liye Firebase project se downloaded:

```text
google-services.json
```

use kiya jayega.

### Important Security Rule

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

Notification Service Firebase Admin SDK use karegi.

Backend configuration environment variables/secrets se load hogi.

Expected configuration:

```text
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

Alternative production implementation mein service-account credential mounted secret ke through bhi load ki ja sakti hai.

Private Firebase credentials source code mein hard-code nahi kiye jayenge.

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

`.gitignore` mein sensitive files/patterns include honge:

```text
node_modules
.env
firebase-service-account.json
*.pem
*.key
coverage
dist
```

Production credentials, passwords, JWT secrets, database passwords aur private keys repository mein commit nahi kiye jayenge.

Agar secret accidentally Git history mein commit ho jaye, to sirf later commit mein delete karna sufficient nahi hoga. Immediately inform karna aur credential rotate karna required hoga.

---

# 11. Notification Service Responsibilities

Milestone 1 mein Notification Service ka primary responsibility device registration management hai.

Service:

1. Authenticated user identify karegi.
2. Native FCM registration receive karegi.
3. Device information validate karegi.
4. PostgreSQL mein registration create/update karegi.
5. Existing registration ko duplicate hone se prevent karegi.
6. Last-seen/update timestamps maintain karegi.
7. Logout par registration deactivate karegi.
8. Invalid requests ke liye appropriate GraphQL errors return karegi.

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

Notification Service ko user identity request body mein manually trust nahi karni chahiye.

---

# 13. Authenticated User Identification

Notification Service authenticated user ko Gateway ke trusted user context se identify karegi.

Conceptually:

```text
JWT
 |
 v
Apollo Gateway
 |
 | validate JWT
 v
Authenticated user ID
 |
 v
Notification Service
```

Isse mobile client kisi doosre user ke ID ke naam par device registration create nahi kar sakta.

---

# 14. Device Registration Model

Milestone 1 mein ek user ke multiple devices support kiye jayenge.

Example:

```text
User 101
   |
   +---- Phone
   |
   +---- Tablet
```

Har device ki separate registration hogi.

---

# 15. Database Design

Primary table:

```text
device_registrations
```

Suggested columns:

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

### Column Meaning

| Column         | Purpose                                   |
| -------------- | ----------------------------------------- |
| `id`           | Unique database record ID                 |
| `user_id`      | Authenticated GoodSharing user            |
| `device_id`    | Device identification                     |
| `fcm_token`    | Native Firebase registration token        |
| `platform`     | Android                                   |
| `is_active`    | Registration active/deactivated state     |
| `created_at`   | Registration creation time                |
| `updated_at`   | Last record modification time             |
| `last_seen_at` | Last successful registration/refresh time |

---

# 16. Device Identification Strategy

Mobile application ek stable application-level `device_id` maintain karegi.

`device_id` ka purpose ek physical/app installation ko identify karna hai.

Registration identity:

```text
user_id + device_id
```

ko unique logical registration maana jayega.

Database level par:

```text
UNIQUE(user_id, device_id)
```

constraint use kiya jayega.

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

---

# 18. Same Device, Different User

Same physical device par different users login kar sakte hain.

Example:

```text
User A → Device X
User B → Device X
```

Ye dono logically different registrations ho sakti hain.

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

Logout ke time current authenticated user's registration deactivate ki jayegi.

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

Instead of:

```text
Create another row
```

following information refresh hogi:

```text
fcm_token
is_active
updated_at
last_seen_at
```

---

# 21. Logout Strategy

Milestone 1 mein logout ke time registration ko permanently delete karne ke bajay **deactivate** karna preferred strategy hai.

Example:

```text
is_active = false
```

Advantages:

- Registration history retain hoti hai.
- Debugging easier hoti hai.
- Same device future login par reactivate ho sakta hai.
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

JWT ko local storage se delete karne se pehle logout/deactivation request complete karne ki koshish ki jayegi.

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

---

# 23. Token / Registration Refresh

FCM registration token change ho sakta hai.

Isliye application:

- Login ke baad registration karegi.
- Signup ke baad registration karegi.
- Already-authenticated app start par registration refresh karegi.
- Token refresh hone par backend registration update karegi.

Registration refresh ko idempotent rakha jayega.

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
Native FCM registration
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
Native FCM registration
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
Existing JWT
    |
    v
Native FCM registration
    |
    v
registerDevice()
    |
    v
Update last_seen_at
```

Is flow se stale registration information refresh ho sakti hai.

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

Logout request mein current authenticated user aur current device identify kiya jayega.

---

# 28. GraphQL API

Milestone 1 ke primary operations:

## registerDevice

Purpose:

- Device registration create/update karna.

Expected input concept:

```text
deviceId
fcmToken
platform
```

Authenticated user request context se identify hoga.

---

## unregisterDevice

Purpose:

- Current device registration deactivate karna.

Device identity request/context se identify ki jayegi.

---

## Device Registration Response

Response mein unnecessary sensitive token data return nahi kiya jayega.

Response mein useful fields ho sakti hain:

```text
id
deviceId
platform
isActive
createdAt
updatedAt
lastSeenAt
```

Complete FCM token response mein unnecessarily expose nahi kiya jayega.

---

# 29. GraphQL Error Handling

Common situations:

### Unauthenticated Request

```text
UNAUTHENTICATED
```

### Invalid Input

```text
BAD_USER_INPUT
```

### Database Error

Internal error response with sensitive database details hidden.

### Firebase Configuration Error

Server-side configuration issue log hoga, lekin private credential/error details client ko return nahi kiye jayenge.

---

# 30. FCM Token Security

FCM registration token sensitive operational data hai.

Isliye:

- Complete token production logs mein print nahi hoga.
- GraphQL response mein unnecessary token return nahi hoga.
- Token database mein securely store hoga.
- Firebase Admin private credentials PostgreSQL mein store nahi honge.

---

# 31. Firebase Client vs Firebase Admin Credentials

Do alag configurations hain.

### Mobile Application

Firebase Android configuration:

```text
google-services.json
```

Ye mobile Firebase configuration hai.

### Backend Notification Service

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

Notification Service mein health-check endpoint provide kiya jayega.

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

Health check ka purpose service availability verify karna hai.

---

# 33. Docker Support

Notification Service ke liye Dockerfile provide kiya jayega.

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

---

# 34. Testing Strategy

Milestone 1 ke important behavior ke liye automated tests honge.

### Registration Tests

- New device registration
- Existing device update
- Duplicate prevention
- Multiple devices for same user
- Same device with different users
- Registration refresh
- Deactivation
- Unauthorized registration

### Permission Behavior

Mobile application mein permission denied case verify kiya jayega.

### Integration Testing

- GraphQL operation
- PostgreSQL persistence
- Authentication context

---

# 35. Milestone 1 Manual Verification

Manual verification flow:

```text
1. Start Notification Service
2. Start PostgreSQL
3. Start Apollo Gateway
4. Build/install Android application
5. Login
6. Verify native Firebase registration
7. Verify PostgreSQL registration
8. Restart application
9. Verify no duplicate row
10. Verify last_seen_at/update
11. Logout
12. Verify registration inactive
```

---

# 36. Screen Recording Requirements

Screen recording mein following demonstrate kiya jayega:

1. Notification Service start karna.
2. Android application mein login karna.
3. Native Firebase registration create hona.
4. PostgreSQL mein registration save hona.
5. Application restart karna.
6. Duplicate record create na hona.
7. Logout karna.
8. Registration inactive/deactivated hona.

Recording mein hide karna hai:

- Complete FCM tokens
- Passwords
- JWTs
- Database credentials
- Firebase service-account credentials
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
  ...

Dockerfile
.env.example
.gitignore
package.json
README.md
```

include honge.

README mein:

- Prerequisites
- Node.js 20 requirement
- Environment setup
- PostgreSQL setup
- Migration instructions
- Firebase Admin configuration
- Local server start
- Tests run karne ka command
- Health-check instructions

document honge.

---

# 38. Git and Pull Request Strategy

Milestone 1 ke liye do separate pull requests submit ki jayengi.

### PR 1

```text
Notification Service
```

### PR 2

```text
GoodSharing Mobile App
```

Main branch par direct commit nahi kiya jayega.

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
```

Actual commit structure implementation ke according adjust kiya ja sakta hai.

---

# 40. Migration from Expo Push Service

Future migration mein:

```text
Current:

Mobile App
    |
    v
Expo Push Service
```

replace hoga with:

```text
Future:

Mobile App
    |
    v
Native FCM Registration
    |
    v
Apollo Gateway
    |
    v
Notification Service
```

Existing Expo Push Tokens ko FCM registration ke roop mein migrate nahi kiya jayega.

Users fresh native Firebase registration ke through register honge.

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

Ye Milestone 1 mein implement nahi kiya jayega.

---

# 42. Future Database Entities

Future milestones mein following entities add/modify ho sakti hain:

### Category Subscriptions

```text
category_subscriptions
```

### Notification Records

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

Reason:

User multiple Android devices use kar sakta hai.

---

## Decision 2 – Duplicate Prevention

Use:

```text
UNIQUE(user_id, device_id)
```

Reason:

Same user ke same device ke duplicate registrations prevent karna.

---

## Decision 3 – Logout

Registration deactivate ki jayegi:

```text
is_active = false
```

Reason:

History retain karna aur future reactivation support karna.

---

## Decision 4 – Authentication

User identity Gateway ke validated authentication context se aayegi.

Reason:

Client-provided user ID ko blindly trust nahi karna.

---

## Decision 5 – Firebase Credentials

Admin credentials backend-only rahengi.

Reason:

Admin credentials ke paas Firebase project ke privileged operations ka access ho sakta hai.

---

## Decision 6 – Permission Denied

Permission denial login ko block nahi karega.

Reason:

Push notification permission application authentication ka prerequisite nahi hai.

---

# 44. Milestone 1 Acceptance Criteria

Milestone 1 tab complete maana jayega jab:

- [ ] App native Firebase registration produce kare, ExpoPushToken nahi.
- [ ] Registration authenticated user se correctly associate ho.
- [ ] One user multiple devices register kar sake.
- [ ] Same device registration duplicate record create na kare.
- [ ] Authenticated app restart registration refresh kare.
- [ ] `last_seen_at`/update information refresh ho.
- [ ] Logout correct device registration ko deactivate kare.
- [ ] Unauthenticated user device register na kar sake.
- [ ] Notification permission denied hone par login/application fail na ho.
- [ ] Firebase Admin credentials backend-only rahen.
- [ ] Private credentials Git history mein present na hon.
- [ ] PostgreSQL migration available ho.
- [ ] GraphQL schema/resolvers available hon.
- [ ] Health endpoint available ho.
- [ ] Dockerfile available ho.
- [ ] README exact local setup explain kare.
- [ ] Automated tests pass hon.
- [ ] Notification Service PR ready ho.
- [ ] Mobile App PR ready ho.
- [ ] Screen recording complete ho.
- [ ] Milestone 2 start na kiya gaya ho jab tak Milestone 1 review/approval complete na ho.

---

# 45. Manager Review Questions – Prepared Answers

## 1. Expo push token aur native Firebase registration mein difference kya hai?

Expo push token Expo Push Service ke through notification delivery ke liye use hota hai.

Native Firebase registration Firebase Cloud Messaging ke saath directly device ko identify karta hai.

Milestone 1 mein native Firebase registration use ki jayegi.

---

## 2. Firebase Admin credentials mobile application mein kyun nahi rakh sakte?

Firebase Admin credentials privileged backend credentials hain.

Agar ye mobile APK mein chale jayein to attacker un credentials ko extract karke backend Firebase resources par unauthorized operations kar sakta hai.

Isliye ye sirf backend/server-side environment mein rahenge.

---

## 3. One user ke multiple device registrations kyun?

User ek se zyada Android devices use kar sakta hai.

Example:

```text
Phone
Tablet
```

Dono devices ko independently register karna required hai.

---

## 4. Application reinstall hone par kya ho sakta hai?

Reinstall ke baad application ka local device identity/token change ho sakta hai.

Fresh installation native Firebase registration obtain karegi aur backend par new/updated registration create karegi.

Old registration future cleanup strategy ke according inactive reh sakti hai.

---

## 5. Database duplicates kaise prevent karega?

Database constraint:

```text
UNIQUE(user_id, device_id)
```

same user aur same device ke duplicate records prevent karega.

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

Current user's registration ko logout ke time deactivate kiya jayega.

Doosre authenticated user ke liye us user ke context mein separate registration create/update ki jayegi.

---

## 8. Logout par delete ya deactivate?

Milestone 1 mein deactivate preferred hai:

```text
is_active = false
```

Isse registration history retain hoti hai aur future login par registration reactivate/update ki ja sakti hai.

---

## 9. Notification Service authenticated user ko kaise identify karegi?

Apollo Gateway JWT validate karega aur authenticated user context Notification Service ko forward karega.

Client ke arbitrary `userId` ko authentication source nahi maana jayega.

---

## 10. Login, signup, restart aur logout ke baad kaunsa code execute hoga?

### Login

```text
Login success
→ FCM registration
→ registerDevice
```

### Signup

```text
Signup success
→ FCM registration
→ registerDevice
```

### Authenticated App Restart

```text
App startup
→ authenticated session detected
→ FCM registration refresh
→ registerDevice
```

### Logout

```text
Logout
→ unregister/deactivate device
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

Milestone 1 ka final boundary:

```text
Android App
    |
    | Native Firebase Registration
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

Milestone 1 ka goal sirf reliable, authenticated aur duplicate-safe device registration foundation banana hai.

---

# 47. Final Understanding

GoodSharing ke future notification system mein Expo Push Service ko replace karke direct Firebase Cloud Messaging use kiya jayega.

Milestone 1 mein hum complete notification delivery system nahi bana rahe hain.

Hum pehle foundation bana rahe hain:

```text
Native FCM Registration
        ↓
Authenticated User
        ↓
Notification Service
        ↓
PostgreSQL
```

Is foundation ke through GoodSharing securely identify kar sakega ki kaunse authenticated user ke kaunse Android devices notification receive karne ke liye registered hain.

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

**Current status: In Progress**

Initial repository setup complete:

- Git repository initialized
- Feature branch created
- Node.js 20 configured
- ES modules configured
- `.env.example` created
- `.gitignore` created
- README initialized
- System design documented

Implementation remaining:

- Notification Service source code
- PostgreSQL migration
- Firebase Admin initialization
- Apollo federated subgraph
- Device registration API
- Device deactivation API
- Authentication integration
- Health endpoint
- Dockerfile
- Automated tests
- Mobile native FCM integration
- Notification Service PR
- Mobile App PR
- Manual verification
- Screen recording

**Milestone 1 is not complete until all acceptance criteria are satisfied and both PRs are ready for review.**
