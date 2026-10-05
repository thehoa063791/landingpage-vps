# apps/web — quy ước giao diện

Hệ thiết kế này lấy **hình dáng và khuôn mẫu từ Shopify Admin (Polaris)** và
**mã nguồn component từ shadcn/ui (nền Base UI)**. Polaris trả lời "trông thế nào,
đặt ở đâu"; shadcn trả lời "viết bằng gì". Khi hai bên vênh nhau, luật trong file
này thắng cả hai.

**Trước khi dựng màn hình mới, sửa component trong `components/ui/`, thêm token,
hay chọn màu nền cho bất cứ thứ gì — đọc `docs/ui.md`.** Vùng này có một loại lỗi
lặp đi lặp lại: lớp CSS viết ra không có tác dụng và không có gì báo. Dưới đây là
luật; lý do, giá trị token và cái đã hỏng nằm ở tài liệu đó.

## Mặt phẳng

Bốn tầng, từ ngoài vào trong. Mỗi tầng có MỘT token nền, không trộn:

| Tầng | Token | Giá trị (sáng) | Dùng cho |
|---|---|---|---|
| Thanh đầu | `bg-topbar` | `#1a1a1a` | dải đen trên cùng: logo, ô tìm kiếm, shop, tài khoản |
| Nền trang | `bg-background` | `#f1f1f1` | vùng nội dung và thanh bên (`bg-sidebar` `#ebebeb`) |
| Tấm | `bg-card` | `#ffffff` | mọi khối nội dung: card, bảng, form |
| Lớp phủ | `bg-popover` | `#ffffff` + `shadow-overlay` | menu, popover, hộp thoại, tooltip sáng |

- **Một control không được dùng chung màu nền với mặt phẳng nó đứng lên.**
- Nút phụ trên nền trang (`bg-background`) dùng `outline` (nền trắng + viền);
  trên tấm (`bg-card`) dùng `secondary` (nền `#f1f1f1`). **Chọn theo MẶT PHẲNG,
  không theo vai trò.**
- Mọi control trên thanh đầu mang nền `bg-topbar-control` (`#303030`), chữ trắng.
  Luật viết ở chính `top-bar.tsx`, không sửa từng component.
- Tấm nội dung KHÔNG có viền. Ranh giới của tấm là `shadow-card` (một vạch bóng
  1px phía dưới + viền mờ 8%) — đó là "chất Polaris". Thêm `border` lên card là
  ra hai đường kẻ chồng nhau.
- Bo góc: control `rounded-lg` (8px), tấm và lớp phủ `rounded-xl` (12px), badge
  `rounded-lg`. Không có giá trị thứ tư.
- `--card` và `--popover` cùng giá trị ở theme sáng, nên chọn nhầm token KHÔNG
  hiện ra trên màn hình. Chọn theo ý định — theme tối sẽ lộ ngay.
- **Trang con muốn chiếm trọn chiều cao thì khai `min-h-0 flex-1`, KHÔNG khai
  `h-full`** — `h-full` cộng thêm chiều cao dải thông báo đứng trên nó và đẩy đáy
  trang ra ngoài màn hình.

## Màu và vai trò

- **Nút chính màu ĐEN (`#303030`), không phải màu thương hiệu.** Mỗi màn hình có
  tối đa MỘT nút chính. Hai nút đen cạnh nhau là chưa quyết được việc chính.
- **Xanh (`#005bd3`) là màu của TƯƠNG TÁC**: liên kết, vòng focus, dấu chọn, ô
  tick. Không dùng xanh cho trang trí hay cho nút.
- Năm sắc trạng thái, mỗi sắc ba token (`-surface` nền nhạt, `-fill` nền đặc,
  `-text` chữ): `neutral`, `info`, `success`, `warning`, `critical`.
  Không thêm sắc thứ sáu.
- `critical` (đỏ) nói về HẬU QUẢ: xoá, huỷ, lỗi. Không dùng đỏ để gây chú ý.
- Màu thương hiệu của shop CHỈ xuất hiện ở ô avatar shop và ảnh bìa. Lấy từ
  `shopGradient()` (`lib/shop-cover.ts`), giống nhau ở mọi chỗ hiện cùng một shop.
