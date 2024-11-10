import admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { https } from 'firebase-functions/v2';
import express from 'express';
import cors from 'cors';
import { ServiceAccount } from 'firebase-admin/lib/app/credential';
import serviceAccount from './permissions.json';
import routes from './dashboard/routes';

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
app.use(cors({ origin: true, credentials: false }));

export const api = functions.runWith({
  timeoutSeconds: 540,
  memory: '1GB'
}).https.onRequest(app);

// Use the imported routes
app.use(routes);

const server = app.listen();

// Timeout 9 minutes
server.timeout = 540000

// Export the app as a Cloud Function
exports.app = https.onRequest(app);
export { db };
