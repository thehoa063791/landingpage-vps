# Kế hoạch: Blog chuẩn SEO

> Lập ngày 2026-10-26. Các quyết định đã chốt ngày 26/10 (mục 11); còn chờ quyết định về Cloudflare (11.5).
> **B1–B3 đã deploy 26/10** (9f236d0, d40e99a): 16 bài WordPress đang ở `/blog` trên `event.`, để noindex cho tới khi bật `BLOG_INDEXING=true` lúc đổi tên miền. Còn B4 (sao lưu `/storage`, cache, nginx, swap, Cloudflare) và B5 (ra mắt). Làm trước bước 4.3 của [roadmap.md](roadmap.md) (nginx/SSL tên miền chính),
> để blog lên cùng lúc với `phamthanhbien.com` ở bước 4.5.

## 1. Hiện trạng

**Hệ thống này**
- Đã có một blog rất cơ bản:
  - bảng `blog_posts` (tiêu đề, slug, nội dung HTML, tóm tắt, ảnh bìa, trạng thái, tác giả, tag);
  - trang `/blog` và `/blog/:slug` dựng HTML đơn giản, không có thẻ SEO, sitemap hay dữ liệu có cấu trúc;
  - mục Blog trong `cms.html` dùng trình soạn Quill 1.3.7 tải từ CDN.
- Production có **1 bài**.
- Media Library (`/storage`) đã có: tải ảnh lên, thư mục, tự tạo bản WebP (đang dùng cho /zoom).
- Redirect (Admin > Redirect) đã có, dùng được cho các đường dẫn cũ của WordPress.
- Bước 4.1 đã có `SITE_URL`: canonical, sitemap và schema sẽ dùng nó, nên tự đổi theo tên miền.

**WordPress hiện tại** (đọc từ bản sao lưu 26/10)
- **17 bài viết** (2017 → 2023), đường dẫn ở gốc tên miền: `phamthanhbien.com/<slug>/`.
- Trang danh sách là `/blog/`, có 1 chuyên mục: `kien-thuc-dau-tu` (7 bài). Không dùng tag.
- Bài viết là HTML thường, không dựng bằng Thrive, nên chuyển sang dễ.
- 424 file đính kèm (ảnh), đang nằm trên host WordPress. Sẽ mất khi tắt WordPress, nên phải chép sang.
- Có Yoast SEO, nhưng **không bài nào có tiêu đề/mô tả SEO riêng**: tất cả dùng mặc định.
- Chất lượng không đều:
  - 1 bài không có chữ ("Tỷ phú & Lão ăn mày", có lẽ chỉ là video);
  - `/platinum/` thực ra là trang đăng ký bản tin;
  - 5 bài dưới 400 chữ;
  - còn lại 700–1.900 chữ.

**Hạ tầng**
- VPS dùng chung với các site khác:
  - 4 vCPU, RAM 3,9 GB (đang trống 1,7 GB), **không có swap**;
  - ổ đĩa còn trống 9,6 GB / 35 GB;
  - tải rất thấp (load 0,1–0,8).
- nginx 1.24: có HTTP/2 và gzip; chưa có Brotli, chưa có cache.
- Express chạy trong 1 process PM2; app Next (khóa học) chạy riêng.
- Database 318 MB, sao lưu hằng ngày. **Thư mục `/storage` (ảnh Media Library, 89 MB) chưa được sao lưu.**
- `phamthanhbien.com` đi qua Cloudflare (proxy bật). HTML hiện không được cache (`cf-cache-status: DYNAMIC`).
- Lưu lượng: khoảng 8.900 lượt xem trang trong 30 ngày.

## 2. Mục tiêu

1. Blog đạt các chuẩn SEO kỹ thuật ngay khi ra mắt: tốc độ, thẻ meta, dữ liệu có cấu trúc, sitemap, đường dẫn sạch, không trùng lặp.
2. Người viết soạn bài trong admin. Hệ thống tự kiểm tra các quy tắc SEO và chỉ ra chỗ cần sửa.
3. Giữ được thứ hạng của 17 bài cũ: chuyển nội dung và ảnh, chuyển hướng 301 từng đường dẫn cũ.
4. Chịu được lúc lượng truy cập tăng đột biến (quảng cáo, bài lan truyền, bot quét) mà không ảnh hưởng tới form đăng ký và khóa học.

## 3. Cấu trúc đường dẫn