- Chữ có ba sắc: `text-foreground` (`#303030`), `text-muted-foreground`
  (`#616161`), `text-disabled` (`#b5b5b5`). Không dùng đen tuyền `#000`.

## Chữ và chiều cao

- Một phông duy nhất: Inter, file `.woff2` trong repo (bản variable). `--font-sans`
  khai THẲNG chuỗi, không trỏ vòng. Giữ cả `--font-heading`.
- **Năm bậc chữ, không có bậc nào dưới 12px.** 9–11px là dưới sàn đọc được của
  tiếng Việt — dấu thanh chồng dấu mũ cần chiều cao. Polaris có bậc 11px; ta BỎ.

| Bậc | Lớp | Cỡ / dòng | Dùng cho |
|---|---|---|---|
| chú thích | `text-xs` | 12 / 16 | badge, chú thích dưới ô, mốc thời gian |
| thân | `text-sm` | 13 / 20 | **mặc định** của mọi chữ trong admin |
| nhấn | `text-base` | 14 / 20 | tiêu đề card, nhãn nhóm form |
| tiêu đề | `text-lg` | 20 / 28 | tiêu đề trang, tiêu đề hộp thoại |
| số lớn | `text-2xl` | 24 / 32 | con số KPI ở trang tổng quan |

- Hai ngoại lệ dưới 12px, cả hai vì cùng một lý do — chúng KHÔNG mang dấu: chữ
  cái đầu của avatar, và **badge chỉ chứa CHỮ SỐ** (bộ đếm chưa đọc, số bộ lọc
  đang áp) trong khung 16–18px. `text-[10px]` ở hai chỗ ấy là cố ý.
- Độ đậm: `font-semibold` (650) CHỈ cho tiêu đề trang và tiêu đề hộp thoại;
  `font-medium` (550) cho tiêu đề card, nhãn nút, tên cột; còn lại `font-normal`.
- **Ghi đè `--text-sm` thành 13px ở `@theme`, KHÔNG thêm lớp `text-body`** — lớp
  tên lạ làm `tailwind-merge` nhận nhầm là lớp MÀU và âm thầm nuốt
  `text-muted-foreground` (xem `docs/ui.md`).
- Ba chiều cao chuẩn là token thật: `h-control` (32), `h-menu` (32), `h-row` (44).
  `h-control` và `h-menu` hiện bằng nhau nhưng là HAI token — đổi mục menu không
  được kéo theo nút. Chọn theo ý định.
  Nút nhỏ `h-control-sm` (28) chỉ dùng trong ô bảng và thanh hành động hàng loạt.
- Dòng bảng dùng `py-1.5` quanh control 32 → 44. Viết `p-2` là ra 48.
- Số tiền, số lượng, phần trăm: `tabular-nums` và căn PHẢI trong bảng.

## Bố cục trang

Mọi trang trong admin dựng bằng `<Page>` (`components/layout/page.tsx`), không
tự dựng tiêu đề.

- Đầu trang: nút quay lại (nếu là trang con) · tiêu đề · badge trạng thái ·
  bên phải là nút phụ (`outline`) rồi MỘT nút chính. Hành động thứ ba trở đi
  gom vào menu "Thêm thao tác".
- Ba bề rộng, khai qua prop `width`: `default` (`max-w-[998px]`), `narrow`
  (`max-w-[662px]`, trang cài đặt, form đơn), `full` (bảng danh sách).
- Trang chi tiết dùng lưới **2/3 + 1/3**: cột trái là nội dung chính, cột phải
  là thuộc tính phụ (trạng thái, nhãn, người phụ trách). Không có tỉ lệ khác.
- Khoảng cách: giữa các card `gap-4` (16), trong card `p-4` (16), giữa các trường
  form `gap-3` (12), giữa hai nút `gap-2` (8). Thang khoảng cách là bội của 4.
- Card có tiêu đề thì tiêu đề nằm TRONG card, ở dòng đầu, `text-base
  font-medium`. Hành động của card (vd. "Sửa") là nút `link` ở góc phải tiêu đề.
