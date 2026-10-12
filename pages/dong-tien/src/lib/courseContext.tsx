import { createContext, useContext, type ReactNode } from 'react';
import { useRouter } from 'next/router';
import { COURSES, courseFromPath, type CourseConfig } from './courses';

const CourseContext = createContext<CourseConfig>(COURSES['dong-tien']);

// router.pathname is the page file route, so the course is known during server render.
export function CourseProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  return <CourseContext.Provider value={COURSES[courseFromPath(router.pathname)]}>{children}</CourseContext.Provider>;
}

export const useCourse = () => useContext(CourseContext);
