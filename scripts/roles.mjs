// Who may change what. The team and their roles live in team/roles.json; this decides,
// for each list change form, whether the person who sent it (or who added the "approved"
// label) may make that change. Everyone else's request waits for someone who may.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseForm } from './apply-request.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Everyday changes Support may make. Anything not listed here (tokens, emergency switches,
// asking users to update) is for admins only.
export const SUPPORT_ACTIONS = [
  'Add a dApp',
  'Remove a dApp',
  'Block a scam',
  'Unblock something',
  'Add a banner',
  'Switch a banner on or off',
  'Remove a banner',
  'Send a message',
  'Switch a message',
];

export function readRoles(file = path.join(ROOT, 'team/roles.json')) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const names = (list) => (Array.isArray(list) ? list.map((n) => String(n).toLowerCase()) : []);
  return { admin: names(raw.admin), support: names(raw.support), view: names(raw.view) };
}

export function roleOf(roles, login, owner) {
  const who = String(login ?? '').toLowerCase();
  if (!who) return 'none';
  if (who === String(owner ?? '').toLowerCase() || roles.admin.includes(who)) return 'admin';
  if (roles.support.includes(who)) return 'support';
  if (roles.view.includes(who)) return 'view';
  return 'none';
}

export function mayDo(role, action) {
  return role === 'admin' || (role === 'support' && SUPPORT_ACTIONS.includes(action));
}

// Decides one issue event: { allowed, message }. On "opened" the sender is the author; on
// "labeled" it is whoever added the label, so a Support member cannot approve an admin change.
export function decide(event, roles) {
  const action = parseForm(event.issue.body).Action;
  const owner = event.repository?.owner?.login;
  const by = event.sender?.login;
  const role = roleOf(roles, by, owner);
  if (mayDo(role, action)) return { allowed: true, message: '' };
  const adminOnly = !SUPPORT_ACTIONS.includes(action);
  const who = adminOnly ? 'an admin' : 'an admin or someone from Support';
  if (event.action === 'labeled') {
    return { allowed: false, message: `Only ${who} can approve "${action}". @${by}'s approval was not used; the request is still waiting.` };
  }
  return {
    allowed: false,
    message: role === 'none'
      ? `Thanks for the request. The Knight Wallet team will check it. Once ${who} adds the **approved** label, the change is made automatically.`
      : `"${action}" needs ${who}. Your role is ${role}, so this waits until ${who} adds the **approved** label.`,
  };
}

// In the workflow: node scripts/roles.mjs <event.json> <out dir>. Prints allowed=true|false
// for $GITHUB_OUTPUT and writes the reply to <out dir>/wait.md.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [eventPath, outDir] = process.argv.slice(2);
  const { allowed, message } = decide(JSON.parse(fs.readFileSync(eventPath, 'utf8')), readRoles());
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'wait.md'), message);
  console.log(`allowed=${allowed}`);
}
