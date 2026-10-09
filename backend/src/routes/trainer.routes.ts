import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { commandLimiter } from '../middleware/security';
import * as c from '../controllers/trainer.controller';

const r = Router();

r.use(requireAuth);

r.get('/meta', c.metaHandler);
r.get('/dashboard', c.dashboard);
r.post('/onboarding', c.onboard);
r.get('/weekly-plan', c.weeklyPlan);
r.get('/data', c.data);
r.post('/assessments', c.saveAssessment);
r.post('/workout-logs', c.logWorkout);
r.post('/missions/:id/complete', c.complete);
r.get('/library', c.library);
r.get('/report', c.report);
r.get('/diet', c.diet);
r.get('/review', c.review);
r.get('/exercises/:key', c.exerciseDetail);
r.post('/ask', commandLimiter, c.ask);

export default r;