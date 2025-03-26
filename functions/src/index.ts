import admin from 'firebase-admin';
import * as functions from 'firebase-functions/v2';
import express from 'express';
import cors from 'cors';
import { ServiceAccount } from 'firebase-admin/lib/app/credential';
import devServiceAccount from './permissions.dev.json';
import prodServiceAccount from './permissions.json';
import routes from './routes';

const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG || '');

const projectId = firebaseConfig.projectId;

const serviceAccount = projectId === 'finndo-server-dev'
  ? devServiceAccount
  : prodServiceAccount;

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: serviceAccount.project_id,
    privateKey: serviceAccount.private_key,
    clientEmail: serviceAccount.client_email,
  } as ServiceAccount),
  databaseURL:
    'https://kwr-server-default-rtdb.asia-southeast1.firebasedatabase.app',
});
const db = admin.firestore();

db.settings({ ignoreUndefinedProperties: true })

const app = express();
const allowedOrigins = ['http://localhost:5173', 'https://finndo.com'];

app.use(cors({
  origin: (origin, callback) => {
    if (allowedOrigins.includes(origin || '') || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

functions.setGlobalOptions({
  timeoutSeconds: 540,
  memory: '2GiB'
});

export const api = functions.https.onRequest(app)

// Use the imported routes
app.use(routes);

const server = app.listen();

// Timeout 9 minutes
server.timeout = 540000

// Export the app as a Cloud Function
exports.app = api;
export { db };
