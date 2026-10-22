/**
 * Prints a fresh Web Push (VAPID) key pair for deploy/.env, for an install
 * configured before push existed. configure.ts writes one on a new install.
 */
import { generateVapidKeys } from '../../apps/openduet/src/push/webpush.ts';

const keys = await generateVapidKeys();
process.stdout.write(
  `OPENDUET_VAPID_PUBLIC_KEY=${keys.publicKey}\nOPENDUET_VAPID_PRIVATE_KEY=${keys.privateKey}\n`,
);
