import React, { useEffect, useState, useRef } from 'react';
import { X, Clock } from 'lucide-react';

const NAMES = [
  'Anh Tuấn', 'Chị Hương', 'Anh Minh', 'Chị Lan', 'Anh Dũng',
  'Anh Hải', 'Chị Thảo', 'Anh Nam', 'Chị Yến', 'Anh Cường',
  'Chị Nga', 'Anh Sơn', 'Chị Trang', 'Anh Hùng', 'Chị Linh',
  'Anh Đức', 'Chị Mai', 'Anh Phong', 'Chị Hà', 'Anh Long',
  'Anh Quân', 'Chị Ngọc', 'Anh Thành', 'Chị Vy', 'Anh Khánh',
  'Chị Oanh', 'Anh Việt', 'Chị Hạnh', 'Anh Hiếu', 'Chị Ánh',
  'Anh Toàn', 'Chị Loan', 'Anh Vinh', 'Chị Diễm', 'Anh Kiên',
  'Chị Nhung', 'Anh Bình', 'Chị My', 'Anh Tài', 'Chị Hòa',
  'Anh Khoa', 'Chị Phương', 'Anh Lộc', 'Chị Bích', 'Anh Nhật',
  'Chị Kim', 'Anh Thịnh', 'Chị Duyên', 'Anh Trọng', 'Chị Ngân',
  'Anh Hoàng', 'Chị Hồng', 'Anh Tâm', 'Chị Thu', 'Anh Bảo',
  'Chị Quỳnh', 'Anh Nghĩa', 'Chị Tuyết', 'Anh Sang', 'Chị Thanh',
  'Anh Phúc', 'Chị Vân', 'Anh Hào', 'Chị Xuân', 'Anh Lâm',
  'Chị Trinh', 'Anh Cảnh', 'Chị An', 'Anh Hải Nam', 'Chị Ngọc Anh',
  'Anh Trung', 'Chị Thùy', 'Anh Đạt', 'Chị Kiều', 'Anh Duy',
  'Chị Mơ', 'Anh Vũ', 'Chị Huyền', 'Anh Huy', 'Chị Tâm',
  'Anh Công', 'Chị Yến Nhi', 'Anh Thắng', 'Chị Bảo', 'Anh Khôi',
  'Chị Cẩm', 'Anh Hải Đăng', 'Chị Nhi', 'Anh Quốc', 'Chị Giang',
  'Anh Hưng', 'Chị Ly', 'Anh Chí', 'Chị Thủy', 'Anh Đông',
  'Chị Tiên', 'Anh Tùng', 'Chị Lam', 'Anh Thiện', 'Chị Sen'
];

const PROVINCES = [
  'An Giang', 'Bắc Ninh', 'Cà Mau', 'Cao Bằng', 'Cần Thơ',
  'Đà Nẵng', 'Đắk Lắk', 'Điện Biên', 'Đồng Nai', 'Đồng Tháp',
  'Gia Lai', 'Hà Nội', 'Hà Tĩnh', 'Hải Phòng', 'Hưng Yên',
  'Huế', 'Khánh Hòa', 'Lai Châu', 'Lâm Đồng', 'Lạng Sơn',
  'Lào Cai', 'Nghệ An', 'Ninh Bình', 'Phú Thọ', 'Quảng Ngãi',
  'Quảng Ninh', 'Quảng Trị', 'Sơn La', 'Tây Ninh', 'Thái Nguyên',
  'Thanh Hóa', 'TP.HCM', 'Tuyên Quang', 'Vĩnh Long'
];

const TIMES = ['Vừa xong', '1 phút trước', '2 phút trước', '3 phút trước', '5 phút trước'];

interface PopupContent {
  name: string;
  province: string | null;
  actionText: string;
  timeAgo: string;
}

