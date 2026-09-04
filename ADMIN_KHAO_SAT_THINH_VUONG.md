# TÀI LIỆU KỸ THUẬT API & QUY TRÌNH HỆ THỐNG QUẢN LÝ KHẢO SÁT HỌC VIỆN THỊNH VƯỢNG
## (ACADEMIC SURVEY CMS - 3 TAB CHỨC NĂNG CHÍNH)

Tài liệu này tổng hợp toàn bộ thông số kỹ thuật API, luồng dữ liệu và cấu trúc Request/Response chi tiết cho **3 Tab Quản lý chính** của hệ thống Khảo sát Học viện Thịnh Vượng (Academic Survey Admin). Được thiết kế riêng để các **AI Agent Coding** có thể đọc, hiểu và lập trình giao diện/API tích hợp chính xác 100%.

---

## 1. TỔNG QUAN CẤU TRÚC GIAO DIỆN & LUỒNG HOẠT ĐỘNG (WORKFLOW)

Hệ thống Quản lý Khảo sát Học viện được chia làm **3 Tab chức năng chính**:

1. **Tab 1: Tổng quan (Overview)**
   - Hiển thị các chỉ số KPI tổng hợp: Tổng số học viên, Tổng phiên học (sessions), Tỷ lệ hoàn thành tất cả bài học (Completion Rate), Tổng số câu trả lời khảo sát.
   - Thống kê tỷ lệ học viên theo khu vực địa lý (`region`) và mối quan tâm (`interest`).
   - Thống kê tiến độ xem bài giảng của học viên (Số lượng đã xem, Thời lượng xem trung bình `watch_time`).

2. **Tab 2: Thống kê người dùng (126)**
   - Danh sách phân trang danh sách học viên đăng ký tham gia khảo sát/học bài.
   - Bộ lọc đa tiêu chí: Tìm kiếm (Tên/Email/SĐT), Khu vực (`region`), Bài giảng (`lesson_id`), Trạng thái tiến độ bài học (`lesson_status`).
   - Xem chi tiết tiến độ từng học viên: Số bài học đã bắt đầu, đã hoàn thành, thời lượng video đã xem (% tiến độ xem video), trạng thái đã làm câu hỏi khảo sát (`has_survey_answer`).

3. **Tab 3: Danh sách bài giảng (7)**
   - Quản lý danh sách các bài học video (Vimeo integration) & Câu hỏi khảo sát ẩn (`hidden_content`).
   - CRUD bài giảng: Thêm mới bài giảng, Chỉnh sửa thông tin bài giảng, Xóa bài giảng.
   - Thay đổi thứ tự hiển thị bài giảng (Reorder drag-and-drop).
   - Tích hợp API Vimeo: Tự động tải thông tin video từ Vimeo ID, Đồng bộ & Import danh sách video từ kênh Vimeo.

---

## 2. QUY CHUẨN KỸ THUẬT API (API SPECIFICATIONS)

### 2.1. Base URL & Authentication Headers

- **Base URL:** `https://ebila.ai/academic-survey` (hoặc `${NEXT_PUBLIC_API_BASE_URL}/academic-survey`)
- **Headers bắt buộc trong mọi Request:**

| Header Name | Value | Description |
| :--- | :--- | :--- |
| `Content-Type` | `application/json` | Định dạng dữ liệu gửi |
| `VINMOC-TOKEN` | `<AUTH_TOKEN>` | Bearer token người dùng đã đăng nhập |
| `api-key` | `<API_KEY>` | Mã API Key định danh hệ thống |

---

### 2.2. Khung Phản Hồi Chuẩn (ApiResponse Wrapper)

```json
{
  "success": true,
  "message": "Thành công",
  "data": { ... },
  "errorCode": null
}
```

---

## 3. CHI TIẾT API THEO 3 TAB CHỨC NĂNG

---

### 🔵 TAB 1: TỔNG QUAN (OVERVIEW)

#### 1.1. API Lấy dữ liệu Thống kê Tổng quan (Stats Dashboard)
- **Method:** `GET`
- **URL Path:** `https://ebila.ai/academic-survey/api/admin/academic-survey/stats`
- **Mục đích:** Lấy toàn bộ dữ liệu thô phục vụ tính toán KPI, phân tích khu vực, mối quan tâm và thống kê học viên.

##### Request Parameters:
*Không có parameters.*

