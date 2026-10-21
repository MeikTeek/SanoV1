import type { SanoAgendaDeps } from '../sano/types';
import * as agenda from './service';

/** A agenda real (Prisma) no formato que o núcleo do Sano espera. Usada pelo chat e pelo bot. */
export const agendaDeps: SanoAgendaDeps = {
  list: (userId, from, to) => agenda.listAppointments(userId, from, to),
  create: (userId, data) => agenda.createAppointment(userId, data),
  findByTitle: (userId, term) => agenda.findByTitle(userId, term),
  cancel: async (userId, id) => { await agenda.updateAppointment(userId, id, { status: 'CANCELED' }); },
  update: (userId, id, data) => agenda.updateAppointment(userId, id, data),
  listByDay: (userId, from, to) => agenda.listByDay(userId, from, to),
  cancelDay: async (userId, from, to) => (await agenda.cancelDay(userId, from, to)).count,
  next: (userId, limit) => agenda.nextAppointments(userId, limit),
  get: (userId, id) => agenda.getAppointment(userId, id),
  remove: async (userId, id) => { await agenda.deleteAppointment(userId, id); },
  cancelSeries: async (userId, seriesId, from) => (await agenda.cancelSeries(userId, seriesId, from)).count,
  restoreSeries: async (userId, seriesId, from) => (await agenda.restoreSeries(userId, seriesId, from)).count,
  deleteSeries: async (userId, seriesId) => (await agenda.deleteSeries(userId, seriesId)).count,
};