| Trang | Đường dẫn | Index |
|---|---|---|
| Danh sách bài | `/blog`, trang 2 trở đi: `/blog/trang/2` | Có |
| Bài viết | `/blog/<slug>` | Có (trừ bài đặt noindex) |
| Chuyên mục | `/blog/chu-de/<slug>` | Có, nếu có từ 3 bài trở lên |
| Tag | `/blog/tag/<slug>` | **Không** (noindex, follow), để tránh trang mỏng và trùng nội dung |
| Tác giả | `/blog/tac-gia/<slug>` | Có (E-E-A-T: tiểu sử, kinh nghiệm, mạng xã hội) |
| RSS | `/blog/feed.xml` | — |
| Sitemap | `/sitemap.xml` → `sitemap-pages.xml`, `sitemap-blog.xml` | — |

Quy tắc chung:
- Slug viết thường, không dấu, nối bằng `-`, không ngày tháng, nên dưới 6 từ.
- Đường dẫn không có `/` ở cuối: `/blog/abc/` chuyển 301 sang `/blog/abc`, và một trang chỉ có một địa chỉ.
- Tham số theo dõi (`utm_*`, `fbclid`...) không tạo trang mới: canonical luôn là địa chỉ sạch.
- **Đổi slug thì tự tạo 301** từ slug cũ, lưu trong bảng lịch sử slug. Link cũ không bao giờ thành 404.
- Bài bị xóa trả **410 Gone** (Google gỡ nhanh hơn 404), hoặc chuyển 301 sang một bài thay thế nếu có.

**Đường dẫn cũ của WordPress** (dùng bảng Redirect có sẵn):

| Cũ | Mới |
|---|---|
| `/<slug>/` của 17 bài | `/blog/<slug>` (301) |
| `/blog/`, `/blog/page/2/` | `/blog`, `/blog/trang/2` |
| `/category/kien-thuc-dau-tu/` | `/blog/chu-de/kien-thuc-dau-tu` |
| `/author/...` | `/blog/tac-gia/pham-thanh-bien` |
| `/feed/`, `/<slug>/feed/` | `/blog/feed.xml` |
| trang đính kèm `/<slug>/<ảnh>/` | về bài chứa ảnh |
| `/wp-content/uploads/...` (ảnh đã chép) | đường dẫn ảnh mới (301) |

## 4. Dữ liệu (migration 019)

- **`blog_posts`**: giữ các cột cũ và thêm:
  - nội dung: `content_json` (bản gốc của trình soạn), `content_html` (đã lọc an toàn, dùng để hiển thị);
  - SEO: `seo_title`, `meta_description`, `focus_keyword`, `canonical_url` (để trống = chính nó), `robots` (`index` / `noindex`);
  - ảnh: `og_image`, cùng `cover_alt`, `cover_width`, `cover_height` cho ảnh bìa;
  - trạng thái: `draft` / `scheduled` / `published` / `archived`, cùng `published_at`, `scheduled_at`, `content_updated_at` (ngày "cập nhật" hiển thị cho người đọc, chỉ đổi khi sửa nội dung thật);
  - quan hệ: `author_id`, `category_id`;
  - tự tính: `word_count`, `reading_minutes`;
  - nguồn: `wp_id` (bài chuyển từ WordPress).
- **`blog_categories`**: tên, slug, mô tả, tiêu đề/mô tả SEO.
- **`blog_tags`** và **`blog_post_tags`**.
- **`blog_authors`**: tên, slug, ảnh, tiểu sử, chức danh, link mạng xã hội (`sameAs` trong schema). Có thể nối với tài khoản admin.
- **`blog_slug_history`**: slug cũ → bài. Dùng cho 301 tự động.
- **`blog_revisions`**: bản lưu mỗi lần bấm Lưu/Đăng, kèm người sửa. Giữ 50 bản gần nhất mỗi bài, khôi phục được.

## 5. Trang công khai

Dựng HTML ngay trên server (Express), giống các trang website khác. Không cần JavaScript để đọc bài, nên Google đọc đủ ngay lần đầu và tải nhanh.

**Thẻ `<head>` của mỗi bài**
- `<title>`: `seo_title`, hoặc tiêu đề bài, kèm ` | Phạm Thành Biên`. Mục tiêu dưới 60 ký tự.
- `meta description`: 120–160 ký tự. Để trống thì lấy tóm tắt.
- `link rel=canonical`: địa chỉ sạch trên `SITE_URL`.
- `meta robots`: index/noindex theo bài. Thêm `max-image-preview:large`, để ảnh lớn hiện ở Google Discover.
- Open Graph:
  - `og:type=article`, `og:title`, `og:description`;
  - `og:image` cỡ 1200×630, vừa với Facebook và Zalo;
  - `article:published_time`, `article:modified_time`, `article:section`.
  - Thêm Twitter card.