##### Response Mẫu (200 OK):
```json
{
  "success": true,
  "message": "Lấy dữ liệu thống kê tổng quan thành công",
  "data": {
    "users": [
      {
        "email": "nguyenvana@gmail.com",
        "fullName": "Nguyễn Văn A",
        "phone": "0987654321",
        "region": "Miền Bắc",
        "interest": "Bất động sản",
        "createdAt": "2026-07-01T08:30:00.000Z"
      },
      {
        "email": "lethib@gmail.com",
        "fullName": "Lê Thị B",
        "phone": "0912345678",
        "region": "Miền Nam",
        "interest": "Chứng khoán",
        "createdAt": "2026-07-02T10:15:00.000Z"
      }
    ],
    "sessions": [
      {
        "session_id": "sess_1001",
        "email": "nguyenvana@gmail.com",
        "watch_time": 450,
        "completed": true,
        "is_unlocked": true,
        "lesson": {
          "id": "lesson_1",
          "title": "Bài 1: Tư duy Quản lý Tài chính Thịnh Vượng",
          "video_id": "918273645",
          "unlock_after_seconds": 0,
          "duration": 600
        },
        "createdAt": "2026-07-01T09:00:00.000Z"
      }
    ],
    "answers": [
      {
        "session_id": "sess_1001",
        "email": "nguyenvana@gmail.com",
        "lesson_id": "lesson_1",
        "lesson_title": "Bài 1: Tư duy Quản lý Tài chính Thịnh Vượng",
        "answers": {
          "q1": "Phương án B",
          "q2": "Tôi chọn đầu tư an toàn"
        },
        "submittedAt": "2026-07-01T09:10:00.000Z"
      }
    ]
  },
  "errorCode": null
}
```

---

### 🟢 TAB 2: THỐNG KÊ NGƯỜI DÙNG (USER ANALYTICS & PROGRESS)

#### 2.1. API Lấy Danh sách Học viên Phân trang & Chi tiết Tiến độ
- **Method:** `GET`
- **URL Path:** `https://ebila.ai/academic-survey/api/admin/academic-survey/users`
- **Mục đích:** Hiển thị danh sách học viên kèm theo thống kê số bài học đã bắt đầu, số bài hoàn thành, thời gian xem video (%) và trạng thái trả lời khảo sát.

##### Query Parameters:
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `search` | String | No | Từ khóa tìm kiếm (Email, Họ tên, SĐT) |
| `region` | String | No | Lọc theo vùng miền (e.g. `Miền Bắc`, `Miền Nam`, `Miền Trung`) |
| `lesson_id` | String | No | Lọc theo ID bài giảng |
| `lesson_status` | String | No | Trạng thái bài học (`started`, `completed`, `not_started`) |
| `video_id` | String | No | Lọc theo Vimeo Video ID |
| `page` | Number | No | Trang số (bắt đầu từ 1, mặc định 1) |
| `size` | Number | No | Kích thước trang (mặc định 10 hoặc 20) |

##### Request Example:
`GET https://ebila.ai/academic-survey/api/admin/academic-survey/users?search=nguyen&region=Mi%E1%BB%81n%20B%E1%BA%AFc&page=1&size=10`

##### Response Mẫu (200 OK):
```json
{
  "success": true,
  "message": "OK",
  "data": {
    "users": [
      {
        "email": "nguyenvana@gmail.com",
        "fullName": "Nguyễn Văn A",
        "phone": "0987654321",
        "region": "Miền Bắc",
        "interest": "Bất động sản dòng tiền",
        "createdAt": "2026-07-01T08:30:00.000Z",
        "progress": {
          "started": 5,
          "completed": 5,
          "total_lessons": 7
        },
        "video_progress": {
          "watch_time": 2800,
          "duration": 3000,
          "is_completed": true,
          "pct": 93.33
        }
      }
    ],
    "total": 126,
    "page": 1,
    "size": 10,
    "total_pages": 13
  },
  "errorCode": null
}
```

---

#### 2.2. API Lấy Danh sách Phiên học (Sessions Tracker)
- **Method:** `GET`
- **URL Path:** `https://ebila.ai/academic-survey/api/admin/academic-survey/sessions`
- **Mục đích:** Truy vấn nhật ký phiên học từng bài giảng của học viên.

##### Query Parameters:
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `search` | String | No | Tìm kiếm theo Email hoặc Họ tên |
| `region` | String | No | Lọc theo khu vực |
| `lesson_id` | String | No | ID bài giảng cụ thể |
| `page` | Number | No | Trang số |
| `size` | Number | No | Số bản ghi trên mỗi trang |

