# KWR Dashboard Server

## Permissions

Make sure you copy permissions.test.json to permissions.json in /functions/src folder <br />
Ask for client keys from admin

## Required Permission Files
- `permissions.json` - Production permissions file
- `permissions.dev.json` - Development permissions file
- `permissions.test.json` - Test permissions file

Contact the admin to obtain these files as they contain sensitive client keys and configuration.

## Firebase

install firebase cli to use <br />
`npm i firebase-tools -g`

Make sure npm version >= 18
To run project locally

`firebase login`
`cd functions && npm install`

For production environment:
`npm run serve`
Test endpoint: `http://127.0.0.1:5001/finndo-server/us-central1/app/api/test`

For staging environment:
`npm run serve:staging`
Test endpoint: `http://127.0.0.1:5001/finndo-server-dev/us-central1/app/api/test`

## Deployment

To deploy the application to Firebase:

1. Make sure you have the correct permission files in place
2. Ensure you're logged in to Firebase CLI (`firebase login`)
3. Deploy to production:
   ```bash
   cd functions
   npm run deploy
   ```

4. Deploy to staging/development:
   ```bash
   cd functions
   npm run deploy:staging
   ```

Note: Make sure you have the appropriate Firebase project permissions before deploying.