import type { Placement } from 'react-joyride';

/**
 * onboardingTour.ts — Cấu hình Onboarding tour cho trang học "Phương pháp Xây Dựng Dòng Tiền".
 *
 * Toàn bộ text (tiêu đề, nội dung, nút) tập trung ở đây để dễ chỉnh sau,
 * không hardcode trong component.
 */

export const TOUR_TEXT = {
  welcome: {
    emoji: '🗺️',
    title: 'Chào mừng bạn đến với Phương pháp xây dựng dòng tiền',
    content: 'Bạn dành khoảng 20 giây xem qua cách sử dụng nhé, để việc học sau này thuận tiện hơn.',
    defer: 'Để sau',
    start: 'Xem qua một chút',
  },
  step1: {
    emoji: '💡',
    title: 'Danh sách bài học',
    content:
      'Toàn bộ lộ trình nằm ở đây, gồm 4 chương và 15 bài. Bạn đang học tới đâu và còn bao nhiêu bài nữa, nhìn vào là thấy ngay.',
  },
  step2: {
    emoji: '📍',
    title: 'Bài bạn đang học',
    content:
      'Bài đang xem sẽ được làm nổi ở đây. Học xong một bài, chỗ này tự chuyển sang bài kế tiếp cho bạn.',
  },
  finish: {
    cta: 'Tôi đã sẵn sàng',
    zaloTitle: 'Tham gia nhóm ZALO PHƯƠNG PHÁP XÂY DỰNG DÒNG TIỀN',
    zaloContent:
      'Tham gia nhóm ngay để được hỗ trợ, tư vấn và giáp đáp các thắc mắc về chương trình',
    zaloQrImage: '/dong-tien/images/dong-tien/code-qr-dongtien.jpeg',
    zaloCta: 'Tham gia nhóm ZALO',
    zaloUrl: 'https://zalo.me/g/ywlftlnlb9foymqltydk',
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