- `html lang="vi"`.

**Dữ liệu có cấu trúc (JSON-LD)**
- Bài: `BlogPosting`:
  - headline, image, datePublished, dateModified;
  - author (`Person`, có `url` tới trang tác giả và `sameAs`);
  - publisher (`Organization` VINMOC, kèm logo);
  - mainEntityOfPage.
- Mọi trang blog: `BreadcrumbList` (Trang chủ › Blog › Chuyên mục › Bài).
- Danh sách và chuyên mục: `CollectionPage` + `ItemList`. Trang tác giả: `ProfilePage`.
- Không dùng `FAQPage`: từ 2023 Google chỉ hiện kết quả FAQ cho trang chính phủ và y tế.

**Nội dung bài**
- HTML đúng ngữ nghĩa:
  - `header`, `nav`, `main`, `article`, `aside`, `footer`;
  - mỗi trang đúng **một H1**, các tiêu đề con H2/H3 không nhảy cấp;
  - `<time datetime>` cho ngày đăng và ngày cập nhật.
- Mục lục tự động từ H2/H3, mỗi mục có liên kết neo `#...`. Bài từ 800 chữ thì hiện mặc định.
- Breadcrumb, khung tác giả, khoảng 3–4 bài liên quan (cùng chuyên mục, rồi đến cùng tag), bài trước/sau.
- Khối CTA chèn được giữa bài: tới Trading, Dòng Tiền, buổi Zoom. Link nội bộ giúp SEO và ra lead.
- Link ra ngoài: `rel="noopener"`. Link quảng cáo/tài trợ: `rel="sponsored nofollow"`, đánh dấu trong trình soạn.
- Video YouTube: chỉ hiện ảnh xem trước, bấm mới tải trình phát. Như vậy không kéo chậm trang.
- Bộ lọc HTML phía server (danh sách thẻ cho phép) trước khi lưu và hiển thị, để chặn chèn mã độc (XSS). Dùng `sanitize-html` (mục 12).

**Tốc độ (Core Web Vitals)**
- Mục tiêu: LCP < 2,5 s, CLS < 0,1, INP < 200 ms trên di động. Lighthouse SEO 100, Performance ≥ 90.
- CSS riêng cho blog: nhỏ, phần cần cho màn hình đầu đặt thẳng trong trang, phần còn lại cache lâu dài.
- Ảnh:
  - WebP nhiều cỡ (`srcset` / `sizes`), luôn có `width` / `height` để trang không nhảy;
  - ảnh bìa (thường là LCP) tải ưu tiên (`fetchpriority=high`), các ảnh khác `loading=lazy`.
- Font: font hệ thống, hoặc font tự host với `font-display: swap`. Không tải font từ Google, để tránh thêm một kết nối ngoài.
- Blog **không gắn Meta Pixel / GTM** (chốt 26/10): chỉ đo lượt xem nội bộ bằng `events` có sẵn, nên trang nhẹ hơn và không cần banner cookie quảng cáo.

**Trang và file phụ**
- `robots.txt`:
  - cho phép toàn site;
  - chặn `/admin`, `/api`, `/zoom/vao-hoc/`, các trang cảm ơn;
  - dòng `Sitemap:` dùng `SITE_URL`.
- Trang cảm ơn của các phễu: thêm `noindex`. Hiện chưa có.
- `sitemap.xml`:
  - chỉ gồm trang index được, với `lastmod` thật và ảnh của bài (image sitemap);
  - tự cập nhật khi đăng hoặc sửa bài;
  - gồm cả trang phễu và trang website công khai.
- `/blog/feed.xml` (RSS 2.0): 20 bài mới nhất.
- 404 có giao diện và gợi ý bài, nhưng **trả đúng mã 404**, không trả 200.
- IndexNow: báo Bing/Cốc Cốc ngay khi đăng hoặc sửa bài. Google không dùng IndexNow, nên với Google sẽ gửi sitemap qua Search Console.

## 6. Admin: soạn và quản lý bài

Làm thành một mục mới **Blog** trong admin React, theo design system đang dùng. Mục Blog cũ trong `cms.html` sẽ bỏ.

