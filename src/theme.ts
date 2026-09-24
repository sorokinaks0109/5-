// Цвета и значки вершин. У каждой вершины свой яркий цвет.
export interface StageTheme {
  color: string;
  soft: string;
  icon: string;
  term: string;
}

export const STAGE_THEME: StageTheme[] = [
  { color: '#f43f5e', soft: '#ffe4e6', icon: '🔍', term: '8 видов потерь' },
  { color: '#10b981', soft: '#d1fae5', icon: '🧹', term: 'Система 5С' },
  { color: '#0ea5e9', soft: '#e0f2fe', icon: '🌊', term: 'Поток создания ценности' },
  { color: '#8b5cf6', soft: '#ede9fe', icon: '❓', term: 'Решение проблем и регулярный менеджмент' },
  { color: '#f59e0b', soft: '#fef3c7', icon: '💡', term: 'Предложение по улучшению' },
];

/** Фон этапа темнеет с погодой: ясно → буран */
export const WEATHER_BG = ['#e0f7ff', '#dbe7fb', '#c7d2e6', '#9aa8c2', '#6b7896'];
