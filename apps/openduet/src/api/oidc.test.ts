import { describe, expect, test } from 'bun:test';
import { loadEnv } from '../env.ts';
import { hasRequiredClaim, safeReturnPath } from './oidc.ts';

describe('the required claim', () => {
  const required = (setting: string) => {
    const env = loadEnv({
      NODE_ENV: 'test',
      OPENDUET_PUBLIC_URL: 'https://openduet.example.test',
      OPENDUET_OIDC_ISSUER: 'https://id.example.test',
      OPENDUET_OIDC_CLIENT_ID: 'client',
      OPENDUET_OIDC_CLIENT_SECRET: 'secret',
      OPENDUET_OIDC_REQUIRE_CLAIM: setting,
    });
    return env.OPENDUET_OIDC_REQUIRE_CLAIM;
  };

  test('the setting is split at its first =', () => {
    expect(required('groups=openduet')).toEqual({ name: 'groups', value: 'openduet' });
    expect(required('tier=a=b')).toEqual({ name: 'tier', value: 'a=b' });
    expect(required('https://example.test/roles=member')).toEqual({
      name: 'https://example.test/roles',
      value: 'member',
    });
    for (const bad of ['=x', 'noequals', 'bad name=x', 'name='])
      expect(() => required(bad)).toThrow();
  });

  test('strings, numbers, booleans and lists of them match by their text', () => {
    expect(hasRequiredClaim({}, undefined)).toBe(true);
    expect(hasRequiredClaim({ access: true }, required('access=true'))).toBe(true);
    expect(hasRequiredClaim({ access: 'true' }, required('access=true'))).toBe(true);
    expect(hasRequiredClaim({ access: false }, required('access=true'))).toBe(false);
    expect(hasRequiredClaim({ level: 3 }, required('level=3'))).toBe(true);
    expect(hasRequiredClaim({ groups: ['a', 'openduet'] }, required('groups=openduet'))).toBe(true);
    expect(hasRequiredClaim({ groups: ['a', 'b'] }, required('groups=openduet'))).toBe(false);
    expect(hasRequiredClaim({ groups: 'openduet-staff' }, required('groups=openduet'))).toBe(false);
    // An object or a list of objects never matches by accident.
    expect(hasRequiredClaim({ groups: { openduet: true } }, required('groups=openduet'))).toBe(
      false,
    );
    expect(hasRequiredClaim({ groups: [['openduet']] }, required('groups=openduet'))).toBe(false);
    expect(hasRequiredClaim({}, required('groups=openduet'))).toBe(false);
  });

  test('a dotted name reaches into nested claims; an exact name wins', () => {
    const roles = required('realm_access.roles=openduet');
    expect(hasRequiredClaim({ realm_access: { roles: ['user', 'openduet'] } }, roles)).toBe(true);
    expect(hasRequiredClaim({ realm_access: { roles: ['user'] } }, roles)).toBe(false);
    expect(hasRequiredClaim({ realm_access: ['roles'] }, roles)).toBe(false);
    expect(hasRequiredClaim({ 'realm_access.roles': 'openduet' }, roles)).toBe(true);
    // A namespaced claim, whose name has dots of its own, is found by that name.
    const namespaced = required('https://example.test/roles=member');
    expect(hasRequiredClaim({ 'https://example.test/roles': ['member'] }, namespaced)).toBe(true);
    // Nothing inherited from Object is a claim.
    expect(hasRequiredClaim({}, required('constructor.name=Object'))).toBe(false);
    expect(hasRequiredClaim({ a: {} }, required('a.toString=x'))).toBe(false);
  });
});

describe('the return path', () => {
  test('stays inside the app', () => {
    for (const target of [
      '//evil.example',
      '/\\evil.example',
      '/%2F%2Fevil.example',
      '\\\\evil.example',
      'https://evil.example',
      '/#//evil.example',
      '/chat\r\nLocation: https://evil.example',
      `/chat${String.fromCharCode(0x2028)}x`,
      '/welcome',
      '/welcome?signin_error=no_account',
      '',
      undefined,
      null,
    ]) {
      const path = safeReturnPath(target);
      expect(path.startsWith('/')).toBe(true);
      expect(path.startsWith('//') || path.startsWith('/\\')).toBe(false);
      expect(path).not.toMatch(/[#\s\\]/);
    }
    expect(safeReturnPath('/plans?tab=week')).toBe('/plans?tab=week');
    // Percent-encoded slashes stay inside the fragment the app routes on.
    expect(safeReturnPath('/%2F%2Fevil.example')).toBe('/%2F%2Fevil.example');
  });

  test('random input never yields a path that leaves the app', () => {
    const alphabet = `/\\#?%:@.-_~!$&'()*+,;= aZ09\t\r\n${String.fromCharCode(0, 0xe9, 0x2028)}`;
    // Printable ASCII only, and none of the characters that could end the path.
    const printable = (text: string) =>
      [...text].every((ch) => ch >= '!' && ch <= '~' && ch !== '#' && ch !== '\\');
    for (let round = 0; round < 20_000; round++) {
      let value = '';
      const length = Math.floor(Math.random() * 12);
      for (let i = 0; i < length; i++)
        value += alphabet[Math.floor(Math.random() * alphabet.length)];
      const path = safeReturnPath(value);
      expect(path === '/' || path === value).toBe(true);
      expect(path.startsWith('/')).toBe(true);
      expect(/^\/[/\\]/.test(path)).toBe(false);
      expect(printable(path)).toBe(true);
    }
  });
});

describe('the identity provider settings', () => {
  const base = {
    NODE_ENV: 'test',
    OPENDUET_PUBLIC_URL: 'https://openduet.example.test',
    OPENDUET_OIDC_ISSUER: 'https://id.example.test',
    OPENDUET_OIDC_CLIENT_ID: 'client',
    OPENDUET_OIDC_CLIENT_SECRET: 'secret',
  };

  test('email linking defaults to any account, and takes no-password', () => {
    expect(loadEnv(base).OPENDUET_OIDC_EMAIL_LINK).toBe('any');
    expect(
      loadEnv({ ...base, OPENDUET_OIDC_EMAIL_LINK: 'no-password' }).OPENDUET_OIDC_EMAIL_LINK,
    ).toBe('no-password');
    expect(() => loadEnv({ ...base, OPENDUET_OIDC_EMAIL_LINK: 'never' })).toThrow();
  });

  test('password sign-in off needs a provider', () => {
    expect(loadEnv({ ...base, OPENDUET_PASSWORD_SIGNIN: 'off' }).OPENDUET_PASSWORD_SIGNIN).toBe(
      false,
    );
    expect(() => loadEnv({ NODE_ENV: 'test', OPENDUET_PASSWORD_SIGNIN: 'off' })).toThrow();
  });
});
