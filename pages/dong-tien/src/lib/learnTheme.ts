import type { AcademicBrand } from './brand';

export interface LearnTheme {
  brand: AcademicBrand;
  courseTitle: string;
  courseSubtitle: string;
  showTour: boolean;
  accent: string;
  accentHover: string;
  accentSoft: string;
  accentText: string;
  gradientFrom: string;
  gradientTo: string;
}

export const LEARN_THEMES: Record<AcademicBrand, LearnTheme> = {
  'dong-tien': {
    brand: 'dong-tien',
    courseTitle: 'Phương pháp xây dựng dòng tiền',
    courseSubtitle: 'Khóa học đặc biệt',
    showTour: true,
    accent: '#F59E0B',
    accentHover: '#D97706',
    accentSoft: '#FFFBEB',
    accentText: '#B45309',
    gradientFrom: '#F59E0B',
    gradientTo: '#D97706',
  },
  'thinh-vuong': {
    brand: 'thinh-vuong',
    courseTitle: 'Phương pháp xây dựng dòng tiền',
    courseSubtitle: 'Khóa học đặc biệt',
    showTour: true,
    accent: '#F59E0B',
    accentHover: '#D97706',
    accentSoft: '#FFFBEB',
    accentText: '#B45309',
    gradientFrom: '#F59E0B',
    gradientTo: '#D97706',
  },
};

export function getLearnTheme(brand: AcademicBrand = 'dong-tien'): LearnTheme {
  return LEARN_THEMES[brand] || LEARN_THEMES['dong-tien'];
}

export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  const num = parseInt(full, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