##### Response Mẫu (200 OK):
```json
{
  "success": true,
  "message": "OK",
  "data": {
    "sessions": [
      {
        "session_id": "sess_2001",
        "email": "nguyenvana@gmail.com",
        "fullName": "Nguyễn Văn A",
        "phone": "0987654321",
        "region": "Miền Bắc",
        "watch_time": 540,
        "completed": true,
        "is_unlocked": true,
        "has_survey_answer": true,
        "lesson": {
          "id": "lesson_1",
          "title": "Bài 1: Tư duy Quản lý Tài chính Thịnh Vượng",
          "video_id": "918273645",
          "unlock_after_seconds": 0,
          "duration": 600
        },
        "createdAt": "2026-07-01T09:00:00.000Z"
      }
    ],
    "total": 350,
    "page": 1,
    "size": 10,
    "total_pages": 35
  },
  "errorCode": null
}
```

---

### 🟠 TAB 3: DANH SÁCH BÀI GIẢNG (LESSON MANAGEMENT & VIMEO INTEGRATION)

#### 3.1. API Lấy Danh sách Tất cả Bài giảng (7 bài)
- **Method:** `GET`
- **URL Path:** `https://ebila.ai/academic-survey/api/admin/academic-survey/lessons`

##### Response Mẫu (200 OK):
```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "id": "lesson_1",
      "title": "Bài 1: Tổng quan về Tự do Tài chính & Định vị Thịnh Vượng",
      "description": "Bài học nền tảng giúp bạn hiểu rõ bức tranh tài chính cá nhân.",
      "video_url": "https://vimeo.com/918273645",
      "thumbnail_url": "https://i.vimeocdn.com/video/123456789.jpg",
      "video_id": "918273645",
      "unlock_after_seconds": 0,
      "duration": 720,
      "position": 1,
      "is_visible": true,
      "show_unlock_time": true,
      "show_popup": true,
      "hidden_content": {
        "questions": [
          {
            "id": "q1",
            "type": "single_choice",
            "text": "Mục tiêu tài chính quan trọng nhất của bạn trong 3 năm tới là gì?",
            "options": [
              { "value": "opt1", "label": "Tích lũy tài sản an toàn" },
              { "value": "opt2", "label": "Gia tăng thu nhập thụ động" }
            ]
          }
        ]
      },
      "createdAt": "2026-06-15T00:00:00.000Z",
      "updatedAt": "2026-06-20T00:00:00.000Z"
    }
  ],
  "errorCode": null
}
```

---

#### 3.2. API Thêm Bài giảng Mới
- **Method:** `POST`
- **URL Path:** `https://ebila.ai/academic-survey/api/admin/academic-survey/lesson`
- **Request Body:**
```json
{
  "title": "Bài 8: Xây dựng Danh mục Đầu tư Cân bằng",
  "description": "Hướng dẫn phân bổ vốn hiệu quả giữa các kênh tài sản.",
  "video_id": "987654321",
  "video_url": "https://vimeo.com/987654321",
  "thumbnail_url": "https://i.vimeocdn.com/video/987654321.jpg",
  "unlock_after_seconds": 300,
  "duration": 900,
  "position": 8,
  "is_visible": true,
  "show_unlock_time": true,
  "show_popup": true,
  "hidden_content": {
    "questions": [
      {
        "id": "q_new_1",
        "type": "text",
        "text": "Nhập tỷ lệ phần trăm tài sản bạn sẵn sàng đầu tư vào mạo hiểm?"
      }
    ]
  }
}
```

##### Response Mẫu (200 OK):
```json
{
  "success": true,
  "message": "Tạo bài giảng mới thành công",
  "data": {
    "id": "lesson_8",
    "title": "Bài 8: Xây dựng Danh mục Đầu tư Cân bằng",
    "description": "Hướng dẫn phân bổ vốn hiệu quả giữa các kênh tài sản.",
    "video_id": "987654321",
    "unlock_after_seconds": 300,
    "duration": 900,
    "position": 8,
    "is_visible": true,
    "createdAt": "2026-07-22T10:00:00.000Z"
  },
  "errorCode": null
}
```

---

#### 3.3. API Cập nhật Bài giảng
- **Method:** `PUT`
- **URL Path:** `https://ebila.ai/academic-survey/api/admin/academic-survey/lesson/{id}`
- **Request Body:** (Truyền các trường cần cập nhật)
```json
{
  "title": "Bài 8: Xây dựng Danh mục Đầu tư Cân bằng (Cập nhật)",
  "unlock_after_seconds": 180,
  "is_visible": true
}
```

##### Response Mẫu (200 OK):
```json
{
  "success": true,
  "message": "Cập nhật bài giảng thành công",
  "data": {
    "id": "lesson_8",
    "title": "Bài 8: Xây dựng Danh mục Đầu tư Cân bằng (Cập nhật)",
    "unlock_after_seconds": 180,
    "is_visible": true,
    "updatedAt": "2026-07-22T10:15:00.000Z"
  },
  "errorCode": null
}
```

