import admin from 'firebase-admin';

type PushPayload = {
  type: string;
  deviceToken?: string | null;
  title: string;
  message: string;
  data?: Record<string, string>;
};

let firebaseInitialized = false;

function ensureFirebase() {
  if (firebaseInitialized || !process.env.FIREBASE_PROJECT_ID) {
    return;
  }

  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!privateKey) {
    return;
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    }),
  });

  firebaseInitialized = true;
}

export async function pushAlert(payload: PushPayload) {
  ensureFirebase();
  if (!firebaseInitialized || !payload.deviceToken) {
    return false;
  }

  try {
    await admin.messaging().send({
      token: payload.deviceToken,
      notification: {
        title: payload.title,
        body: payload.message,
      },
      data: payload.data,
    });
    return true;
  } catch (error) {
    console.error('Falha ao enviar push', error);
    return false;
  }
}


