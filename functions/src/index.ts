import admin from 'firebase-admin';
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

const app = express();
app.use(cors({ origin: true, credentials: false }));
// Use the imported routes
app.use(routes);

// Export the app as a Cloud Function
exports.app = https.onRequest(app);
export { db };