---

#### 3.4. API Xóa Bài giảng
- **Method:** `DELETE`
- **URL Path:** `https://ebila.ai/academic-survey/api/admin/academic-survey/lesson/{id}`

##### Response Mẫu (200 OK):
```json
{
  "success": true,
  "message": "Xóa bài giảng thành công",
  "data": {
    "success": true
  },
  "errorCode": null
}
```

---

#### 3.5. API Đổi thứ tự hiển thị Bài giảng (Reorder)
- **Method:** `PUT`
- **URL Path:** `https://ebila.ai/academic-survey/api/admin/academic-survey/lessons/reorder`
- **Request Body:**
```json
{
  "lesson_ids": [3, 1, 2, 4, 5, 6, 7]
}
```

##### Response Mẫu (200 OK):
```json
{
  "success": true,
  "message": "Sắp xếp lại thứ tự bài giảng thành công",
  "data": true,
  "errorCode": null
}
```

---

#### 3.6. API Tải Thông tin Video từ Vimeo (Fetch Metadata)
- **Method:** `POST`
- **URL Path:** `https://ebila.ai/academic-survey/api/admin/academic-survey/vimeo/fetch-video`
- **Request Body:**
```json
{
  "video_id": "918273645"
}
```

##### Response Mẫu (200 OK):
```json
{
  "success": true,
  "message": "Lấy thông tin video Vimeo thành công",
  "data": {
    "video_id": "918273645",
    "title": "Tư duy Quản lý Tài chính Thịnh Vượng HĐ 2026",
    "description": "Mô tả chi tiết tải về trực tiếp từ Vimeo API...",
    "duration": 720
  },
  "errorCode": null
}
```

---

#### 3.7. API Lấy Danh sách Video từ Kênh Vimeo (Get Vimeo Videos)
- **Method:** `GET`
- **URL Path:** `https://ebila.ai/academic-survey/api/admin/academic-survey/vimeo/videos`

##### Response Mẫu (200 OK):
```json
{
  "success": true,
  "message": "OK",
  "data": [
    {
      "video_id": "918273645",
      "title": "Bài 1: Tổng quan Tự do tài chính",
      "description": "Mô tả video trên vimeo...",
      "duration": 600,
      "thumbnail": "https://i.vimeocdn.com/video/123456.jpg"
    }
  ],
  "errorCode": null
}
```

---

#### 3.8. API Import Hàng loạt Video từ Vimeo (Batch Import)
- **Method:** `POST`
- **URL Path:** `https://ebila.ai/academic-survey/api/admin/academic-survey/vimeo/import`
- **Request Body:**
```json
[
  {
    "video_id": "918273645",
    "title": "Bài 1: Tư duy Thịnh Vượng",
    "duration": 600,
    "description": "Chi tiết bài học...",
    "video_url": "https://vimeo.com/918273645",
    "thumbnail_url": "https://i.vimeocdn.com/video/123456.jpg"
  }
]
```

##### Response Mẫu (200 OK):
```json
{
  "success": true,
  "message": "Import danh sách video thành công",
  "data": {
    "success": true,
    "imported_count": 1,
    "errors": []
  },
  "errorCode": null
}
```

---

## 4. BẢNG TỔNG HỢP CÁC DATA MODEL (TYPESCRIPT INTERFACES)

Để AI Agent Coding khai báo Type / Interface chính xác:

```typescript
export interface AcademicSurveyUser {
  email: string;
  fullName: string;
  phone: string;
  region: string;
  interest: string;
  createdAt: string;
}

export interface AcademicSurveyLesson {
  id: string;
  title: string;
  description?: string;
  video_url?: string;
  thumbnail_url?: string;
  video_id: string;
  unlock_after_seconds: number;
  duration?: number;
  hidden_content?: {
    questions?: AcademicSurveyQuestion[];
  };
  position?: number;
  is_visible?: boolean;
  show_unlock_time?: boolean;
  show_popup?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AcademicSurveyUserDetailed extends AcademicSurveyUser {
  progress: {
    started: number;
    completed: number;
    total_lessons: number;
  };
  video_progress?: {
    watch_time: number;
    duration: number;
    is_completed: boolean;
    pct: number;
  } | null;
}

export interface AcademicSurveySession {
  session_id: string;
  email: string;
  watch_time: number;
  completed: boolean;
  is_unlocked: boolean;
  lesson: {
    id: string;
    title: string;
    video_id: string;
    unlock_after_seconds: number;
    duration?: number;
  };
  createdAt: string;
}
```

---
*Tài liệu được cập nhật lại theo đúng 3 Tab Quản lý trong giao diện Academic Survey CMS.*
