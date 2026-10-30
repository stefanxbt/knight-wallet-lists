import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decide, mayDo, readRoles, roleOf } from './roles.mjs';

const roles = { admin: ['ana'], support: ['sam'], view: ['vic'] };
const event = (action, by, kind = 'opened') => ({
  action: kind,
  issue: { body: `### Action\n\n${action}\n\n### Name\n\nX` },
  repository: { owner: { login: 'Owner' } },
  sender: { login: by },
});

describe('roles', () => {
  it('knows each role, the owner is always admin', () => {
    assert.equal(roleOf(roles, 'owner', 'Owner'), 'admin');
    assert.equal(roleOf(roles, 'ANA', 'Owner'), 'admin');
    assert.equal(roleOf(roles, 'sam', 'Owner'), 'support');
    assert.equal(roleOf(roles, 'vic', 'Owner'), 'view');
    assert.equal(roleOf(roles, 'eve', 'Owner'), 'none');
    assert.equal(roleOf(roles, '', 'Owner'), 'none');
  });

  it('support does everyday changes, not critical ones', () => {
    assert.ok(mayDo('support', 'Add a banner'));
    assert.ok(mayDo('support', 'Block a scam'));
    assert.ok(!mayDo('support', 'Emergency switch'));
    assert.ok(!mayDo('support', 'Add a token'));
    assert.ok(!mayDo('view', 'Add a banner'));
    assert.ok(mayDo('admin', 'Emergency switch'));
  });

  it('applies or waits per sender', () => {
    assert.equal(decide(event('Add a banner', 'sam'), roles).allowed, true);
    assert.equal(decide(event('Emergency switch', 'sam'), roles).allowed, false);
    assert.match(decide(event('Emergency switch', 'sam'), roles).message, /needs an admin/);
    assert.match(decide(event('Block a scam', 'eve'), roles).message, /Thanks for the request/);
    assert.equal(decide(event('Add a banner', 'vic'), roles).allowed, false);
  });

  it('an approval only counts from someone allowed', () => {
    assert.equal(decide(event('Block a scam', 'sam', 'labeled'), roles).allowed, true);
    assert.equal(decide(event('Ask users to update', 'sam', 'labeled'), roles).allowed, false);
    assert.equal(decide(event('Ask users to update', 'ana', 'labeled'), roles).allowed, true);
  });

  it('reads the real team file', () => {
    assert.ok(readRoles().admin.includes('stefanxbt'));
  });
});
