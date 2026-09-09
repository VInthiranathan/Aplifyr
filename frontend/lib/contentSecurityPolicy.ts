export function contentSecurityPolicy(nonce:string, production:boolean, supabase?:string, backend?:string) {
 const origins=[supabase,backend].flatMap(value=>{try{const u=new URL(value??'');return ['https:','http:'].includes(u.protocol)?[u.origin]:[];}catch{return [];}});
 return ["default-src 'self'",`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${production?'':" 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:","font-src 'self'",
  `connect-src 'self' ${origins.join(' ')}${production?'':' ws: wss:'}`,
  "object-src 'none'","base-uri 'none'","frame-ancestors 'none'","form-action 'self'","frame-src 'none'"].join('; ');
}
