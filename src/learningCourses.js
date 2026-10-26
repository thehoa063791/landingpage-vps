// Funnels with a tracked video course. A course ID equals the funnel page_id and the
// public base path, and keys its rows in the shared learning_* tables; adding a course
// needs an entry here and its Next.js pages, not a migration.
const COURSES = {
  'dong-tien': {
    title: 'Phương pháp xây dựng dòng tiền',
    // New leads reach the n8n webhook (n8n → HubCRM), as for trading.
    // Meta CAPI: registration, landing views of new visitors and learning milestones.
    capi: true,
    webhooks: true,
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
  };
}

const courseIds = () => Object.keys(COURSES);
const isCourse = id => Object.hasOwn(COURSES, id);

module.exports = { getCourse, courseIds, isCourse };