**Trình soạn: TipTap 3** (nền ProseMirror, giấy phép MIT, kể cả các phần mở rộng Mục lục, mã định danh tiêu đề, kéo thả khối; xem mục 12)
- Đóng gói chung vào bundle admin, không tải từ CDN. Chỉ tải khi mở trình soạn.
- Ra HTML sạch, kèm bản JSON để sửa lại không bị vỡ.
- Có: H2–H4, danh sách, trích dẫn, bảng, ảnh từ Media Library (bắt buộc nhập alt), video YouTube, khối CTA, khối ghi chú, link nội bộ (gõ để tìm bài/trang), dán từ Word/Google Docs (tự làm sạch định dạng).
- Không cho chọn H1 trong bài: H1 là tiêu đề bài.

So với các lựa chọn khác:
- Quill hiện tại: bản 1.x đã cũ, khó thêm khối riêng.
- Editor.js: ra dữ liệu dạng khối, phải tự dựng HTML.
- Lexical: mạnh nhưng ít sẵn tính năng hơn.

**Màn hình**
- **Danh sách bài**: lọc theo trạng thái, chuyên mục, tác giả; tìm theo tiêu đề; xem điểm SEO, ngày đăng, lượt xem 30 ngày (lấy từ `events`).
- **Soạn bài**:
  - Bên trái là nội dung.
  - Bên phải là các thẻ: *Đăng bài* (trạng thái, hẹn giờ, chuyên mục, tag, tác giả, ảnh bìa + alt), *SEO*, *Mạng xã hội*, *Lịch sử*.
  - Tự lưu bản nháp mỗi 10 giây.
  - Cảnh báo khi hai người cùng sửa một bài: so `updated_at`, không ghi đè lặng lẽ.
  - **Xem trước** bản nháp bằng link có mã bí mật, có hạn 24 giờ. Link này luôn `noindex`.
- **Chuyên mục, Tag, Tác giả**: thêm, sửa, gộp tag.

**Thẻ SEO: kiểm tra ngay khi gõ**
- Xem trước kết quả Google trên máy tính và điện thoại. Độ dài tiêu đề và mô tả đo theo **pixel** (giống cách Google cắt), không theo số ký tự.
- Nút "Tạo tự động" cho tiêu đề SEO, mô tả và slug: lấy từ tiêu đề, tóm tắt hoặc đoạn đầu. Người viết sửa lại nếu cần.
- Xem trước khi chia sẻ lên Facebook/Zalo.
- Mỗi quy tắc có mức Đạt / Nên sửa / Lỗi, cộng lại thành điểm. Chỉ chặn đăng khi có **lỗi nặng**:

| Quy tắc | Mức |
|---|---|
| Có tiêu đề; slug hợp lệ và chưa bị dùng | Lỗi (chặn đăng) |
| Ảnh bìa có alt | Lỗi (chặn đăng) |
| Không có H1 trong nội dung; tiêu đề con không nhảy cấp (H2 → H4) | Lỗi (chặn đăng) |
| Tiêu đề SEO 30–60 ký tự (≤ 580 px) | Nên sửa |
| Mô tả 120–160 ký tự (≤ 920 px) | Nên sửa |
| Từ khóa chính có trong tiêu đề, slug, đoạn đầu, ít nhất một H2, mô tả | Nên sửa (mỗi chỗ một dòng) |
| Từ khóa chính chưa được bài khác dùng (tránh hai bài tranh nhau một từ khóa) | Nên sửa |
| Từ 600 chữ trở lên (dưới 300 chữ: đề xuất noindex) | Nên sửa |
| Mọi ảnh trong bài có alt | Nên sửa |
| Ít nhất 2 link nội bộ, 1 link ra nguồn uy tín | Nên sửa |
| Đoạn văn không quá 150 chữ; câu không quá 35 chữ | Nên sửa |
| Slug dưới 75 ký tự, không có từ thừa | Nên sửa |
| Ảnh chia sẻ đủ 1200×630 | Nên sửa |

**Quyền** (chốt 26/10): giai đoạn đầu chỉ **admin** soạn và đăng bài. Admin thêm, sửa, xóa **người viết** (tác giả hiển thị trên bài: tên, ảnh, tiểu sử, chức danh, mạng xã hội) trong mục Blog > Tác giả. Người viết không phải tài khoản đăng nhập. Vai trò Biên tập để sau, khi có người viết riêng. Sale không thấy mục Blog.

## 7. Chuyển 17 bài từ WordPress

