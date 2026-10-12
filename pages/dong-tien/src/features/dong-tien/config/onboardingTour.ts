import type { Placement } from 'react-joyride';

/**
 * onboardingTour.ts — Cấu hình Onboarding tour dùng chung cho các trang học.
 *
 * Text chung tập trung ở đây; tên khóa học, nội dung danh sách bài và nhóm Zalo
 * nằm trong cấu hình khóa học (src/lib/courses.ts).
 */

export const TOUR_TEXT = {
  welcome: {
    emoji: '🗺️',
    content: 'Bạn dành khoảng 20 giây xem qua cách sử dụng nhé, để việc học sau này thuận tiện hơn.',
    defer: 'Để sau',
    start: 'Xem qua một chút',
  },
  step1: {
    emoji: '💡',
    title: 'Danh sách bài học',
  },
  step2: {
    emoji: '📍',
    title: 'Bài bạn đang học',
    content:
      'Bài đang xem sẽ được làm nổi ở đây. Học xong một bài, chỗ này tự chuyển sang bài kế tiếp cho bạn.',
  },
  finish: {
    cta: 'Tôi đã sẵn sàng',
    zaloContent:
      'Tham gia nhóm ngay để được hỗ trợ, tư vấn và giáp đáp các thắc mắc về chương trình',
    zaloCta: 'Tham gia nhóm ZALO',
  },
  common: {
    skip: 'Bỏ qua',
    prev: 'Quay lại',
    next: 'Tiếp',
    startLesson: 'Bắt đầu học',
    close: 'Đóng hướng dẫn',
  },
} as const;

export const SIDEBAR_STEP_IDS = ['sidebar-list', 'current-lesson'] as const;

export interface OnboardingTourStep {
  id: string;
  target: string;
  placement: Placement | 'center';
  skipBeacon: boolean;
  hideOverlay?: boolean;
  spotlightRadius?: number;
  isFixed?: boolean;
  data?: { requiresSidebar: boolean };
}

/**
 * 4 màn: 1 chào + 2 bước có highlight + 1 kết thúc.
 * - welcome & finish: popup giữa màn hình, không mũi tên (placement 'center'),
 *   có overlay tối phủ toàn màn hình (click ngoài đóng tour).
 * - 2 bước giữa: neo vào sidebar / bài đang học, mũi tên định vị.
 * - data.requiresSidebar: mở sidebar (mobile) trước khi highlight.
 */

/**
 * Chọn placement theo viewport.
 * Desktop: sidebar là cột bên phải → 'left' (tooltip nằm bên trái sidebar).
 * Mobile: sidebar nằm bên dưới main content → dùng 'bottom' hoặc 'top' cho các bước sidebar.
 */
export function resolveStepPlacement(step: OnboardingTourStep, isMobile: boolean): OnboardingTourStep['placement'] {
  if (!isMobile) return step.placement;
  if (step.data?.requiresSidebar) return 'bottom';
  return step.placement;
}

/**
 * Chọn target theo viewport.
 * Cả desktop và mobile đều dùng cùng target (vì sidebar nằm trực tiếp trên trang).
 */
export function resolveStepTarget(step: OnboardingTourStep, isMobile: boolean): string {
  return step.target;
}
export const TOUR_STEPS: OnboardingTourStep[] = [
  {
    id: 'welcome',
    target: 'body',
    placement: 'center',
    skipBeacon: true,
    hideOverlay: false,
  },
  {
    id: 'sidebar-list',
    target: '#tour-sidebar',
    placement: 'left',
    skipBeacon: true,
    spotlightRadius: 12,
    isFixed: true,
    data: { requiresSidebar: true },
  },
  {
    id: 'current-lesson',
    target: '[data-tour-active-lesson]',
    placement: 'left',
    skipBeacon: true,
    spotlightRadius: 12,
    isFixed: true,
    data: { requiresSidebar: true },
  },
  {
    id: 'finish',
    target: 'body',
    placement: 'center',
    skipBeacon: true,
    hideOverlay: false,
  },
];