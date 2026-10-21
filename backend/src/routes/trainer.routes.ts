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
r.get('/overview', c.overview);
r.get('/workout/:weekday', c.workoutDay);
r.post('/sessions', c.logSession);
r.delete('/sessions/:id', c.deleteSession);
r.get('/swap-options', c.swapOptions);
r.put('/swaps', c.swapExercise);
r.get('/exercises/:key/stats', c.exerciseStats);
r.get('/library', c.library);
r.get('/report', c.report);
r.get('/diet', c.diet);
r.get('/review', c.review);
r.get('/exercises/:key', c.exerciseDetail);
r.post('/ask', commandLimiter, c.ask);

export default r;