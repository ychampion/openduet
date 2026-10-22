/** A sample build has exactly one in-memory API origin and never uses account cookies. */
export function sampleRequestAllowed(url: URL, api: URL, page: URL, method = 'GET'): boolean {
  if (
    api.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(api.hostname) ||
    api.port !== '3321' ||
    api.username ||
    api.password
  )
    return false;
  if (url.origin === api.origin) return true;
  return (
    url.origin === page.origin &&
    ['GET', 'HEAD'].includes(method.toUpperCase()) &&
    !/^\/api(?:\/|$)/.test(url.pathname)
  );
}

export function isolatedSampleFetch(fetcher: typeof fetch, api: URL, page: URL): typeof fetch {
  return ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request?.url ?? String(input), page);
    const method = init?.method ?? request?.method ?? 'GET';
    if (!sampleRequestAllowed(url, api, page, method))
      return Promise.reject(new Error('Sample day can only use its isolated local fixtures.'));
    const headers = new Headers(init?.headers ?? request?.headers);
    for (const name of ['authorization', 'cookie', 'proxy-authorization']) headers.delete(name);
    return fetcher(input, { ...init, headers, credentials: 'omit', redirect: 'error' });
  }) as typeof fetch;
}
