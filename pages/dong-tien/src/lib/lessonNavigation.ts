import type { AcademicLessonPublic } from '@/types';

export function nextAvailableLesson(lessons: AcademicLessonPublic[]) {
  return lessons.find(lesson => !lesson.progress?.completed) || lessons[0];
}

export function firstLessonInChapter(lessons: AcademicLessonPublic[], chapterIndex = 0) {
  const chapters = [...new Set(lessons.filter(lesson => lesson.stage_id).map(lesson => lesson.stage_id))];
  const chapter = chapters[chapterIndex];
  return (chapter ? lessons.find(lesson => lesson.stage_id === chapter) : undefined) || lessons[0];
}
