// One definition of a learner's course progress, shared by the learner's completion page,
// the Meta course milestones, the admin report and the partner API, so they never disagree.

// Unique watched seconds of one lesson (watched_ranges are merged on save).
const watchedSeconds = (row, duration = Infinity) => Math.min(Number(duration), (row?.watched_ranges || []).reduce((sum, [start, end]) => sum + end - start, 0));
const latest = (values) => values.filter(Boolean).sort().at(-1) || null;

// `lessons`: the course lessons in learning order; `rows`: one learner's progress rows.
function summarizeCourse(lessons, rows = []) {
  const byLesson = new Map(rows.map(row => [Number(row.lesson_id), row]));
  const items = lessons.map(lesson => {
    const progress = byLesson.get(Number(lesson.id)) || null, duration = Number(lesson.duration || 0);
    return { lesson, progress, duration, watched_seconds: progress ? watchedSeconds(progress, duration) : 0, completed: !!progress?.is_completed };
  });
  const total_seconds = items.reduce((sum, item) => sum + item.duration, 0);
  const watched_seconds = items.reduce((sum, item) => sum + item.watched_seconds, 0);
  const completed_lessons = items.filter(item => item.completed).length, total_lessons = items.length;
  const touched = items.filter(item => item.progress);
  const all_completed = total_lessons > 0 && completed_lessons === total_lessons;
  // The lesson the learner touched last, and where they should continue: that lesson while
  // unfinished, else the first unfinished lesson after it, else any unfinished one.
  const current = touched.reduce((last, item) => !last || String(item.progress.updated_at || '') > String(last.progress.updated_at || '') ? item : last, null);
  const after = current ? items.slice(items.indexOf(current) + 1) : items;
  const next = all_completed ? null : current && !current.completed ? current : after.find(item => !item.completed) || items.find(item => !item.completed) || null;
  return {
    status: all_completed ? 'completed' : touched.length ? 'in_progress' : 'not_started',
    completed_lessons, total_lessons,
    completion_percent: total_lessons ? completed_lessons / total_lessons * 100 : 0,
    watched_seconds, total_seconds,
    watch_percent: total_seconds ? Math.min(100, watched_seconds / total_seconds * 100) : 0,
    started_at: touched.map(item => item.progress.created_at).filter(Boolean).sort()[0] || null,
    last_activity_at: latest(touched.map(item => item.progress.updated_at)),
    completed_at: all_completed ? latest(items.map(item => item.progress.completed_at)) : null,
    current, next, items,
  };
}

module.exports = { summarizeCourse, watchedSeconds };
