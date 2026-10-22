import { lookup } from 'node:dns/promises';
import type { ResolvedAddress } from '../../src/connectors/web.ts';
import { startBrowserWorker } from '../../src/workers/browser/entry.ts';

// A separate fixture-only entry injects loopback access, and shorter live limits when a test asks.
// Production has no environment or HTTP bypass for either.
const args = process.argv.slice(2);
const limits = args.find((arg) => arg.startsWith('limits='));
const missingHost = args.find((arg) => arg.startsWith('missing-host='));
const fixtureOrigins = args.filter((arg) => arg !== limits && arg !== missingHost);
if (!fixtureOrigins.length) throw new Error('The browser fixture origin is required');
await startBrowserWorker({
  network: {
    fixtureOrigins,
    // A DNS failure fixture must not wait for the machine's external resolver.
    resolve: missingHost
      ? async (hostname) => {
          if (hostname === missingHost.slice('missing-host='.length))
            throw Object.assign(new Error('Fixture host not found'), { code: 'ENOTFOUND' });
          return (await lookup(hostname, { all: true, verbatim: true })) as ResolvedAddress[];
        }
      : undefined,
  },
  live: limits ? { limits: JSON.parse(limits.slice('limits='.length)) } : undefined,
});
