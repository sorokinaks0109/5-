// Цвета и значки вершин. У каждой вершины свой яркий цвет.
export interface StageTheme {
  color: string;
  soft: string;
  icon: string;
  term: string;
}

export const STAGE_THEME: StageTheme[] = [
  { color: '#f43f5e', soft: '#ffe4e6', icon: '🔍', term: '8 видов потерь' },
  { color: '#10b981', soft: '#d1fae5', icon: '🧹', term: 'Система 5С: склад или почта' },
  { color: '#0ea5e9', soft: '#e0f2fe', icon: '🌊', term: 'Поток создания ценности и закон Литтла' },
  { color: '#6366f1', soft: '#e0e7ff', icon: '🧭', term: '8 шагов решения проблем' },
  { color: '#8b5cf6', soft: '#ede9fe', icon: '❓', term: 'Решение проблем и регулярный менеджмент' },
  { color: '#ec4899', soft: '#fce7f3', icon: '🐟', term: 'Диаграмма Исикавы («рыбья кость»)' },
  { color: '#f59e0b', soft: '#fef3c7', icon: '💡', term: 'Предложение по улучшению' },
];

/** Фон этапа темнеет с погодой: ясно → буран */
export const WEATHER_BG = ['#e0f7ff', '#dbe7fb', '#c7d2e6', '#9aa8c2', '#6b7896'];