Viết một script chạy được nhiều lần (giống `wp-leads.cjs`), đọc bản sao lưu ngay trên máy:
1. Đọc bài, chuyên mục và ảnh bìa từ database WordPress.
2. Làm sạch HTML (bỏ shortcode và comment block của WordPress), chuyển sang định dạng của TipTap.
3. Tải ảnh trong bài và ảnh bìa từ `phamthanhbien.com/wp-content/uploads/...` (GET công khai) vào `/storage/blog/`, tạo WebP, thay đường dẫn trong bài.
4. Giữ đúng ngày đăng gốc. Tác giả: Phạm Thành Biên.
5. Tạo các redirect ở mục 3 và báo cáo bài nào cần xem lại.

Đề xuất xử lý theo chất lượng (cần bạn chọn, mục 11):
- 11 bài từ 700 chữ trở lên: chuyển nguyên, rồi bổ sung tiêu đề/mô tả SEO.
- 5 bài dưới 400 chữ (chiến lược doanh thu, tư duy đầu tư, chứng khoán 2022...): chuyển, đặt **noindex** cho tới khi viết thêm.
- "Tỷ phú & Lão ăn mày" (0 chữ): xem nội dung thật, nếu chỉ có video thì viết thêm mô tả hoặc bỏ (410).
- `/platinum/` (bản tin miễn phí): không phải bài viết. Chuyển hướng tới một phễu, hoặc làm trang riêng.

## 8. Hạ tầng

**Ước tính tải**
- Lưu lượng hiện tại rất nhỏ: khoảng 0,003 lượt/giây trung bình.
- Giả sử blog đạt 100.000 lượt xem/tháng: vẫn chưa tới 0,05 lượt/giây trung bình, đỉnh có thể 20–50 lượt/giây khi chạy quảng cáo hoặc có bài lan truyền.
- Một trang blog dựng sẵn trong bộ nhớ trả về dưới 5 ms, nên **VPS hiện tại thừa sức, không cần máy mới**. Rủi ro thật nằm ở chỗ khác: bot quét và lúc tăng đột biến dồn vào cùng process Node đang xử lý form đăng ký.

**Cache nhiều lớp**
1. **Trong app**: HTML của mỗi trang blog được giữ trong bộ nhớ (giới hạn khoảng 50 MB), xóa đúng trang liên quan khi đăng hoặc sửa bài. Database chỉ bị hỏi khi cache trống.
2. **Header HTTP**: `Cache-Control: public, max-age=300, s-maxage=3600, stale-while-revalidate=86400` cùng `ETag` / `Last-Modified`, để trình duyệt và Google nhận 304 khi trang không đổi.
3. **Cloudflare**: thêm Cache Rule cache HTML cho `/blog*` (bỏ qua khi có cookie admin hoặc link xem trước). Khi đăng/sửa bài:
   - nếu có API token của Cloudflare (chỉ quyền xóa cache của zone này): hệ thống tự xóa cache trang đó;
   - nếu không có: để thời gian cache ngắn (5 phút) là đủ.

   Cách này giúp phần lớn lượt đọc không chạm tới VPS.
4. **Ảnh và file tĩnh**: để nginx phục vụ thẳng `/storage` và `/p/...`, có header cache 1 năm (file có tên duy nhất). Hiện Node phục vụ các file này. Cloudflare tự cache ảnh theo đuôi file.

**Việc cần quyền root VPS** (gộp chung với bước 4.3)
- **Thêm 2 GB swap.** Máy đang không có swap, trong khi mỗi lần build Next dùng tới 1,5 GB RAM. Swap là lưới an toàn để không bị tắt process khi thiếu RAM.
- Cấu hình nginx: phục vụ thẳng `/storage`, gzip cho XML/SVG, header bảo mật (HSTS sau khi SSL ổn định).
- Brotli: tùy chọn. Cloudflare đã nén Brotli giữa Cloudflare và người đọc.

**Sao lưu**: thêm sao lưu thư mục `/storage` (ảnh blog và Media Library) vào cron hằng đêm có sẵn, giữ 7 bản. Kéo về máy cùng lịch hằng tuần. Hiện thư mục này **chưa có bản sao lưu nào**.

**Theo dõi**
- Google Search Console và Bing Webmaster cho tên miền chính, gửi sitemap.
- Theo dõi 404 trong 1–2 tuần sau khi chuyển: thêm báo cáo 404 vào Admin > Redirect, dựa trên log có sẵn.
- Kiểm tra uptime miễn phí (UptimeRobot hoặc Better Stack) cho `/`, `/blog`, `/sitemap.xml`.
- Báo cáo lượt xem theo bài trong admin: dùng `events` có sẵn, không cần công cụ mới.

