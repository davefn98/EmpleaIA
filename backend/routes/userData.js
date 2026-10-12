import { Router } from 'express';
import { requireAuth } from '../lib/authMiddleware.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { ensureUserProfile } from '../services/profileService.js';
const router = Router();
router.get('/dashboard/:userId', requireAuth, asyncHandler(async (req, res) => {
  const userId=req.user.id, db=req.db;
  if (req.params.userId && req.params.userId !== userId) {
    return res.status(403).json({ error: 'Acceso no autorizado a datos de otro usuario.', code: 'FORBIDDEN' });
  }

  const profileResult = await ensureUserProfile(userId, req);
  if (!profileResult.success) {
    return res.status(profileResult.code === 'DB_ERROR' ? 500 : 400).json({ error: profileResult.error, code: profileResult.code });
  }

  const [cvs,letters,interviews]=await Promise.all([
    db.from('generated_cvs').select('*',{count:'exact',head:true}).eq('profile_id',userId),
    db.from('cover_letters').select('*',{count:'exact',head:true}).eq('profile_id',userId),
    db.from('interviews').select('id, interview_type, created_at, interview_messages(sender, evaluation)').eq('profile_id',userId).order('created_at',{ascending:false}),
  ]);
  const error=cvs.error||letters.error||interviews.error;
  if(error){console.error('[/dashboard] Error:',error.message);return res.status(400).json({error:'No se pudo cargar el resumen del usuario.',code:'DASHBOARD_QUERY_FAILED'});}
  return res.json({success:true,profile:profileResult.profile,cvCount:cvs.count||0,letterCount:letters.count||0,interviews:interviews.data||[]});
}));
router.get('/activity/:userId', requireAuth, asyncHandler(async (req,res)=>{
  const userId=req.user.id,db=req.db;
  if (req.params.userId && req.params.userId !== userId) {
    return res.status(403).json({ error: 'Acceso no autorizado a datos de otro usuario.', code: 'FORBIDDEN' });
  }
  const [cvs,letters,interviews]=await Promise.all([
    db.from('generated_cvs').select('id, created_at, document_title, cv_data, cv_style').eq('profile_id',userId),
    db.from('cover_letters').select('id, created_at, document_title, company, letter_content, job_offer_text').eq('profile_id',userId),
    db.from('interviews').select('id, created_at, completed_at, interview_type, difficulty_level, status, interview_messages(sender, message_content, evaluation, created_at)').eq('profile_id',userId),
  ]);
  const error=cvs.error||letters.error||interviews.error;
  if(error){console.error('[/activity] Error:',error.message);return res.status(400).json({error:'No se pudo cargar el historial.',code:'ACTIVITY_QUERY_FAILED'});}
  return res.json({success:true,cvs:cvs.data||[],letters:letters.data||[],interviews:interviews.data||[]});
}));
router.get('/documents/cvs/:userId',requireAuth,asyncHandler(async(req,res)=>{
  if (req.params.userId && req.params.userId !== req.user.id) {
    return res.status(403).json({ error: 'Acceso no autorizado a datos de otro usuario.', code: 'FORBIDDEN' });
  }
  const {data,error}=await req.db.from('generated_cvs').select('*').eq('profile_id',req.user.id).order('created_at',{ascending:false});
  if(error){console.error('[/documents/cvs] Error:',error.message);return res.status(400).json({error:'No se pudieron cargar los CV.',code:'CV_LIST_FAILED'});}
  return res.json({success:true,cvs:data||[]});
}));
router.get('/user-snapshot/:userId', requireAuth, asyncHandler(async (req,res)=>{
  const userId=req.user.id,db=req.db;
  if (req.params.userId && req.params.userId !== userId) {
    return res.status(403).json({ error: 'Acceso no autorizado a datos de otro usuario.', code: 'FORBIDDEN' });
  }

  const profileResult = await ensureUserProfile(userId, req);
  if (!profileResult.success) {
    return res.status(profileResult.code === 'DB_ERROR' ? 500 : 400).json({ error: profileResult.error, code: profileResult.code });
  }

  const [academic,work,cvs,letters,interviews]=await Promise.all([
    db.from('academic_background').select('*').eq('profile_id',userId).order('start_date',{ascending:false}),
    db.from('work_experience').select('*').eq('profile_id',userId).order('start_date',{ascending:false}),
    db.from('generated_cvs').select('*').eq('profile_id',userId).order('created_at',{ascending:false}),
    db.from('cover_letters').select('*').eq('profile_id',userId).order('created_at',{ascending:false}),
    db.from('interviews').select('*, interview_messages(*)').eq('profile_id',userId).order('created_at',{ascending:false}),
  ]);
  const error=academic.error||work.error||cvs.error||letters.error||interviews.error;
  if(error){console.error('[/user-snapshot] Error:',error.message);return res.status(400).json({error:'No se pudieron cargar los datos del usuario.',code:'USER_SNAPSHOT_FAILED'});}
  return res.json({success:true,profile:profileResult.profile,academic:academic.data||[],work:work.data||[],cvs:cvs.data||[],letters:letters.data||[],interviews:interviews.data||[]});
}));
router.get('/interview-summary/:interviewId',requireAuth,asyncHandler(async(req,res)=>{
  const {data,error}=await req.db.from('interviews').select('difficulty_level, gestural_summary').eq('id',req.params.interviewId).eq('profile_id',req.user.id).single();
  if(error)return res.status(404).json({error:'Resumen de entrevista no encontrado.',code:'INTERVIEW_SUMMARY_NOT_FOUND'});
  return res.json({success:true,summary:data});
}));

export default router;
