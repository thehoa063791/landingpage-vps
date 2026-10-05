# docs/ui.md — token, lý do, và những chỗ đã hỏng

File này đi kèm `apps/web/CLAUDE.md`. CLAUDE.md là LUẬT (ngắn, mệnh lệnh); file
này là LÝ DO và GIÁ TRỊ. Sửa một luật thì sửa cả hai.

Nguồn tham chiếu:

- Shopify Polaris — https://polaris.shopify.com (màu, bề mặt, khuôn trang,
  IndexTable, thanh lưu, giọng chữ).
- shadcn/ui — https://ui.shadcn.com (mã component, tên token, cách cài).
- Giá trị màu dưới đây XẤP XỈ Polaris bản 2023+ và đã chỉnh cho tiếng Việt; khi
  lệch nhau, giá trị trong file này là chuẩn của ta.

---

## 1. Token — `app/globals.css`

Tên token giữ đúng tên của shadcn (`--background`, `--card`, `--primary`…) để mọi
component cài về chạy ngay; token RIÊNG của ta (bề mặt Polaris, sắc trạng thái,
chiều cao) thêm bên cạnh.

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

:root {
  --radius: 0.75rem;                 /* 12px — tấm, lớp phủ */

  /* Mặt phẳng */
  --topbar: #1a1a1a;
  --topbar-control: #303030;
  --background: #f1f1f1;             /* nền trang */
  --sidebar: #ebebeb;                /* thanh bên */
  --card: #ffffff;                   /* tấm */
  --popover: #ffffff;                /* lớp phủ */
  --muted: #f7f7f7;                  /* đầu bảng, vùng phụ trong tấm */

  /* Dấu — đổi giá trị theo mặt phẳng, xem mục 3 */
  --hover: #f7f7f7;
  --selected: #f1f1f1;

  /* Chữ */
  --foreground: #303030;
  --card-foreground: #303030;
  --popover-foreground: #303030;
  --muted-foreground: #616161;
  --disabled: #b5b5b5;

  /* Vai trò */
  --primary: #303030;                /* nút chính: ĐEN */
  --primary-foreground: #ffffff;
  --secondary: #f1f1f1;              /* nút phụ trên tấm */
  --secondary-foreground: #303030;
  --accent: #f1f1f1;
  --accent-foreground: #303030;
  --interactive: #005bd3;            /* liên kết, focus, tick */
  --destructive: #c70a24;

  --border: #e3e3e3;
  --border-secondary: #ebebeb;       /* lưới biểu đồ, vạch kẻ trong tấm */
  --input: #8a8a8a;                  /* viền ô nhập — đậm hơn viền tấm */
  --ring: #005bd3;

  /* Biểu đồ — 8 ô theo THỨ TỰ, đã chạy kiểm tra mù màu (mục 8) */
  --chart-1: #2a78d6;  /* xanh dương */
  --chart-2: #eb6834;  /* cam */
  --chart-3: #1baf7a;  /* xanh ngọc */
  --chart-4: #eda100;  /* vàng */
  --chart-5: #e87ba4;  /* hồng */
  --chart-6: #008300;  /* lục */
  --chart-7: #4a3aa7;  /* tím */
  --chart-8: #e34948;  /* đỏ */

  /* Năm sắc trạng thái: surface (nền badge/banner) · fill · text */
  --neutral-surface: #e3e3e3;  --neutral-fill: #8a8a8a;  --neutral-text: #616161;
  --info-surface: #e0f0ff;     --info-fill: #91d0ff;     --info-text: #00527c;
  --success-surface: #cdfee1;  --success-fill: #29845a;  --success-text: #0c5132;
  --warning-surface: #ffeb78;  --warning-fill: #ffb800;  --warning-text: #4f4700;
  --critical-surface: #fedad9; --critical-fill: #c70a24; --critical-text: #8e0b21;

  /* Thanh bên dùng bộ token sidebar-* của shadcn */
  --sidebar-foreground: #303030;
  --sidebar-primary: #303030;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #ffffff;         /* = dạng dấu "đủ" trên thanh bên */
  --sidebar-accent-foreground: #303030;
  --sidebar-border: #e3e3e3;
  --sidebar-ring: #005bd3;
}