function getRandomInRange(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generatePopupContent(lastName: string | null): PopupContent {
  let name = '';
  // Avoid consecutive duplicates
  do {
    name = NAMES[Math.floor(Math.random() * NAMES.length)];
  } while (name === lastName && NAMES.length > 1);

  const province = PROVINCES[Math.floor(Math.random() * PROVINCES.length)];
  const templateIdx = Math.floor(Math.random() * 3);

  let provinceVal: string | null = null;
  let actionText = '';

  if (templateIdx === 0) {
    provinceVal = province;
    actionText = 'vừa đăng ký';
  } else if (templateIdx === 1) {
    provinceVal = null;
    actionText = 'vừa tham gia lớp';
  } else {
    provinceVal = province;
    actionText = 'vừa bắt đầu';
  }

  const timeAgo = TIMES[Math.floor(Math.random() * TIMES.length)];

  return { name, province: provinceVal, actionText, timeAgo };
}

export default function SocialProofPopup() {
  const [visible, setVisible] = useState(false);
  const [content, setContent] = useState<PopupContent | null>(null);
  const [hasClosed, setHasClosed] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastNameRef = useRef<string | null>(null);

  useEffect(() => {
    if (hasClosed) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    const isDev = typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.search.includes('test_social_proof'));

    const FIRST_MIN_DELAY = isDev ? 10000 : 300 * 1000; // 10s test / 5m prod
    const FIRST_MAX_DELAY = isDev ? 15000 : 420 * 1000; // 15s test / 7m prod
    const INTERVAL_MIN_DELAY = isDev ? 15000 : 300 * 1000; // 15s test / 5m prod
    const INTERVAL_MAX_DELAY = isDev ? 20000 : 420 * 1000; // 20s test / 7m prod
    const DISPLAY_DURATION_MIN = 5000; // 5s
    const DISPLAY_DURATION_MAX = 6000; // 6s

    const scheduleNextShow = (delay: number) => {
      timerRef.current = setTimeout(() => {
        const nextContent = generatePopupContent(lastNameRef.current);
        setContent(nextContent);
        lastNameRef.current = nextContent.name;
        setVisible(true);

        // Display timer
        const displayDuration = getRandomInRange(DISPLAY_DURATION_MIN, DISPLAY_DURATION_MAX);
        timerRef.current = setTimeout(() => {
          setVisible(false);

          // Schedule next show interval timer
          const nextDelay = getRandomInRange(INTERVAL_MIN_DELAY, INTERVAL_MAX_DELAY);
          scheduleNextShow(nextDelay);
        }, displayDuration);

      }, delay);
    };

    // First delay after entering page
    const initialDelay = getRandomInRange(FIRST_MIN_DELAY, FIRST_MAX_DELAY);
    scheduleNextShow(initialDelay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [hasClosed]);

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    setVisible(false);
    setHasClosed(true);
  };

  if (!content) return null;

  return (
    <div
      className={`
        fixed bottom-24 right-4 lg:bottom-6 lg:right-6
        z-50 max-w-[340px] w-[calc(100vw-32px)]
        bg-white/95 backdrop-blur-xl border border-slate-200/60 rounded-md
        shadow-[0_15px_35px_rgba(0,0,0,0.06)]
        p-4 pr-11 cursor-pointer select-none
        transition-all duration-500 ease-in-out transform
        hover:scale-[1.02] hover:shadow-[0_20px_45px_rgba(245,158,11,0.08)] hover:border-amber-400/50
        ${visible
          ? 'translate-y-0 opacity-100 scale-100'
          : 'translate-y-12 opacity-0 scale-95 pointer-events-none'
        }
      `}
    >
      <div className="flex items-center gap-2">
        {/* Content text */}
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-bold text-slate-800 leading-tight">
            {content.name} {content.province ? `ở ${content.province}` : ''}
          </p>
          <p className="text-[12.5px] text-slate-500 mt-1 leading-snug font-medium">
            {content.actionText} <span className="font-semibold text-amber-600">Học Nghề Trading</span>
          </p>
          <div className="flex items-center gap-1.5 text-[10.5px] text-slate-400 mt-1.5">
            <Clock className="w-3 h-3 stroke-[2.5] mt-[1px]" />
            <span>{content.timeAgo}</span>
          </div>
        </div>
      </div>

      {/* Close button */}
      <button
        onClick={handleClose}
        className="absolute top-3 right-3 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all duration-200"
        aria-label="Đóng thông báo"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
