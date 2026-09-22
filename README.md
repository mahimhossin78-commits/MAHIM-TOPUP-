# MAHIM TOPUP — Firebase Free Database Version

এই ভার্সনে Render Persistent Disk লাগবে না। Customer, Order, Package, Settings ও Admin data Firebase Firestore-এ থাকবে।

## Features
- Mobile OTP নেই
- Gmail verification নেই
- Registration: Name, Gmail, Mobile, Password
- Unique Customer ID
- Customer profile/order history
- Admin dashboard
- PENDING / CONFIRMED / COMPLETED / REJECTED / CANCELLED
- Customer-visible Admin Note
- Admin-only Internal Note
- Package/price/settings edit
- Admin password change
- Completed order কখনও auto-delete হবে না

## Render
Build Command:
`npm install`

Start Command:
`npm start`

Environment Variables:
- `NODE_ENV=production`
- `PORT=10000`
- `SESSION_SECRET=একটি শক্ত random secret`
- `ADMIN_PASSWORD=প্রথম admin password`

Firebase credentials — যেকোনো একটি পদ্ধতি:

### Option A (সহজ): FIREBASE_SERVICE_ACCOUNT_JSON
Firebase Console → Project settings → Service accounts → Generate new private key থেকে JSON file-এর পুরো content এই Render environment variable-এ দিন।

Variable:
`FIREBASE_SERVICE_ACCOUNT_JSON`

**Service-account JSON কখনও GitHub-এ upload করবেন না।**

### Option B: 3টি variable
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Private key-তে line break থাকলে `\n` আকারে রাখা যাবে।

## Firebase Firestore
Firebase Console → Firestore Database → Create database → Production mode → region নির্বাচন করুন।

এই server Firebase Admin SDK ব্যবহার করে, তাই Firestore security rules public করে দিতে হবে না।

## Admin
URL:
`/admin`

Username:
`admin`

Password:
প্রথমবার `ADMIN_PASSWORD`-এ দেওয়া password।

Admin Panel থেকে password বদলালে Firestore-এ নতুন password সংরক্ষিত হবে।


UI: Professional dark blue/cyan/purple responsive customer + admin interface. Backend/API and Firestore behavior preserved.
