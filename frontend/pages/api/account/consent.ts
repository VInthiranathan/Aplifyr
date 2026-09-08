import type { NextApiRequest, NextApiResponse } from 'next';
import { serverSupabase } from '../../../lib/serverSupabase';
import { isSafeMutation } from '../../../lib/apiSecurity';
function respond(res: NextApiResponse, status: number, body: unknown): void { res.status(status).json(body); }
export const config = { api: { bodyParser: { sizeLimit: '2kb' } } };
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control','private, no-store');
  if (!['GET','PUT'].includes(req.method ?? '')) { res.setHeader('Allow','GET, PUT'); return respond(res,405, {error:'Method not allowed'}); }
  if (req.method === 'PUT' && !isSafeMutation(req)) return respond(res,403, {error:'Forbidden'});
  try {
    const client = serverSupabase(req,res);
    const {data:{user},error} = await client.auth.getUser();
    if(error || !user) return respond(res,401, {error:'Not authenticated'});
    if(req.method === 'PUT') {
      const body=req.body;
      if(!body || !['gemini','groq'].includes(body.provider) || typeof body.granted!=='boolean' || typeof body.version!=='string' || body.version.length>100) return respond(res,400, {error:'Invalid consent'});
      const {error:writeError}=await client.rpc('set_ai_consent',{p_provider:body.provider,p_version:body.version,p_granted:body.granted});
      if(writeError) return respond(res,409, {error:'Consent could not be saved; reload'});
    }
    const [notices,consents]=await Promise.all([
      client.from('ai_privacy_notices').select('provider,version,notice_sv,notice_en,enabled'),
      client.from('ai_consents').select('provider,notice_version,granted,granted_at,withdrawn_at,changed_at').eq('user_id',user.id),
    ]);
    if(notices.error || consents.error) throw new Error('Unavailable');
    return respond(res,200, {notices:notices.data,consents:consents.data});
  } catch { return respond(res,503, {error:'Consent service unavailable'}); }
}
