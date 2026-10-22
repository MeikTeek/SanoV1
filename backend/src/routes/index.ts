import { Router } from 'express';
import authRoutes from './auth.routes';
import adminRoutes from './admin.routes';
import sanoRoutes from './sano.routes';
import appointmentRoutes from './appointment.routes';
import trainerRoutes from './trainer.routes';
import profileRoutes from './profile.routes';
import chatRoutes from './chat.routes';
import musicRoutes from './music.routes';
import financeRoutes from './finance.routes';
import discordRoutes from './discord.routes';
import osintRoutes from './osint.routes';

const r = Router();

r.get('/health', (_req, res) => res.json({ status: 'ok' }));
r.use('/auth', authRoutes);
r.use('/admin', adminRoutes);
r.use('/sano', sanoRoutes);
r.use('/appointments', appointmentRoutes);
r.use('/trainer', trainerRoutes);
r.use('/profile', profileRoutes);
r.use('/chat', chatRoutes);
r.use('/music', musicRoutes);
r.use('/finance', financeRoutes);
r.use('/integrations/discord', discordRoutes);
r.use('/osint', osintRoutes);

export default r;
