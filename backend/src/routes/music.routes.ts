import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as c from '../controllers/music.controller';

const r = Router();
r.post('/shares', requireAuth, c.create);
r.post('/shares/claim', requireAuth, c.claim);
r.get('/storage-status', requireAuth, c.storageStatus);
r.get('/tracks', requireAuth, c.library);
r.post('/tracks', requireAuth, c.createTrack);
r.post('/tracks/:id/upload', requireAuth, c.uploadTrack);
r.get('/tracks/:id/download', requireAuth, c.downloadTrack);
r.get('/tracks/:id/stream', requireAuth, c.streamTrack);
r.patch('/tracks/:id', requireAuth, c.updateTrack);
r.delete('/tracks/:id', requireAuth, c.deleteTrack);
r.post('/shares/:id/upload', requireAuth, c.upload);
r.post('/shares/:id/finalize', requireAuth, c.finalize);
export default r;
