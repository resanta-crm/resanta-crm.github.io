// In-memory PostgREST fixture with atomic compare-and-set and both uniqueness
// rules. It deliberately has no authorization bypass in production code.
export function draftStore(){
 const rows=new Map(),calls=[];
 const clone=value=>value==null?value:structuredClone(value);
 const key=row=>row.route_id+'|'+row.client_id;
 const conflict=(row,ignore)=>[...rows.entries()].some(([id,value])=>id!==ignore&&value.kind==='work'&&row.kind==='work'&&value.legal_key===row.legal_key&&value.week_start===row.week_start);
 return {rows,calls,from(table){
  if(table!=='crm_task_route_drafts_v1')throw Error('unexpected service table '+table);
  const filters=[];let patch=null;
  const q={
   select(){return q},eq(column,value){filters.push([column,value]);return q},
   update(value){patch=value;return q},
   async insert(row){calls.push({action:'insert',row:clone(row)});if(rows.has(key(row))||conflict(row))return {error:{code:'23505'}};rows.set(key(row),clone(row));return {error:null};},
   async maybeSingle(){
    const entry=[...rows.entries()].find(([,row])=>filters.every(([column,value])=>row[column]===value));
    calls.push({action:patch?'update':'read',filters:clone(filters)});
    if(!entry)return {data:null,error:null};
    if(patch){const next={...entry[1],...clone(patch)};if(conflict(next,entry[0]))return {error:{code:'23505'}};rows.set(entry[0],next);return {data:clone(next),error:null};}
    return {data:clone(entry[1]),error:null};
   }
  };return q;
 }};
}

export function fixtureScope(route,client){
 const day=new Date(route.visit_date+'T12:00:00Z'),weekday=day.getUTCDay()||7;day.setUTCDate(day.getUTCDate()-weekday+1);
 return {kind:client.client_status==='Рабочий'?'work':'potential',legal_key:'client:'+client.id,week_start:day.toISOString().slice(0,10),route_day:route.visit_date,manager_name:route.manager_name};
}