.dark {
  --topbar: #0b0b0b;
  --topbar-control: #262626;
  --background: #1a1a1a;
  --sidebar: #141414;
  --card: #262626;
  --popover: #2b2b2b;                /* KHÁC --card ở theme tối — chọn nhầm sẽ lộ */
  --muted: #2f2f2f;
  --hover: #303030;
  --selected: #383838;
  --foreground: #e3e3e3;
  --card-foreground: #e3e3e3;
  --popover-foreground: #e3e3e3;
  --muted-foreground: #a8a8a8;
  --disabled: #616161;
  --primary: #f1f1f1;
  --primary-foreground: #1a1a1a;
  --secondary: #333333;
  --secondary-foreground: #e3e3e3;
  --accent: #333333;
  --accent-foreground: #e3e3e3;
  --interactive: #4ba5ff;
  --destructive: #ff6b6b;
  --border: #383838;
  --border-secondary: #303030;
  --input: #616161;
  --chart-1: #3987e5;
  --chart-2: #d95926;
  --chart-3: #199e70;
  --chart-4: #c98500;
  --chart-5: #d55181;
  --chart-6: #008300;
  --chart-7: #9085e9;
  --chart-8: #e66767;
  --ring: #4ba5ff;
  --sidebar-accent: #2b2b2b;
  --sidebar-foreground: #e3e3e3;
  --sidebar-border: #383838;
}

@theme inline {
  /* Phông — khai THẲNG chuỗi, không var(--font-inter) */
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-heading: "Inter", ui-sans-serif, system-ui, sans-serif;

  /* Năm bậc chữ — ĐÈ bậc có sẵn, không thêm tên mới (xem mục 5) */
  --text-xs: 0.75rem;     --text-xs--line-height: 1rem;       /* 12/16 */
  --text-sm: 0.8125rem;   --text-sm--line-height: 1.25rem;    /* 13/20 */
  --text-base: 0.875rem;  --text-base--line-height: 1.25rem;  /* 14/20 */
  --text-lg: 1.25rem;     --text-lg--line-height: 1.75rem;    /* 20/28 */
  --text-2xl: 1.5rem;     --text-2xl--line-height: 2rem;      /* 24/32 */

  /* Inter variable cho phép 550 / 650 như Polaris */
  --font-weight-medium: 550;
  --font-weight-semibold: 650;

  /* Chiều cao — sinh ra h-control, h-menu, h-row, h-control-sm */
  --spacing-control: 2rem;      /* 32 */
  --spacing-control-sm: 1.75rem;/* 28 */
  --spacing-menu: 2rem;         /* 32 */
  --spacing-row: 2.75rem;       /* 44 */

  /* Bo góc */
  --radius-lg: 0.5rem;          /* control, badge */
  --radius-xl: var(--radius);   /* tấm, lớp phủ */

  /* Bóng */
  --shadow-card: 0 1px 0 0 rgb(26 26 26 / 0.07), 0 0 0 1px rgb(0 0 0 / 0.08);
  --shadow-overlay: 0 4px 6px -2px rgb(26 26 26 / 0.2), 0 0 0 1px rgb(0 0 0 / 0.08);
  --shadow-button: inset 0 -1px 0 0 #b5b5b5, inset 0 0 0 1px rgb(0 0 0 / 0.1),
                   inset 0 0.5px 0 1.5px #fff;
  --shadow-button-primary: inset 0 -1px 0 1px rgb(0 0 0 / 0.8),
                           inset 0 0 0 1px #303030,
                           inset 0 0.5px 0 1.5px rgb(255 255 255 / 0.25);

  /* Ánh xạ màu sang Tailwind */
  --color-topbar: var(--topbar);
  --color-topbar-control: var(--topbar-control);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-disabled: var(--disabled);
  --color-hover: var(--hover);
  --color-selected: var(--selected);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-interactive: var(--interactive);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-border-secondary: var(--border-secondary);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-chart-6: var(--chart-6);
  --color-chart-7: var(--chart-7);
  --color-chart-8: var(--chart-8);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-neutral-surface: var(--neutral-surface);
  --color-neutral-fill: var(--neutral-fill);
  --color-neutral-text: var(--neutral-text);
  --color-info-surface: var(--info-surface);
  --color-info-fill: var(--info-fill);
  --color-info-text: var(--info-text);
  --color-success-surface: var(--success-surface);
  --color-success-fill: var(--success-fill);
  --color-success-text: var(--success-text);
  --color-warning-surface: var(--warning-surface);
  --color-warning-fill: var(--warning-fill);
  --color-warning-text: var(--warning-text);
  --color-critical-surface: var(--critical-surface);
  --color-critical-fill: var(--critical-fill);
  --color-critical-text: var(--critical-text);
}

