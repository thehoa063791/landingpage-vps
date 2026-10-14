// Partner facet "learning": the contact's progress in every video course (src/learningCourses.js)
// they registered for. A new course appears here without changes to this file.
const { getLearningService } = require('../../learningService');
const { courseIds, getCourse } = require('../../learningCourses');
const { summarizeCourse } = require('../../learningProgress');
const { progressChanges } = require('../../learningRepository');

const round = value => Math.round(value * 10) / 10;
const DAY = 86400000;

function createLearningFacet({ services = getLearningService, courses = courseIds, changes = progressChanges, siteUrl = (process.env.SITE_URL || 'https://event.phamthanhbien.com').replace(/\/$/, '') } = {}) {
  const allowed = client => courses().filter(id => !client.courses.length || client.courses.includes(id));
  const lessonRef = item => ({
    id: Number(item.lesson.id),
    title: item.lesson.title || '',
    stage: item.lesson.stage_title || null,
    watch_percent: round(item.duration ? Math.min(100, item.watched_seconds / item.duration * 100) : 0),
    completed: item.completed,
  });

  async function courseProgress(id, lead, { lessons: withLessons, now }) {
    const course = getCourse(id);
    const { lessons, rows, learner } = await services(id).learnerProgress(lead);
    const s = summarizeCourse(lessons, rows);
    return {
      course: id,
      title: course.title,
      registered_at: lead.registered_at || null,
      status: s.status,
      completed_lessons: s.completed_lessons,
      total_lessons: s.total_lessons,
      completion_percent: round(s.completion_percent),
      watched_seconds: Math.round(s.watched_seconds),
      total_seconds: Math.round(s.total_seconds),
      watch_percent: round(s.watch_percent),
      started_at: s.started_at,
      last_activity_at: s.last_activity_at,
      last_login_at: learner.last_login_at || null,
      days_since_last_activity: s.last_activity_at ? Math.max(0, Math.floor((now - new Date(s.last_activity_at).getTime()) / DAY)) : null,
      completed_at: s.completed_at,
      current_lesson: s.current ? lessonRef(s.current) : null,
      next_lesson: s.next ? { ...lessonRef(s.next), remaining_seconds: Math.max(0, Math.round(s.next.duration - s.next.watched_seconds)) } : null,
      // The learner signs in with their email first when the browser has no session.
      resume_url: `${siteUrl}${course.base_path}/learn${s.next ? `/${Number(s.next.lesson.id)}` : ''}`,
      ...(withLessons ? {
        lessons: s.items.map(item => ({
          ...lessonRef(item),
          position: Number(item.lesson.position || 0) || null,
          duration_seconds: Math.round(item.duration),
          watched_seconds: Math.round(item.watched_seconds),
          last_position: Math.round(item.progress?.last_position || 0),
          completed_at: item.progress?.completed_at || null,
          updated_at: item.progress?.updated_at || null,
        })),
      } : {}),
    };
  }

  return {
    name: 'learning',
    scope: 'learning:read',
    description: 'Tiến trình học các khóa video (dòng tiền, trading...)',
    includes: ['learning', 'learning.lessons'],
    courses: client => allowed(client).map(id => ({ id, title: getCourse(id).title })),
    async load(contact, { client, include, now = Date.now() }) {
      const result = [];
      for (const id of allowed(client)) {
        // The course's own lead: the earliest registration on that funnel, as at sign-in.
        const lead = contact.registrations.find(row => row.page_id === id);
        if (lead) result.push(await courseProgress(id, lead, { lessons: include.has('learning.lessons'), now }));
      }
      return { courses: result };
    },
    // Progress rows changed after `after`, for GET /changes.
    async changes({ client, after, limit }) {
      return (await changes({ courses: allowed(client), after, limit })).map(row => ({ registration_id: row.registration_id, changed_at: row.at, cursor: { at: row.at, course: row.course, key: row.key } }));
    },
  };
}

module.exports = { createLearningFacet };