- **Desktop là chuẩn của `apps/web`.** Bề rộng khung nhìn chọn theo User-Agent ở
  `lib/viewport.ts`; đừng thêm nhánh responsive mobile mới, đừng gỡ lớp `md:`
  đã có.

## Bảng dữ liệu

Theo khuôn IndexTable của Shopify: tab · thanh lọc · bảng · phân trang, tất cả
trong MỘT card.

- Mọi bảng liệt kê dùng `components/data/data-table.tsx`. Khai một mảng
  `DataTableColumn` rồi truyền vào — đừng dựng `<table>` mới.
- **Khung ngoài chỉ có đệm DỌC; đệm ngang đặt ở TỪNG VÙNG** (tab, thanh lọc,
  bảng, chân bảng), và bốn vùng dùng cùng một con số (`px-3`). Riêng vùng BẢNG
  cố ý không có đệm — đệm của nó nằm trong ô (`[&_td]:px-3`).
- Đầu bảng nền `bg-muted` (`#f7f7f7`), chữ `text-xs font-medium
  text-muted-foreground`. Dòng rê chuột nền `bg-muted`; dòng đã chọn nền
  `bg-selected` (`#f1f1f1`).
- Cả dòng bấm được (mở trang chi tiết); ô tick và nút trong ô phải
  `stopPropagation`. Cột đầu tiên là tên, `font-medium`.
- Chọn ≥ 1 dòng thì thanh lọc ĐỔI THÀNH thanh hành động hàng loạt, cùng vị trí,
  cùng chiều cao — không đẩy bảng xuống.
- Bộ lọc đang áp hiện thành "viên" (pill) dưới ô tìm kiếm, mỗi viên có nút gỡ.
- Trạng thái bảng nằm trong localStorage. Vì vậy `key` của cột và của bộ lọc là
  **giao diện lâu dài**: đổi tên key là làm hỏng cấu hình đã lưu của mọi người.
- **Cột chứa dữ liệu nhạy cảm thì đừng đưa vào mảng cột**, đừng ẩn bằng CSS —
  hộp cấu hình cột đọc chính mảng ấy. Máy chủ bỏ hẳn trường khỏi dòng khi thiếu
  quyền; chỉ cần hỏi trường có mặt hay không.
- Khi có tab lọc theo `status` thì **bỏ ô lọc `status`** khỏi mảng filters. Hai
  thứ cùng ghi một khoá thì bấm cái này âm thầm gỡ cái kia.
- Số đếm của tab KHÔNG nhận bộ lọc đang áp.
- Thanh lọc và chân bảng đứng trên card, nên control ở đó mang `secondary`.

## Form và thanh lưu

- Trang sửa KHÔNG có nút "Lưu" ở cuối trang. Có thay đổi chưa lưu thì **thanh
  lưu theo ngữ cảnh** (`<SaveBar>`) chiếm chỗ thanh đầu: "Thay đổi chưa lưu" ·
  `Huỷ` · `Lưu`. Rời trang khi còn thay đổi thì hỏi lại.
- Nhãn đặt TRÊN ô, `text-sm font-medium`. Chú thích dưới ô `text-xs
  text-muted-foreground`. Câu lỗi thay chỗ chú thích, sắc `critical`, có biểu
  tượng đứng trước.
- **Câu lỗi của FORM không đi qua thông báo nổi** — nó thuộc về ô đang sai, vì
  người dùng cần đọc lại trong lúc sửa. Lỗi cấp form (mất mạng, xung đột) hiện
  thành `Banner` `critical` ở đầu card đầu tiên.
- Ô chọn dùng `Select` của shadcn, KHÔNG dùng `<select>` native. `SelectTrigger`
  mặc định `w-fit`, nên trong cột lưới phải thêm `w-full`.
- Câu lỗi của `safeParse` đi qua `firstIssueMessage()`.

## Hai dạng dấu

Chỉ có ĐÚNG HAI dạng, tách nhau bằng NỀN chứ không bằng độ đậm:

| Dạng | Nền | Dùng cho |
|---|---|---|
| nhẹ | `bg-hover` (đậm hơn mặt phẳng một nấc) | rê chuột, nhấn giữ, nhóm đang chứa trang mở |
| đủ | `bg-selected` + chữ `text-foreground` | trang đang mở, mục đang chọn |

