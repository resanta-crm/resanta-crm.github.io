/**
 * AI360 multi-role authorization kernel (stage-only, no network or DB writes).
 * Inputs MUST come from an authenticated Supabase JWT + server-resolved users
 * profile and trusted branch membership; never from request body or LLM output.
 */
const validRoles = new Set(['boss', 'manager']);
const readDomains = new Set([
  'sales','clients','visits','routes','tasks','debt','promotions','vip','triovist','payments'
]);
const branchDomains = new Set(['sales','clients','visits','routes','tasks','debt','promotions','vip']);
const managerDomains = new Set(['sales','clients','visits','routes','tasks','debt','promotions']);
const deny = reason => ({allowed:false,reason});

export function deriveVoicePrincipal({authUserId, profile, networkDirectorId, trustedBranchId, trustedManagerId, trustedTriovistAccess=false}={}) {
  const uid=String(authUserId||'').trim();
  if(!uid||!profile||String(profile.id||'')!==uid||!validRoles.has(profile.role))
    return deny('identity_not_verified');
  if(profile.role==='boss' && uid===networkDirectorId)
    return {allowed:true,role:'network_director',subject:uid,scope:{kind:'network'}};
  if(profile.role==='boss' && trustedBranchId)
    return {allowed:true,role:'branch_director',subject:uid,
      scope:{kind:'branch',branch_id:String(trustedBranchId)}};
  if(profile.role==='manager' && profile.access_scope==='triovist'){
    if(trustedTriovistAccess!==true)return deny('triovist_membership_not_verified');
    return {allowed:true,role:'triovist_manager',subject:uid,scope:{kind:'triovist'}};
  }
  if(profile.role==='manager' && trustedManagerId)
    return {allowed:true,role:'field_manager',subject:uid,
      scope:{kind:'manager',manager_id:String(trustedManagerId)}};
  return deny('trusted_scope_not_configured');
}

export function authorizeVoiceRequest(principal, {domain,operation='read',targetScope=null}={}) {
  if(principal?.allowed!==true)return deny('not_authorized');
  if(!readDomains.has(domain))return deny('domain_not_registered');
  // A conversational agreement never itself authorizes a real CRM mutation.
  // Approvals will use a separate signed, item-bound, auditable transaction.
  if(!['read','analyze','prepare'].includes(operation))return deny('mutation_requires_independent_approval');
  if(domain==='payments' && operation==='prepare' && principal.role!=='network_director')
    return deny('payment_prepare_forbidden');
  if(principal.role==='network_director')return {allowed:true,scope:principal.scope};
  if(principal.role==='branch_director'){
    if(domain==='payments')return deny('payment_access_needs_separate_rpc_permission');
    if(!branchDomains.has(domain))return deny('domain_outside_branch_access');
    if(targetScope && (targetScope.kind!=='branch'||targetScope.branch_id!==principal.scope.branch_id))
      return deny('branch_scope_mismatch');
    return {allowed:true,scope:principal.scope};
  }
  if(principal.role==='field_manager'){
    if(!managerDomains.has(domain))return deny('manager_domain_forbidden');
    if(operation==='prepare'&&domain!=='tasks')return deny('manager_action_forbidden');
    if(targetScope && (targetScope.kind!=='manager'||targetScope.manager_id!==principal.scope.manager_id))
      return deny('manager_scope_mismatch');
    return {allowed:true,scope:principal.scope};
  }
  if(principal.role==='triovist_manager'){
    if(!['triovist','tasks'].includes(domain))return deny('triovist_domain_forbidden');
    if(operation==='prepare'&&domain!=='tasks')return deny('triovist_action_forbidden');
    if(targetScope && targetScope.kind!=='triovist')return deny('triovist_scope_mismatch');
    return {allowed:true,scope:principal.scope};
  }
  return deny('role_unknown');
}

export function sessionMemoryKey(principal, sessionId) {
  if(principal?.allowed!==true||!principal.subject||!/^[a-zA-Z0-9_-]{16,100}$/.test(String(sessionId||'')))
    return null;
  return principal.subject+':'+sessionId;
}
