import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261112100500_access360_invite_readonly_role_v1.sql');
const edge=read('supabase/functions/crm-access-admin-v1/index.ts');
const old=read('supabase/functions/crm-user-admin/index.ts');
const core=read('assets/01-crm-core.js');
const admin=read('assets/301-access360-admin-v1.js');
const viewer=read('assets/302-company-viewer-v1.js');
const index=read('index.html');
test('unapproved signup has no default manager and requires server-staged invite',()=>{
 assert.match(sql,/crm_access_require_invitation_v1/);
 assert.match(sql,/before insert on auth.users/);
 assert.match(sql,/CRM_INVITATION_REQUIRED/);
 assert.match(sql,/values\(new.id,lower\(btrim\(new.email\)\),i.display_name,'pending'/i);
 assert.doesNotMatch(sql,/values\s*\(new\.id,\s*new\.email,\s*new\.email,\s*'manager'/i);
 assert.match(sql,/crm_is_active_user_v1/);
});
test('executive blocked from writes and direct reads on legacy tables and storage',()=>{
 assert.match(sql,/crm_access_write_guard_trigger_v1/);
 assert.match(sql,/before insert or update or delete/);
 assert.match(sql,/crm_access_legacy_read_v1/);
 assert.match(sql,/crm_access_viewer_read_restrict_v1/);
 assert.match(sql,/storage/);
 assert.match(sql,/executive_viewer/);
 assert.match(sql,/users_executive_self_select_v1/);
});
test('admin identity cannot be forged via email or metadata',()=>{
 assert.match(edge,/actor\(req,admin\)/);
 assert.match(edge,/OWNER_ID/);
 assert.match(edge,/u\.id!==OWNER_ID/);
 assert.match(edge,/admin\.auth\.getUser\(bearer\)/);
 assert.match(edge,/auth\.admin\.inviteUserByEmail/);
 assert.match(edge,/status:"prepared"/);
 assert.match(edge,/\.eq\("role","pending"\)/);
 assert.match(old,/caller\.id !== "544fb1e2-ef70-44de-bc62-e0e1596a4bfc"/);
 assert.doesNotMatch(edge,/getUser\(body\.token\)|body\.user_id/);
});
test('company leadership is a separate read-only shell with only dedicated RPC',()=>{
 assert.match(core,/profile\.role\|\|''\)\.toLowerCase\(\)==='executive_viewer'/);
 assert.match(core,/window\.crmCompanyViewer360\.start/);
 assert.match(core,/p!=='company-viewer'/);
 assert.match(viewer,/crm_company_viewer_summary_v1/);
 assert.doesNotMatch(viewer,/\.from\(["']users["']\)\.update|\.from\(["']purchase_history["']\)/);
 assert.match(index,/302-company-viewer-v1\.js/);
 assert.match(index,/301-access360-admin-v1\.js/);
 assert.match(admin,/crm-access-admin-v1/);
});
test('staff retains prior profile and owner can audit, invite and disable without boss escalation',()=>{
 assert.match(sql,/crm_access_audit_v1/);
 assert.match(sql,/crm_access_invites_v1/);
 assert.match(edge,/action==="disable"/);
 assert.match(edge,/action==="update"/);
 assert.match(edge,/action==="invite"/);
 assert.doesNotMatch(edge,/ROLES=new Set\(\[[^\]]*"boss"/);
 assert.match(admin,/petrovichev@resanta\.ru/);
});