**Không chọn**
- Dựng blog trong app Next (ISR): app Next hiện chỉ cho khóa học, còn database, Media Library, Redirect đều nằm ở Express. Làm ở Express gọn hơn, chỉ một chỗ.
- Headless CMS bên ngoài (Strapi, Ghost...): thêm một dịch vụ phải vận hành và sao lưu, không cần ở quy mô này.

## 9. Ra mắt

- Làm xong trên `event.` nhưng **để noindex** cho tới khi đổi tên miền, để Google không lập chỉ mục blog trên địa chỉ tạm rồi phải chuyển lại.
- Ở bước 4.5 (đổi DNS):
  - bỏ noindex;
  - redirect từ đường dẫn WordPress cũ có hiệu lực ngay;
  - gửi sitemap lên Search Console;
  - dùng công cụ "Kiểm tra URL" cho 17 bài.
- Theo dõi 2–4 tuần: thứ hạng 17 bài cũ trong Search Console (số lần hiển thị, số lần nhấp), lỗi lập chỉ mục, 404.

## 10. Các bước và ước tính

| Bước | Nội dung | Ước tính |
|---|---|---|
| B1 | Migration 019; trang công khai (danh sách, bài, chuyên mục, tag, tác giả); thẻ meta, JSON-LD, sitemap, robots, RSS, 404/410, 301 khi đổi slug; cache trong app; noindex trang cảm ơn | 2–3 ngày |
| | **B1 xong trên máy 26/10, chưa deploy**: `db/migrations/019_blog.sql`, `src/blog/` (content, repository, seo, render, feeds), `src/routes/blog.js`; blog cũ trong `pages.js` bỏ (in HTML không lọc); trang cảm ơn luôn noindex; test `scripts/test-blog.cjs`. Lighthouse di động trên bài mẫu: Performance 96, Accessibility 100, Best Practices 100, SEO 100 khi bật `BLOG_INDEXING` (69 khi noindex, đúng thiết kế). Ảnh WebP nhiều cỡ và ảnh OG tự tạo làm ở B2 (cần `sharp`). | |
| B2 | Mục Blog trong admin: TipTap, Media Library, thẻ SEO và các quy tắc, xem trước, hẹn giờ, tự lưu, lịch sử, vai trò Biên tập; bỏ mục Blog cũ của CMS | 3–4 ngày |
| | **B2 xong trên máy 26/10, chưa deploy**: mục Blog trong admin (`src/admin/blog.js`, trình soạn TipTap 3 tách riêng `public/admin/blog-editor.js` ~144 KB nén, chỉ tải khi mở bài); API `/admin/blog/*` (`src/routes/blogAdmin.js`, `src/blog/admin.js`); bộ quy tắc SEO dùng chung server/admin (`src/blog/seoRules.js`, đo pixel); tự lưu nháp vào `draft` (bài đang đăng không đổi cho tới khi Lưu/Cập nhật), chống ghi đè bằng `version`; slug cũ của bài đã đăng tự 301; lịch sử 50 bản; link xem trước ký 24 giờ; ảnh do trình duyệt tạo bản WebP 640/1280 (server không cần `sharp`), trang công khai dùng `srcset`; ảnh chia sẻ 1200×630 vẽ trong trình duyệt; chuyên mục, tag (gộp), tác giả. Bỏ `public/cms.html` (`/admin/cms` chuyển sang Media Library). Test: `scripts/test-blog.cjs`, `tests/admin-ui.spec.cjs` (Blog), kiểm tra Postgres cho admin và trang công khai. | |
| B3 | Script chuyển 17 bài + ảnh + redirect; báo cáo bài cần xem lại | 1 ngày |
| | **B3 xong trên máy 26/10, chưa deploy**: `scripts/wp-posts.cjs` (prepare trên máy từ bản sao lưu 26/10: 16 bài, 37 ảnh gốc + WebP 640/1280, 9,2 MB; apply trên server, chạy lại an toàn). Bài "Tỷ phú & Lão ăn mày" (nội dung Thrive, rỗng trong bảng bài) lấy bản lưu gần nhất: 857 chữ. Noindex (dưới 400 chữ): chứng khoán 2022, 6 chiến lược tăng trưởng doanh thu, 6 tư duy đầu tư. `/platinum` → `/trading`. 23 redirect (16 bài, chuyên mục, tác giả, `/feed`, `/blog/page/2`). Mô tả Yoast giữ lại cho cả 16 bài. Làm sạch: bỏ comment block/shortcode, tách đoạn bài kiểu cũ, tiêu đề từ H2 không nhảy cấp, thêm dấu cách bị mất, link nội bộ → `/blog/...`. Lighthouse di động bài thật: Performance/Accessibility/Best Practices 100, CLS 0, LCP 1,1–1,7 s. Test `scripts/test-wp-posts.cjs`. | |
| B4 | Sao lưu `/storage`; header cache; chuẩn bị cấu hình nginx, swap, Cache Rule Cloudflare để người có quyền chạy | 0,5–1 ngày (+ việc của người có quyền) |
| B5 | Ra mắt cùng bước 4.5; Search Console, Bing; theo dõi | cùng ngày đổi tên miền |

