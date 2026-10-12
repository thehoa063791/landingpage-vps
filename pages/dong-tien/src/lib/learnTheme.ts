import { getActiveBrand, type AcademicBrand } from './brand';
import { COURSES } from './courses';

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

// Both courses share the amber learning palette; titles come from the course config.
const AMBER = {
  showTour: true,
  accent: '#F59E0B',
  accentHover: '#D97706',
  accentSoft: '#FFFBEB',
  accentText: '#B45309',
  gradientFrom: '#F59E0B',
  gradientTo: '#D97706',
};

export function getLearnTheme(brand: AcademicBrand = getActiveBrand()): LearnTheme {
  const course = COURSES[brand] || COURSES['dong-tien'];
  return { brand: course.id, courseTitle: course.title, courseSubtitle: course.subtitle, ...AMBER };
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