- Trên thanh bên (nền `#ebebeb`) dạng "đủ" là nền TRẮNG — đúng như Shopify. Trên
  lớp phủ (nền trắng) dạng "đủ" là nền `#f1f1f1` kèm dấu tick. Cùng một token
  `bg-selected`, giá trị đổi theo mặt phẳng qua biến CSS ở `docs/ui.md`.
- Áp cho CẢ `dropdown-menu`, `select`, `combobox`, `command` — mọi menu bung ra.
- Nhóm gập được KHÔNG mượn cờ `isActive` (cờ đó kéo theo cả nền lẫn vạch dọc).
- Mục con phải gọi tên riêng cho hình vẽ (`[&>svg]:`).
- **Viết `data-[selected]:`, KHÔNG viết `data-selected:`** — dạng kia không khớp
  gì, và không có lỗi nào báo. Base UI dùng `data-highlighted` cho rê chuột.
- `destructive` giữ nguyên sắc đỏ ở cả hai dạng.
- Thu gọn thanh bên thì nút 40px và hình vẽ 20px; `10 + 20 + 10 = 40` phải khớp.

## Badge trạng thái

- `Badge` có đúng năm `tone` trùng năm sắc trạng thái, cao 20px, `text-xs`,
  `rounded-lg`. Không có badge viền, không có badge màu tự chọn.
- Trạng thái có tiến trình (đơn hàng: chưa thanh toán → một phần → đã thanh toán)
  dùng prop `progress` để hiện chấm tròn rỗng / nửa / đầy trước chữ.
- Nhãn badge lấy từ từ điển; map trạng thái → tone khai MỘT lần ở
  `lib/status-tone.ts`, không viết `if` trong component.

## Hộp thoại và lớp phủ

- Hộp thoại có ba vùng: đầu (tiêu đề + nút đóng) · thân · chân (nút). Đầu và chân
  có vạch kẻ `border-border` ngăn với thân. Cả ba nền `bg-popover`.
- Nút ở chân căn PHẢI: `Huỷ` (`outline`) rồi nút chính. Hộp thoại xoá thì nút
  chính là `destructive`.
- Bề rộng: `sm:max-w-[620px]` (mặc định Polaris), nhỏ `sm:max-w-[380px]`, lớn
  `sm:max-w-[980px]`. **Đè bề rộng phải viết `sm:max-w-...`**, không viết lớp trần.
- Lớp phủ khi rê chuột dùng `Tooltip`, không dùng `hover-card`.
- Trang phụ trượt từ bên phải (`Sheet`) chỉ dùng cho xem nhanh, không dùng cho
  form có nhiều bước.

## Biểu đồ và số liệu

Theo khuôn trang Phân tích của Shopify: mỗi chỉ số là MỘT card — tên chỉ số · số
lớn · phần trăm thay đổi · biểu đồ. Bảng màu, thông số nét vẽ và cấu hình nằm ở
`docs/ui.md` mục 8.

- **Một thư viện duy nhất: `chart` của shadcn (Recharts bên dưới)**, cài bằng
  `pnpm dlx shadcn@latest add chart`. Mọi biểu đồ bọc trong `ChartContainer` và
  khai màu qua `ChartConfig`. Không thêm `@shopify/polaris-viz`, Chart.js hay
  ECharts — hai thư viện là hai bộ tooltip, hai cách định dạng số.
- **Hỏi "có cần biểu đồ không" trước.** Một con số → thẻ KPI, không vẽ. So hai
  kỳ → số + phần trăm. Theo thời gian → đường. So hạng mục → cột ngang, sắp giảm
  dần. Phần của tổng ≤ 5 phần → cột chồng 100% hoặc thanh tỉ lệ. **Không dùng
  biểu đồ tròn/donut, không 3D, không hai trục Y.**
- **Màu theo THỰC THỂ, không theo thứ hạng.** Tám ô màu `--chart-1..8` dùng
  theo đúng thứ tự, không xoay vòng; từ chuỗi thứ chín gom vào "Khác". Lọc bớt
  chuỗi thì các chuỗi còn lại GIỮ màu cũ — map thực thể → ô màu khai một lần.
