// Funnels with a tracked video course. A course ID equals the funnel page_id and the
// public base path, and keys its rows in the shared learning_* tables; adding a course
// needs an entry here and its Next.js pages, not a migration.
const COURSES = {
  'dong-tien': {
    title: 'Phương pháp xây dựng dòng tiền',
    // Shared review folder that the Dòng Tiền lessons were originally imported from.
    vimeoReviewURL: 'https://vimeo.com/reviews/27825fe4-1d85-4f05-8fb4-13ba87f1008a/users/208230075/folders/29758694',
    vimeoFolderId: '29758694',
    vimeoCatalogFile: 'pages/dong-tien/vimeo-catalog.json',
    // Meta CAPI: registration, landing views of new visitors and learning milestones.
    capi: true,
  },
  trading: {
    title: 'Phương pháp Trading hiệu quả',
    // Like the former /trading lead form, new leads reach the n8n webhook (n8n → HubCRM).
    // Meta CAPI: registration, landing views of new visitors and learning milestones.
    capi: true,
    webhooks: true,
    leadAttendance: 'Free Workshop',
  },
};

const envName = (id, suffix) => `${id.replace(/-/g, '_').toUpperCase()}_${suffix}`;

function getCourse(id) {
  const config = Object.hasOwn(COURSES, id) ? COURSES[id] : null;
  if (!config) throw Object.assign(new Error('Khóa học không tồn tại.'), { status: 404 });
  return {
    id,
    page_id: id,
    base_path: `/${id}`,
    title: config.title,
    capi: !!config.capi,
    webhooks: !!config.webhooks,
    lead_attendance: config.leadAttendance || '',
    // DONG_TIEN_VIMEO_REVIEW_URL, TRADING_VIMEO_FOLDER_ID, ... override the defaults.
    vimeo: {
      reviewURL: process.env[envName(id, 'VIMEO_REVIEW_URL')] || config.vimeoReviewURL || '',
      folderId: process.env[envName(id, 'VIMEO_FOLDER_ID')] || config.vimeoFolderId || '',
      catalogFile: config.vimeoCatalogFile || '',
    },
  };
}

const courseIds = () => Object.keys(COURSES);
const isCourse = id => Object.hasOwn(COURSES, id);

module.exports = { getCourse, courseIds, isCourse };
