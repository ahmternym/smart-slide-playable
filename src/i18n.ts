const EN = {
  swipe: 'Swipe the block to its goal',
  order: 'Order matters — think first!',
  moves: 'Moves',
  great: 'Great!',
  perfect: 'Perfect!',
  outOfMoves: 'Out of moves!',
  tagline1: 'Think first.',
  tagline2: 'Then slide.',
  features: '640 levels · Daily challenge',
  install: 'PLAY FREE',
  tryAgain: 'Can you solve it?'
};

type Dict = typeof EN;

const TR: Dict = {
  swipe: 'Bloğu hedefine kaydır',
  order: 'Sıra önemli — önce düşün!',
  moves: 'Hamle',
  great: 'Harika!',
  perfect: 'Mükemmel!',
  outOfMoves: 'Hamle bitti!',
  tagline1: 'Önce düşün.',
  tagline2: 'Sonra kaydır.',
  features: '640 seviye · Günlük bulmaca',
  install: 'ÜCRETSİZ OYNA',
  tryAgain: 'Sen çözebilir misin?'
};

const lang = (navigator.language || 'en').toLowerCase();
export const T: Dict = lang.startsWith('tr') ? TR : EN;
export const APP_NAME = lang.startsWith('tr') ? 'Adım Akıllı' : 'Smart Slide';
