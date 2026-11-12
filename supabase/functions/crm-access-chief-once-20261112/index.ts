// One-time corporate leadership invitation completed on 2026-11-12.
// Endpoint permanently disabled after verified use. Do not re-enable.
Deno.serve((_req: Request) => new Response(JSON.stringify({ok:false,error:'ONE_TIME_OPERATION_CLOSED'}),{status:410,headers:{'content-type':'application/json'}}));