- **Kỳ so sánh = cùng màu, nét ĐỨT, nhạt hơn** (`strokeDasharray="4 4"`,
  `opacity 0.5`). Đây là dấu hiệu nhận ra Shopify; đừng đổi kỳ so sánh sang màu
  khác.
- Biểu đồ một chuỗi dùng `--chart-1` và KHÔNG có chú giải — tên card đã gọi tên
  nó. Từ hai chuỗi: chú giải luôn có, đặt TRÊN biểu đồ, căn trái.
- **Màu trạng thái (`success`, `critical`…) KHÔNG làm màu chuỗi.** Phần trăm
  thay đổi dùng chữ `text-success-text` / `text-critical-text` kèm mũi tên — màu
  không bao giờ đứng một mình. Chỉ số "càng thấp càng tốt" (tỉ lệ hoàn hàng, chi
  phí) đảo màu, KHÔNG đảo mũi tên: khai `goodDirection="down"`.
- Nét: đường 2px, không chấm trên từng điểm (chấm chỉ hiện khi rê chuột); cột bo
  4px ở đầu, chân cột chạm trục; giữa hai cột liền nhau có khe 2px.
- Lưới chỉ kẻ NGANG, `--border-secondary`; không kẻ dọc, không viền khung. Trục
  Y tối đa 5 vạch, chữ trục `text-xs text-muted-foreground` — **12px là sàn, kể
  cả chữ trục.**
- Chữ (giá trị, nhãn, chú giải) mang màu CHỮ, không mang màu chuỗi. Ô màu nhỏ
  đứng cạnh chữ mới mang màu.
- **Mọi biểu đồ có tooltip khi rê chuột**: đường/vùng có đường dóng dọc + tooltip
  hiện CẢ HAI kỳ; cột hiện tooltip theo từng cột. Tooltip nền `bg-popover`
  `shadow-overlay`, giống tooltip toàn app.
- Số trên trục dùng dạng gọn `formatCompactVnd()` (`350 N`, `1,2 tr`, `3,5 tỷ`);
  tooltip dùng số ĐẦY ĐỦ `formatVnd()`. Không dùng `notation: "compact"` của
  `Intl` cho `vi-VN` — nó ra `T`, đọc nhầm nghìn với tỷ.
- Ngày trên trục: `5 thg 10`; tooltip: `Thứ Hai, 5 thg 10, 2026`. Qua `formatDate()`
  của `lib/format.ts`, không tự ghép chuỗi.
- Bộ chọn khoảng ngày + bộ chọn kỳ so sánh nằm MỘT hàng trên đầu trang, áp cho
  mọi card cùng lúc. Card không có bộ lọc ngày riêng.
- Đang tải: khung xương đúng hình card. Không có dữ liệu: giữ khung trục, giữa
  biểu đồ ghi "Không có dữ liệu trong khoảng này" — không ẩn card.
- **Không bọc biểu đồ trong `h-full`** — `ChartContainer` cần chiều cao cụ thể
  (`h-[240px]` cho card chỉ số, `h-[320px]` cho biểu đồ chính), nếu không
  `ResponsiveContainer` đo ra 0 và biểu đồ biến mất không báo lỗi.
- Mỗi biểu đồ có nút "Xem bảng" mở bảng số liệu tương ứng — cho người đọc màn
  hình và cho ai cần con số chính xác.

## Báo kết quả cho người dùng

- **Mọi thao tác GHI do người dùng chủ động bấm đều phải báo kết quả**, cả nhánh
  thành công lẫn nhánh hỏng. Gọi `notifySuccess()` / `notifyError()` ở
  `lib/notify.ts`, câu chữ lấy từ nhánh `toast` của từ điển.
- Thông báo nổi theo kiểu Shopify: nền tối `#1a1a1a`, chữ trắng, **neo GIỮA ĐÁY**,
  một dòng, tự tắt sau 5 giây. Câu ngắn, thì quá khứ: "Đã lưu sản phẩm".
- **Báo TRƯỚC khi đóng hộp thoại hay chuyển trang** — gọi sau thì component đã
  tháo.
