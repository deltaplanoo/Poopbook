import PocketBase from 'pocketbase';
import { env } from '$env/dynamic/public';

export const pb = new PocketBase(env.PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090');

// The app is a single-page PWA: auth state lives in localStorage via the SDK's
// default LocalAuthStore, so sessions survive reloads and app restarts.
pb.autoCancellation(false);