@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply bg-background text-foreground text-sm antialiased; }
  /* Dấu theo mặt phẳng — mục 3 */
  [data-slot="sidebar"] { --hover: #e3e3e3; --selected: #ffffff; }
  .dark [data-slot="sidebar"] { --hover: #262626; --selected: #2b2b2b; }
}
```

---

## 2. Bảng component — mỗi component trông thế nào

| Component | Chiều cao | Bo | Nền | Ghi chú |
|---|---|---|---|---|
| `Button` default | `h-control` | `rounded-lg` | `bg-primary` + `shadow-button-primary` | nút đen, `font-medium` |
| `Button` outline | `h-control` | `rounded-lg` | `bg-card` + `shadow-button` | trên NỀN TRANG |
| `Button` secondary | `h-control` | `rounded-lg` | `bg-secondary` | trên TẤM |
| `Button` ghost | `h-control` | `rounded-lg` | không; rê chuột `bg-hover` | hành động trong menu, trong ô |
| `Button` link | auto | — | không, chữ `text-interactive` | "Sửa" ở góc card |
| `Button` destructive | `h-control` | `rounded-lg` | `bg-critical-fill`, chữ trắng | chỉ trong hộp thoại xác nhận |
| `Button` size sm | `h-control-sm` | `rounded-lg` | theo biến thể | trong ô bảng, thanh hàng loạt |
| `Input` / `Textarea` | `h-control` | `rounded-lg` | `bg-card`, viền `border-input` | focus: `ring-2 ring-ring ring-offset-1` |
| `Select` trigger | `h-control` | `rounded-lg` | như `Input` | `w-full` trong lưới |
| `Checkbox` | 16px | 4px | tick `bg-primary` (đen) | Polaris tick màu đen, không xanh |
| `Badge` | 20px | `rounded-lg` | `bg-{tone}-surface`, chữ `text-{tone}-text` | `text-xs`, `px-2` |
| `Card` | — | `rounded-xl` | `bg-card` + `shadow-card` | không `border`, `--card-spacing: 1rem` |
| `Banner` | — | `rounded-xl` | `bg-{tone}-surface` | biểu tượng + tiêu đề + nội dung + nút |
| `DropdownMenu` item | `h-menu` | `rounded-lg` | rê `bg-hover`, chọn `bg-selected` | menu có `p-1.5` |
| `Dialog` | — | `rounded-xl` | `bg-popover` + `shadow-overlay` | đầu/chân có vạch kẻ |
| `Tabs` (đầu bảng) | `h-control` | `rounded-lg` | tab đang mở `bg-selected` | không gạch chân |
| `Tooltip` | auto | `rounded-lg` | `bg-popover`, chữ `text-foreground` | Polaris tooltip SÁNG, không đen |
| Toast | auto | `rounded-xl` | `bg-topbar`, chữ trắng | neo giữa đáy |

Xanh `--interactive` chỉ còn ở liên kết và vòng focus — kể cả ô tick cũng đen.

---

## 3. Vì sao dấu "đủ" đổi màu theo mặt phẳng

Luật gốc: **control không dùng chung nền với mặt phẳng**. Nếu `--selected` cố
định `#f1f1f1` thì trên thanh bên (`#ebebeb`) mục đang mở gần như vô hình, còn
trên lớp phủ trắng thì rõ. Shopify giải bằng cách đảo: trên thanh bên mục đang mở
là nền TRẮNG.

Ta không viết hai bộ lớp. Component chỉ biết `bg-selected` / `bg-hover`; mặt
phẳng tự khai lại hai biến đó (`[data-slot="sidebar"]` ở `globals.css`). Thêm mặt
phẳng mới có màu riêng thì khai lại hai biến ở đúng chỗ ấy, KHÔNG sửa component.

---

## 4. Vì sao nút chính màu đen

Shopify Admin dùng đen làm hành động chính và để màu cho NỘI DUNG của người bán
(ảnh sản phẩm, logo). Một admin có hàng trăm màn hình; nếu nút chính mang màu
thương hiệu thì màu ấy xuất hiện khắp nơi và mất nghĩa. Đen cộng một nút duy nhất
mỗi màn hình làm "việc tiếp theo" luôn nhìn ra trong một giây.

---

## 5. Những lỗi im lặng đã gặp

### 5.1 `text-body` nuốt màu chữ

`cn()` dùng `tailwind-merge`. Một lớp tên lạ như `text-body` bị coi là lớp MÀU
chữ, nên `cn("text-muted-foreground", "text-body")` trả về chỉ `text-body` — chữ
mất màu xám mà không có cảnh báo nào. Vì thế ta ĐÈ `--text-sm` thay vì thêm tên.

Nếu buộc phải thêm bậc chữ tên mới, khai cho `tailwind-merge` ở `lib/utils.ts`:

```ts
import { extendTailwindMerge } from "tailwind-merge";
const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: ["body"] }] } },
});
```

Phép thử nằm ở `lib/utils.test.ts`:
`cn("h-8", "h-control") === "h-control"` và
`cn("text-muted-foreground", "text-sm")` còn giữ cả hai lớp.

### 5.2 `data-selected:` không khớp gì

Base UI gắn `data-selected` / `data-highlighted` dạng thuộc tính KHÔNG có giá
trị. Dạng viết tắt `data-selected:` đã từng không khớp trong dự án (tuỳ phiên bản
Tailwind và cách cấu hình biến thể); dạng ngoặc vuông `data-[selected]:` sinh
đúng `[data-selected]` ở mọi phiên bản. Thống nhất một dạng để grep được.

Lỗi thứ hai cùng họ: nhầm `selected` (mục ĐANG CHỌN) với `highlighted` (mục
con trỏ / phím mũi tên đang đứng). Dạng "nhẹ" đi với `highlighted`, dạng "đủ" đi
với `selected`.

### 5.3 `p-0` trên `Card`

`Card` khai `py-(--card-spacing)`; `p-0` của ta và `py-*` của component nằm ở
hai nhóm khác nhau với `tailwind-merge` nên cả hai cùng đứng, và `py` thắng vì
đứng sau trong CSS. Viết `py-0! gap-0!`.

### 5.4 `h-full` đẩy đáy trang

Khung nội dung là flex dọc: dải thông báo (gói, dùng thử) + trang. `h-full` lấy
100% CHA, không trừ dải thông báo → đáy trang tràn đúng bằng chiều cao dải.
`min-h-0 flex-1` lấy phần còn lại.

### 5.5 Viền + bóng trên card

`shadow-card` đã chứa viền 1px bằng `0 0 0 1px`. Thêm `border` là ra hai đường,
lệch nhau 1px ở góc bo — chỉ thấy khi phóng to, nhưng thấy.

---

## 6. File trong `components/ui/` đã sửa khác bản gốc shadcn

Mỗi lần `pnpm dlx shadcn@latest add` đè lên một file dưới đây, áp lại thay đổi
(chạy `git diff` trước khi commit).

| File | Thay đổi |
|---|---|
| `button.tsx` | thêm `shadow-button*`; `secondary` = `bg-secondary`; size `sm` = `h-control-sm`; bỏ size `lg` |
| `card.tsx` | bỏ `border`, thêm `shadow-card`; `--card-spacing: 1rem`; tiêu đề `text-base font-medium` |
| `badge.tsx` | thay `variant` bằng `tone` (5 sắc) + prop `progress` |
| `checkbox.tsx` | tick `bg-primary` (đen) thay vì màu mặc định |
| `dropdown-menu.tsx`, `select.tsx`, `command.tsx` | hai dạng dấu: `data-[highlighted]:bg-hover`, `data-[selected]:bg-selected` |
| `dialog.tsx` | ba vùng có vạch kẻ; bề rộng mặc định `sm:max-w-[620px]` |
| `tooltip.tsx` | nền sáng `bg-popover` + `shadow-overlay` thay vì nền đen |
| `tabs.tsx` | tab đang mở `bg-selected`, bỏ gạch chân |
| `sonner.tsx` | `position="bottom-center"`, nền `bg-topbar` |
| `input.tsx` | viền `border-input`, focus `ring-2 ring-offset-1` |
| `chart.tsx` | tooltip nền `bg-popover` + `shadow-overlay`, chữ 12–13px; chú giải đặt trên, căn trái |

Thêm một file vào danh sách này là một phần của PR sửa file đó.

---

## 7. Component riêng (không có trong shadcn)

| Component | Vị trí | Dựng từ |
|---|---|---|
| `Page` | `components/layout/page.tsx` | tiêu đề, nút quay lại, badge, hành động, bề rộng |
| `SaveBar` | `components/layout/save-bar.tsx` | thay thanh đầu khi form "bẩn" |
| `DataTable` | `components/data/data-table.tsx` | tab + lọc + bảng + phân trang trong một card |
| `Banner` | `components/feedback/banner.tsx` | năm tone, có thể đóng |
| `EmptyState` | `components/feedback/empty-state.tsx` | hình + tiêu đề + mô tả + một nút |
| `MoneyInput` | `components/form/money-input.tsx` | hiện `380.000,5`, gửi `380000.5`, hậu tố `₫` |
| `StatusBadge` | `components/data/status-badge.tsx` | đọc `lib/status-tone.ts` |
| `MetricCard` | `components/analytics/metric-card.tsx` | tên chỉ số + số lớn + delta + biểu đồ (mục 8.5) |
| `DateRangeBar` | `components/analytics/date-range-bar.tsx` | khoảng ngày + kỳ so sánh, một hàng đầu trang |

---

## 8. Biểu đồ

### 8.1 Bảng màu và vì sao là thứ tự này

Tám ô `--chart-1..8` (khai ở mục 1) là bảng màu đã kiểm bằng công cụ đo độ phân
biệt cho người mù màu (CVD), đo trên ĐÚNG mặt phẳng biểu đồ đứng — tấm `#ffffff`
(sáng) và `#262626` (tối):

| Kiểm tra | Sáng | Tối |
|---|---|---|
| Hai màu liền kề, mắt mù màu (ΔE ≥ 8) | 9.1 — đạt | 8.4 — đạt |
| Hai màu liền kề, mắt thường (ΔE ≥ 15) | 19.6 — đạt | 19.3 — đạt |
| Tương phản với nền (≥ 3:1) | ô 3, 4, 5 dưới 3:1 | cả 8 đạt |

Hệ quả phải tuân:

- **THỨ TỰ là cơ chế an toàn, không phải thẩm mỹ.** Đổi chỗ hai ô là phá kết quả
  kiểm tra. Muốn đổi màu thì chạy lại công cụ kiểm tra (`node scripts/validate_palette.js "<hex,...>" --mode light --surface "#ffffff"`, rồi `--mode dark --surface "#262626"`)
  trên cả hai nền rồi mới sửa token.
- Ở theme sáng, ô 3 (xanh ngọc), 4 (vàng), 5 (hồng) nhạt hơn 3:1 so với nền trắng
  → biểu đồ dùng tới ô 3 trở lên BẮT BUỘC có chú giải chữ + nút "Xem bảng".
- Biểu đồ mà MỌI cặp màu cùng hiện cạnh nhau (chấm phân tán, bản đồ) chỉ dùng 3
  ô đầu; từ chuỗi thứ tư gom "Khác" hoặc tách thành nhiều biểu đồ nhỏ.
- Đường, cột, cột chồng (chỉ các màu LIỀN KỀ chạm nhau) dùng được cả 8 ô.
- Ô 8 (đỏ) và ô 6 (lục) gần với màu trạng thái `critical` / `success`. Vì thế
  phần trăm thay đổi luôn kèm mũi tên, và không đặt biểu đồ nhiều chuỗi sát một
  `Banner` trạng thái.

### 8.2 Ánh xạ thực thể → màu

```ts
// lib/chart-colors.ts — khai MỘT lần cho mỗi loại thực thể
export const CHANNEL_COLOR = {
  online_store: "var(--chart-1)",
  pos:          "var(--chart-2)",
  facebook:     "var(--chart-3)",
  tiktok:       "var(--chart-4)",
  other:        "var(--muted-foreground)", // "Khác" luôn xám, không ăn một ô màu
} as const;
```

Không viết `colors[index]`. Lọc bỏ kênh `pos` thì `facebook` vẫn là ô 3.

### 8.3 Khuôn biểu đồ đường có kỳ so sánh (khuôn chuẩn)

```tsx
const config = {
  current:  { label: t.analytics.currentPeriod,  color: "var(--chart-1)" },
  previous: { label: t.analytics.previousPeriod, color: "var(--chart-1)" },
} satisfies ChartConfig;

<ChartContainer config={config} className="h-[240px] w-full">
  <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
    <CartesianGrid vertical={false} stroke="var(--color-border-secondary)" />
    <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8}
           minTickGap={24} tickFormatter={formatDateShort} />
    <YAxis tickLine={false} axisLine={false} width={48} tickCount={5}
           tickFormatter={formatCompactVnd} />
    <ChartTooltip cursor={{ stroke: "var(--color-border)" }}
                  content={<ChartTooltipContent indicator="line"
                           labelFormatter={formatDateLong}
                           formatter={formatVnd} />} />
    <Line dataKey="previous" stroke="var(--color-previous)" strokeWidth={2}
          strokeDasharray="4 4" strokeOpacity={0.5} dot={false} activeDot={false} />
    <Line dataKey="current" stroke="var(--color-current)" strokeWidth={2}
          dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} />
  </LineChart>
</ChartContainer>
```

- `previous` vẽ TRƯỚC để nằm dưới `current`.
- `type` của `Line` để mặc định (`linear`). `monotone` làm đường cong vượt quá
  điểm thật và vẽ ra những đỉnh không tồn tại.
- `activeDot` có vòng `var(--card)` 2px để tách khỏi đường khi chồng nhau.

### 8.4 Thông số nét vẽ

| Thành phần | Giá trị |
|---|---|
| Đường | `strokeWidth={2}`, `dot={false}`, chấm khi rê `r=4` |
| Cột | `radius={[4, 4, 0, 0]}` (cột ngang: `[0, 4, 4, 0]`), `barGap={2}` |
| Cột chồng | mỗi đoạn `stroke="var(--card)" strokeWidth={2}` tạo khe 2px; chỉ đoạn TRÊN CÙNG bo góc |
| Vùng | tô `fillOpacity={0.12}`, viền đường 2px cùng màu |
| Lưới | chỉ ngang, `--border-secondary`, nét liền |
| Trục | không kẻ trục, không vạch; chữ 12px `--muted-foreground` |
| Đường tham chiếu (mục tiêu, trung bình) | `--muted-foreground`, nét đứt `2 4`, nhãn chữ ở đầu phải |
| Chiều cao | card chỉ số `h-[240px]`, biểu đồ chính `h-[320px]`, sparkline `h-[40px]` |

### 8.5 Thẻ chỉ số (KPI card) — `components/analytics/metric-card.tsx`

```
┌────────────────────────────────────────┐
│ Tổng doanh thu ⓘ                       │  text-sm font-medium, gạch chân chấm → Tooltip định nghĩa
│ 128.450.000 ₫        ↑ 12%             │  text-2xl font-semibold tabular-nums · delta text-xs
│ ┌────────────────────────────────────┐ │
│ │        biểu đồ đường 240px         │ │
│ └────────────────────────────────────┘ │
│ ● 1–5 thg 10   ┄ 24–28 thg 9           │  chú giải kỳ: text-xs text-muted-foreground
└────────────────────────────────────────┘
```

Props: `title`, `definition`, `value`, `previousValue`, `format` (`"vnd" |
"number" | "percent"`), `goodDirection` (`"up"` mặc định | `"down"`), `series`.

- Phần trăm thay đổi tự tính từ `value` / `previousValue`; `previousValue = 0`
  thì hiện "—", không hiện "∞%".
- Tốt → `text-success-text` + `ArrowUpRight`/`ArrowDownRight`; xấu →
  `text-critical-text`; |Δ| < 0,5% → `text-muted-foreground`, không mũi tên.
- Trang chủ dùng biến thể `compact`: không trục, không lưới, sparkline 40px, cả
  thẻ bấm được để mở báo cáo chi tiết.

### 8.6 Định dạng — `lib/format.ts`

```ts
const nf1 = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

/** Trục: 350 N · 1,2 tr · 3,5 tỷ  (KHÔNG dùng notation:"compact" — vi-VN ra "T") */
export function formatCompactVnd(n: number) {
  const a = Math.abs(n);
  if (a >= 1e9) return `${nf1.format(n / 1e9)} tỷ`;
  if (a >= 1e6) return `${nf1.format(n / 1e6)} tr`;
  if (a >= 1e3) return `${nf1.format(n / 1e3)} N`;
  return nf1.format(n);
}

/** Tooltip, số lớn: 128.450.000 ₫ */
export const formatVnd = (n: number) =>
  `${new Intl.NumberFormat("vi-VN").format(n)} ₫`;

/** Trục: 5 thg 10 · Tooltip: Thứ Hai, 5 thg 10, 2026 */
export const formatDateShort = (d: Date | string) =>
  new Intl.DateTimeFormat("vi-VN", { day: "numeric", month: "short" }).format(new Date(d));
export const formatDateLong = (d: Date | string) =>
  new Intl.DateTimeFormat("vi-VN", {
    weekday: "long", day: "numeric", month: "short", year: "numeric",
  }).format(new Date(d));
```

Đã kiểm: `Intl.NumberFormat("vi-VN", { notation: "compact" })` cho `350000 →
"350 N"`, `1200000 → "1,2 Tr"`, `3500000000 → "3,5 T"` — chữ `T` là tỷ nhưng người
đọc dễ hiểu thành "triệu" hoặc "nghìn". Đó là lý do có hàm riêng.

### 8.7 Những lỗi im lặng của biểu đồ

- **Biểu đồ cao 0px.** `ResponsiveContainer` bên trong `ChartContainer` đo chiều
  cao CHA. Cha là `h-full` trong flex chưa có chiều cao → 0 → không vẽ gì, không
  lỗi. Luôn khai chiều cao cụ thể trên `ChartContainer`.
- **Màu không ăn.** `ChartConfig` sinh biến `--color-<key>`; key có dấu cách hay
  dấu chấm (`"online store"`) sinh tên biến hỏng và đường ra màu đen. Key viết
  `snake_case`.
- **Tooltip ra tiếng Anh / số kiểu Mỹ.** `ChartTooltipContent` mặc định gọi
  `value.toLocaleString()` theo locale TRÌNH DUYỆT. Luôn truyền `formatter`.
- **Nhảy màu khi lọc.** Màu lấy theo vị trí trong mảng dữ liệu → bỏ một chuỗi là
  mọi chuỗi phía sau đổi màu. Lấy từ `lib/chart-colors.ts`.
- **Hydration lệch.** Định dạng ngày ở Server Component theo múi giờ máy chủ,
  ở client theo múi giờ trình duyệt. Truyền `timeZone: "Asia/Ho_Chi_Minh"` khi
  ngày đã là mốc giờ, hoặc gửi chuỗi `YYYY-MM-DD` đã cắt sẵn từ máy chủ.