- Thao tác mà kết quả TỰ HIỆN RA ở chỗ người dùng đang nhìn thì đừng báo thêm:
  lọc bảng, mở một hội thoại, đăng nhập.
- Chỉ có MỘT `<Toaster>`, ở `app/layout.tsx`. Bọc thêm cái thứ hai là dựng ra hai
  hàng đợi và thông báo rơi vào cái không hiện.

## Trạng thái rỗng, đang tải, lỗi

- Đang tải lần đầu: **khung xương** (`Skeleton`) đúng hình dạng trang thật, không
  dùng vòng quay giữa màn hình. Tải lại một phần: vòng quay nhỏ TRONG nút đã bấm.
- Rỗng: `EmptyState` trong card — hình minh hoạ, một câu tiêu đề, một câu giải
  thích, MỘT nút chính. Rỗng vì bộ lọc thì câu khác và nút là "Xoá bộ lọc".
- Nút đang chạy thì `disabled` + vòng quay thay biểu tượng, giữ nguyên bề rộng.

## Ô nhập tiền

- **Mọi trường tiền đi qua `MoneyInput`**, kể cả hai ô khoảng giá của bộ lọc.
- Chuỗi hiện và giá trị gửi lên là HAI thứ tiếng: hiện `380.000,5`, gửi
  `380000.5`. Gửi chuỗi có dấu nhóm lên thì Postgres đọc `380.000` thành ba trăm
  tám mươi — sai một nghìn lần.
- Đơn vị `₫` đứng SAU số, trong ô (hậu tố), màu `text-muted-foreground`.

## Base UI, không phải Radix

- Thêm component bằng `pnpm dlx shadcn@latest add <tên>` chạy trong `apps/web`.
  Thấy `@radix-ui/*` trong dependency là đã cài sai nền.
- Code chép từ dự án nền Radix phải đổi ba chỗ: `asChild` → `render={<X/>}`,
  `checked="indeterminate"` → prop `indeterminate`, và bỏ `modal={false}`.
- **Nội dung của trigger truyền qua children; `render` chỉ nhận PHẦN TỬ.** Nhét
  children vào phần tử của `render` thì lớp phủ không bung ra, và không có lỗi.
- **`Button` với `render={<Link/>}` phải kèm `nativeButton={false}`.**
- **`Card` khai đệm bằng biến CSS (`py-(--card-spacing)`), nên `p-0` KHÔNG gỡ
  được nó.** Thẻ cần nội dung chạm mép (bảng, ảnh) viết `py-0! gap-0!`.
- `DialogContent` khai sẵn `ring-1 ring-foreground/10`. Gỡ phải dùng `ring-0`.
- `TabsList` (`h-fit`) và biến thể `line` cần `!` để thắng tailwind-merge.
- Các file trong `components/ui/` đã sửa khác bản gốc để mang dáng Polaris —
  danh sách ở `docs/ui.md`. **Mỗi lần `shadcn add` đè lên một file trong danh
  sách ấy, phải áp lại thay đổi.**

## Chữ hiển thị và song ngữ

- **Không có chuỗi tiếng Việt cứng nào trong JSX.** Server Component dùng
  `const t = await getT()`, Client Component dùng `const t = useT()`.
- **`useMemo` dựng nhãn cột PHẢI có `t` trong mảng phụ thuộc** — nếu không nhãn
  kẹt ở ngôn ngữ cũ sau khi đổi.
- Giọng chữ theo Shopify: ngắn, chủ động, động từ đứng đầu nút ("Thêm sản phẩm",
  không "Sản phẩm mới"). Không viết hoa cả câu, không chấm than.

## Trước khi mở PR có giao diện

1. Mỗi control đứng trên mặt phẳng nào? Nền có khác mặt phẳng không?
2. Màn hình có đúng một nút đen không?
3. Có chữ nào dưới 12px mà không phải avatar / badge số không?
4. Có lớp nào viết ra mà không có tác dụng không? (mở DevTools, xem lớp có thật
   sự áp lên phần tử không — `data-selected:`, `p-0` trên Card, `h-full`).
5. Thao tác ghi có báo kết quả không? Báo trước hay sau khi đóng hộp thoại?