Mỗi bước có test (tự động và trình duyệt) và được deploy riêng, như các lần trước. B1 và B2 deploy lên `event.` ở trạng thái noindex để bạn dùng thử.

## 11. Quyết định (chốt 26/10)

1. **Đường dẫn**: `/blog/<slug>`, 301 từ đường dẫn cũ. Tiền tố `blog` là một hằng số trong code (không phải tùy chọn trong admin). Nếu sau này đổi, hệ thống tự 301 toàn bộ tiền tố cũ.
2. **Người viết**: chỉ admin soạn và đăng. Admin quản lý danh sách tác giả (thêm, sửa, xóa). Vai trò Biên tập để sau.
3. **Index**: sau khi đổi tên miền. Trước đó blog trên `event.` để noindex.
4. **Bài cũ**: xử lý theo chất lượng như mục 7.
5. **Cloudflare**: chưa chốt. Xem giải thích trong câu trả lời ngày 26/10. Bước B1–B3 không phụ thuộc điểm này.
6. **Theo dõi**: chỉ đo nội bộ, không Pixel/GTM trên blog.
7. **Bình luận**: không làm.
8. **Bản cho AI**: có, gồm `/llms.txt` và bản Markdown cho mỗi bài.
9. **Ảnh chia sẻ tự tạo**: có.

## 12. Học từ cộng đồng GitHub (tra cứu 26/10/2026)

Số sao và ngày cập nhật lấy từ GitHub API ngày 26/10/2026.

**Các hệ thống blog/CMS có sẵn SEO: học cách làm, không dùng nguyên**

