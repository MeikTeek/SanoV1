import { api } from './api';

/** Perfil exibido: nome de exibição, avatar e regra da troca de nome. */
export interface Profile {
  id: string;
  username: string;
  displayName: string | null;
  avatarDataUrl: string | null;
  role: string;
  canChangeName: boolean;
  nameChangeAvailableInDays: number;
  nameChangedAt: string | null;
  showOnlineStatus: boolean;
  showActivityStatus: boolean;
}

export const getProfile = () => api.get<{ profile: Profile }>('/profile').then((r) => r.profile);

/**
 * Envia a foto como data URL. O cliente reduz a imagem antes (canvas) para não
 * estourar o limite do servidor.
 */
export const setAvatar = (dataUrl: string) =>
  api.put<{ profile: Profile }>('/profile/avatar', { dataUrl }).then((r) => r.profile);

export const removeAvatar = () =>
  api.delete<{ profile: Profile }>('/profile/avatar').then((r) => r.profile);

export const setDisplayName = (displayName: string) =>
  api.put<{ profile: Profile }>('/profile/display-name', { displayName }).then((r) => r.profile);

export const setPrivacy = (preferences: Pick<Profile, 'showOnlineStatus' | 'showActivityStatus'>) =>
  api.put<{ profile: Profile }>('/profile/privacy', preferences).then((r) => r.profile);

/**
 * Lê um arquivo de imagem e devolve um data URL reduzido.
 *
 * Redimensiona no navegador para no máximo 512 px: uma foto de celular tem
 * vários MB e seria rejeitada pelo limite de 400 KB do servidor.
 */
export function fileToScaledDataUrl(file: File, maxEdge = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não consegui ler a imagem'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') return reject(new Error('Arquivo de imagem inválido'));
      const img = new Image();
      img.onerror = () => reject(new Error('Arquivo de imagem inválido'));
      img.onload = () => {
        const maxDataUrlLength = Math.floor((512 * 1024 * 4) / 3);
        let edge = maxEdge;

        while (edge >= 128) {
          const scale = Math.min(1, edge / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('Canvas indisponível neste navegador'));
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          for (let quality = 0.82; quality >= 0.5; quality -= 0.08) {
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            if (dataUrl.length <= maxDataUrlLength) return resolve(dataUrl);
          }
          edge = Math.floor(edge * 0.8);
        }
        reject(new Error('A imagem não pôde ser reduzida o suficiente; escolha outra foto.'));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}