export interface Lesson {
  n: number;
  t: string;
}

export interface Chapter {
  label: string;
  title: string;
  intro: string;
  playerNote: string;
  lessons: Lesson[];
}

export const CHAPTERS: Chapter[] = [
  {
    label: "Chương 1 · 3 bài · Xem ngay, không cần đăng ký",
    title: "Cách vận hành của thị trường",
    intro: "Bức tranh nền: Thị trường vận hành thế nào, và vì sao tiền để yên thì mất giá?",
    playerNote: "Chương 1 · 3 bài · Xem ngay",
    lessons: [
      // { n: 0, t: "Phạm Thành Biên là ai?" },
      { n: 1, t: "Lý do tiền của bạn ngày càng mất giá" },
      { n: 2, t: "Hiểu rõ cấu trúc thị trường tài chính" },
      { n: 3, t: "Ba yếu tố để thành công trên thị trường" },
    ],
  },
  {
    label: "Chương 2 · 5 bài · Mở khóa toàn bộ · Xem tự do",
    title: "Nền tảng tài chính cá nhân",
    intro: "Kiếm được tiền là một chuyện. Giữ và phân bổ đúng chỗ mới tạo ra tài sản.",
    playerNote: "Chương 2 · 5 bài · Xem tự do",
    lessons: [
      { n: 4, t: "Hãy tự hỏi bản thân: Tôi là ai?" },
      { n: 5, t: "Công thức tích luỹ vốn" },
      { n: 6, t: "Đa nguồn thu nhập" },
      { n: 7, t: "Dòng chảy 3 bể tạo dòng tiền bền vững" },
      { n: 8, t: "Quan điểm đúng trong đầu tư" },
    ],
  },
  {
    label: "Chương 3 · 3 bài · Mở khóa toàn bộ · Xem tự do",
    title: "Phương pháp thực chiến",
    intro: "Không cảm tính, không nghe phím: Xác định điểm vào điểm ra dựa vào vùng hội tụ kỹ thuật.",
    playerNote: "Chương 3 · 3 bài · Xem tự do",
    lessons: [
      { n: 9, t: "Vùng hội tụ kỹ thuật là gì?" },
      { n: 10, t: "Xác định điểm vào, cắt lỗ và chốt lời" },
      { n: 11, t: "Bắt đầu bằng mục tiêu tài chính" },
    ],
  },
  {
    label: "Chương 4 · 3 bài · Mở khóa toàn bộ · Xem tự do",
    title: "Chiến lược và phân bổ vốn",
    intro: "Chương ít người xem nhất, nhưng quyết định bạn còn ở lại thị trường sau 5 năm.",
    playerNote: "Chương 4 · 3 bài · Xem tự do",
    lessons: [
      { n: 12, t: "Các điều kiện của chiến lược hoàn chỉnh" },
      { n: 13, t: "Hai mô hình Triệu Đô" },
      { n: 14, t: "Cách phân bổ vốn và danh mục đầu tư" },
    ],
  },
];

export const CONFIG = {
  showStickyCta: true,
  unlockAll: true,
  openChapter: 0,
};

/** Video giới thiệu ở Hero — fix cứng ID Vimeo (folder dùng chung với thinh-vuong). */
export const HERO_VIMEO_VIDEO_ID = "1215059283";