| Repo | Sao | Học được gì | Áp dụng |
|---|---|---|---|
| [TryGhost/Ghost](https://github.com/TryGhost/Ghost) | 55,6k | Lớp `frontend/meta` dựng thẻ meta theo chuỗi dự phòng (tiêu đề SEO → tiêu đề; mô tả → tóm tắt → tóm tắt tự cắt); JSON-LD `Article` có publisher kèm logo, author kèm `sameAs`; trang xem trước luôn `noindex`; sitemap chia theo loại (bài, trang, tag, tác giả), `lastmod` = ngày sửa, có ảnh, bỏ URL có canonical khác; mỗi bài có bản Markdown (`rel="alternate" type="text/markdown"`) cho công cụ AI | Chép cách tổ chức và các chuỗi dự phòng; thoát ký tự `</script>` trong JSON-LD; thêm bản Markdown và `/llms.txt` (tùy chọn) |
| [payloadcms/payload](https://github.com/payloadcms/payload) (plugin SEO) | 45,5k | Nhóm trường meta (tiêu đề, mô tả, ảnh) kèm bộ đếm và xem trước kết quả tìm kiếm cập nhật khi gõ; nút tạo tự động có thể tùy biến | Thêm nút "Tạo tự động" (mục 6) |
| [Yoast/wordpress-seo](https://github.com/Yoast/wordpress-seo) (gói `yoastseo`) | — | Bộ quy tắc phân tích SEO và độ dễ đọc chuẩn mực: từ khóa ở tiêu đề, slug, đoạn đầu, tiêu đề con, mô tả; độ dài câu và đoạn; ảnh có alt; link nội bộ/ngoài; đo tiêu đề theo pixel | **Không dùng thư viện**: giấy phép GPL-3.0 (buộc mở mã phần dùng chung) và **không hỗ trợ tiếng Việt**. Tự viết bộ quy tắc ở mục 6 theo đúng các ngưỡng này |
| [satnaing/astro-paper](https://github.com/satnaing/astro-paper) | 5,2k | Tự tạo ảnh chia sẻ (OG) từ tiêu đề bằng Satori + Sharp; tìm kiếm tĩnh Pagefind; kiểm tra với trình đọc màn hình; mục lục thu gọn | **Tự tạo ảnh OG 1200×630** khi bài không có ảnh chia sẻ (mẫu thương hiệu Phạm Thành Biên). Tìm kiếm trong blog: để sau, khi có nhiều bài |
| [strapi/strapi](https://github.com/strapi/strapi), [decaporg/decap-cms](https://github.com/decaporg/decap-cms), [wagtail/wagtail](https://github.com/wagtail/wagtail) | 73k / 19k / 21k | CMS đầy đủ, nhưng thêm một dịch vụ riêng phải vận hành và sao lưu | Không chọn, giữ quyết định ở mục 8 |

**Thư viện sẽ dùng** (đều MIT/Apache, đang được cập nhật)

| Việc | Thư viện | Ghi chú |
|---|---|---|
| Trình soạn | [ueberdosis/tiptap](https://github.com/ueberdosis/tiptap) 3.32 (38,9k sao) | Bản npm 3.32 của `extension-table-of-contents`, `extension-unique-id`, `extension-drag-handle`, `extension-table`, `extension-youtube`, `extension-image` đều **MIT**. Trước đây đây là các gói Pro, nay dùng tự do |
| Lọc HTML chống XSS | `sanitize-html` 2.18 | Repo riêng [apostrophecms/sanitize-html](https://github.com/apostrophecms/sanitize-html) đã được lưu trữ, nhưng gói npm vẫn ra bản mới (20/10/2026). Nhẹ, chạy trên server, lọc theo danh sách cho phép. Dự phòng: [cure53/DOMPurify](https://github.com/cure53/DOMPurify) (17,5k sao) qua `isomorphic-dompurify`, nhưng cần thêm jsdom, nặng RAM hơn |
| Sitemap | [ekalinin/sitemap.js](https://github.com/ekalinin/sitemap.js) | Ghi XML dạng luồng, hỗ trợ ảnh và chia nhiều file khi quá 50.000 URL |
| RSS | [jpmonette/feed](https://github.com/jpmonette/feed) | RSS 2.0, Atom và JSON Feed từ một nguồn |
| Video nhẹ | [paulirish/lite-youtube-embed](https://github.com/paulirish/lite-youtube-embed) | Chỉ tải trình phát YouTube khi bấm; giữ tốc độ trang |
| Slug tiếng Việt | [sindresorhus/slugify](https://github.com/sindresorhus/slugify) | Bỏ dấu, `đ` → `d`; sẽ có test riêng cho tiếng Việt |
| Ảnh | [lovell/sharp](https://github.com/lovell/sharp) | WebP nhiều cỡ và ảnh OG tự tạo |
| Kiểm tra SEO và tốc độ tự động | [harlan-zw/unlighthouse](https://github.com/harlan-zw/unlighthouse), [GoogleChrome/lighthouse-ci](https://github.com/GoogleChrome/lighthouse-ci) | Chạy Lighthouse cho mọi URL blog trước mỗi lần deploy; đặt ngưỡng (SEO 100, Performance ≥ 90), không đạt thì không deploy |
| Kiểu dữ liệu schema.org | [google/schema-dts](https://github.com/google/schema-dts) | Chỉ dùng làm tài liệu tham chiếu (dự án viết bằng JS, không phải TS) |

**Đối chiếu với hướng dẫn của Google**
- `BlogPosting` [không có thuộc tính bắt buộc](https://developers.google.com/search/docs/data-types/article). `author` và `author.url` được khuyến nghị, và nên trỏ tới trang tiểu sử. Điều này khớp với trang tác giả ở mục 3.
- `llms.txt`: chưa có tuyên bố chính thức nào của Google. Tác dụng tới AI Overviews chưa được chứng minh. Chi phí làm thấp, nên để **tùy chọn**: một file `/llms.txt` và bản Markdown cho mỗi bài, sinh tự động.

**Thay đổi so với bản đầu**
1. Bộ phân tích SEO tự viết theo quy tắc của Yoast, không dùng thư viện `yoastseo` (GPL, không có tiếng Việt).
2. Thêm tự tạo ảnh chia sẻ 1200×630 cho bài không có ảnh (học AstroPaper).
3. Thêm nút "Tạo tự động" cho tiêu đề SEO, mô tả và slug (học Payload).
4. Thêm Lighthouse tự động cho mọi URL blog trước khi deploy (Unlighthouse / Lighthouse CI).
5. Tùy chọn: bản Markdown cho mỗi bài và `/llms.txt` (học Ghost).
6. Dùng TipTap 3 bản MIT đầy đủ (mục lục và mã định danh tiêu đề có sẵn, không phải tự viết).
