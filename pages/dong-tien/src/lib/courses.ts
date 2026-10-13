// Course funnels served by this app. The ID is the URL prefix, the CRM page_id and the
// course key in src/learningCourses.js of the root project; next.config.ts repeats the list.
export const COURSE_IDS = ['dong-tien', 'trading'] as const;
export type CourseId = (typeof COURSE_IDS)[number];
export const DEFAULT_COURSE: CourseId = 'dong-tien';

// Public origin for share previews (og:url, og:image must be absolute for Zalo, Messenger...).
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://event.phamthanhbien.com').replace(/\/$/, '');

export const isCourseId = (value: unknown): value is CourseId =>
  COURSE_IDS.includes(value as CourseId);

export interface CourseConfig {
  id: CourseId;
  title: string;
  subtitle: string;
  zalo: {
    url: string;
    groupName: string;
    /** Omitted when the group has no QR image yet; the join button remains. */
    qrImage?: string;
  };
  tour: {
    welcomeTitle: string;
    lessonListContent: string;
  };
}

export const COURSES: Record<CourseId, CourseConfig> = {
  'dong-tien': {
    id: 'dong-tien',
    title: 'Phương pháp xây dựng dòng tiền',
    subtitle: 'Khóa học đặc biệt',
    zalo: {
      url: 'https://zalo.me/g/ywlftlnlb9foymqltydk',
      groupName: 'PHƯƠNG PHÁP XÂY DỰNG DÒNG TIỀN',
      qrImage: '/dong-tien/images/dong-tien/code-qr-dongtien.jpeg',
    },
    tour: {
      welcomeTitle: 'Chào mừng bạn đến với Phương pháp xây dựng dòng tiền',
      lessonListContent:
        'Toàn bộ lộ trình nằm ở đây, gồm 4 chương và 15 bài. Bạn đang học tới đâu và còn bao nhiêu bài nữa, nhìn vào là thấy ngay.',
    },
  },
  trading: {
    id: 'trading',
    title: 'Phương pháp Trading hiệu quả',
    subtitle: 'Quà tặng từ Phạm Thành Biên',
    zalo: {
      // Group link from the former /trading thank-you page.
      url: 'https://zalo.me/g/qytfxdjfgapmh7e4kppo?joinSrc=9',
      groupName: 'PHƯƠNG PHÁP TRADING HIỆU QUẢ',
    },
    tour: {
      welcomeTitle: 'Chào mừng bạn đến với Phương pháp Trading hiệu quả',
      lessonListContent:
        'Toàn bộ bài học nằm ở đây. Bạn đang học tới đâu và còn bao nhiêu bài nữa, nhìn vào là thấy ngay.',
    },
  },
};

export function courseFromPath(path: string | undefined | null): CourseId {
  const segment = String(path || '').split(/[/?#]/)[1];
  return isCourseId(segment) ? segment : DEFAULT_COURSE;
}
