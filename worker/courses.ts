import type { AdminCourse, AdminCourseInput, AdminLesson, BumpOffer, CourseDetail, CourseSummary, LessonOutline } from '../shared/types';
import { HttpError } from './errors';

export interface CourseRow {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  image_url: string;
  price: number;
  compare_price: number | null;
  status: 'draft' | 'published';
  position: number;
  bump_course_id: number | null;
  bump_price: number | null;
  created_at: number;
  updated_at: number;
}

interface LessonRow {
  id: number;
  course_id: number;
  section: string;
  title: string;
  video_url: string;
  body: string;
  duration_minutes: number;
  position: number;
}

type SummaryRow = CourseRow & { lesson_count: number; total_minutes: number };

const SUMMARY_SQL = `SELECT c.*, COUNT(l.id) AS lesson_count, COALESCE(SUM(l.duration_minutes), 0) AS total_minutes
  FROM courses c LEFT JOIN lessons l ON l.course_id = c.id`;

export const toSummary = (row: SummaryRow): CourseSummary => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  subtitle: row.subtitle,
  imageUrl: row.image_url,
  price: row.price,
  comparePrice: row.compare_price && row.compare_price > row.price ? row.compare_price : null,
  lessonCount: row.lesson_count,
  totalMinutes: row.total_minutes,
});

const toOutline = (row: LessonRow): LessonOutline => ({
  id: row.id, section: row.section, title: row.title, durationMinutes: row.duration_minutes,
});

export class Courses {
  constructor(private readonly db: D1Database) {}

  async published() {
    const { results } = await this.db
      .prepare(`${SUMMARY_SQL} WHERE c.status = 'published' GROUP BY c.id ORDER BY c.position, c.id DESC`)
      .all<SummaryRow>();
    return results.map(toSummary);
  }

  bySlug(slug: string) {
    return this.db.prepare('SELECT * FROM courses WHERE slug = ?').bind(slug).first<CourseRow>();
  }

  byId(id: number) {
    return this.db.prepare('SELECT * FROM courses WHERE id = ?').bind(id).first<CourseRow>();
  }

  async lessons(courseId: number) {
    const { results } = await this.db
      .prepare('SELECT * FROM lessons WHERE course_id = ? ORDER BY position, id').bind(courseId).all<LessonRow>();
    return results;
  }

  /** A published course with its outline (no video links) and checkout offer. */
  async detail(slug: string): Promise<CourseDetail | null> {
    const row = await this.bySlug(slug);
    if (!row || row.status !== 'published') return null;
    const lessons = await this.lessons(row.id);
    return {
      ...toSummary({ ...row, lesson_count: lessons.length, total_minutes: lessons.reduce((sum, l) => sum + l.duration_minutes, 0) }),
      description: row.description,
      lessons: lessons.map(toOutline),
      bump: await this.bump(row),
    };
  }

  async bump(row: CourseRow): Promise<BumpOffer | null> {
    if (!row.bump_course_id || row.bump_price === null || row.bump_course_id === row.id) return null;
    const offer = await this.byId(row.bump_course_id);
    if (!offer || offer.status !== 'published') return null;
    return {
      courseId: offer.id, slug: offer.slug, title: offer.title, subtitle: offer.subtitle, imageUrl: offer.image_url,
      price: Math.min(row.bump_price, offer.price), regularPrice: offer.price,
    };
  }

  /* ---------- Admin ---------- */

  async adminList(): Promise<AdminCourse[]> {
    const { results } = await this.db.prepare(`SELECT c.*,
        (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count,
        (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS student_count
      FROM courses c ORDER BY c.position, c.id DESC`).all<CourseRow & { lesson_count: number; student_count: number }>();
    return results.map((row) => ({
      id: row.id, slug: row.slug, title: row.title, subtitle: row.subtitle, description: row.description,
      imageUrl: row.image_url, price: row.price, comparePrice: row.compare_price, status: row.status,
      position: row.position, bumpCourseId: row.bump_course_id, bumpPrice: row.bump_price,
      createdAt: row.created_at, updatedAt: row.updated_at, lessonCount: row.lesson_count, studentCount: row.student_count,
    }));
  }

  async adminLessons(courseId: number): Promise<AdminLesson[]> {
    return (await this.lessons(courseId)).map((l) => ({
      id: l.id, section: l.section, title: l.title, videoUrl: l.video_url, body: l.body, durationMinutes: l.duration_minutes,
    }));
  }

  /** Create (id null) or update a course and replace its lessons. Lessons keep their ids, so progress survives edits. */
  async save(id: number | null, input: AdminCourseInput) {
    const clash = await this.db.prepare('SELECT id FROM courses WHERE slug = ? AND id IS NOT ?').bind(input.slug, id).first();
    if (clash) throw new HttpError(409, 'Another course already uses this URL slug.');
    const now = Date.now();
    const fields = [input.slug, input.title, input.subtitle, input.description, input.imageUrl, input.price, input.comparePrice,
      input.status, input.position, input.bumpCourseId === id ? null : input.bumpCourseId, input.bumpPrice];
    let courseId = id;
    if (courseId === null) {
      const row = await this.db.prepare(`INSERT INTO courses (slug, title, subtitle, description, image_url, price, compare_price,
          status, position, bump_course_id, bump_price, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
        .bind(...fields, now, now).first<{ id: number }>();
      courseId = row!.id;
    } else {
      const result = await this.db.prepare(`UPDATE courses SET slug = ?, title = ?, subtitle = ?, description = ?, image_url = ?, price = ?,
          compare_price = ?, status = ?, position = ?, bump_course_id = ?, bump_price = ?, updated_at = ? WHERE id = ?`)
        .bind(...fields, now, courseId).run();
      if (!result.meta.changes) throw new HttpError(404, 'Course not found.');
    }

    const existing = new Set((await this.lessons(courseId)).map((l) => l.id));
    const kept = new Set(input.lessons.map((l) => l.id).filter((lessonId): lessonId is number => lessonId !== undefined && existing.has(lessonId)));
    const statements = [...existing].filter((lessonId) => !kept.has(lessonId))
      .map((lessonId) => this.db.prepare('DELETE FROM lessons WHERE id = ?').bind(lessonId));
    input.lessons.forEach((lesson, position) => {
      const values = [lesson.section, lesson.title, lesson.videoUrl, lesson.body, lesson.durationMinutes, position];
      statements.push(lesson.id !== undefined && kept.has(lesson.id)
        ? this.db.prepare('UPDATE lessons SET section = ?, title = ?, video_url = ?, body = ?, duration_minutes = ?, position = ? WHERE id = ?')
          .bind(...values, lesson.id)
        : this.db.prepare('INSERT INTO lessons (section, title, video_url, body, duration_minutes, position, course_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(...values, courseId));
    });
    if (statements.length) await this.db.batch(statements);
    return courseId;
  }

  async remove(id: number) {
    const sold = await this.db.prepare('SELECT 1 FROM order_items WHERE course_id = ? LIMIT 1').bind(id).first();
    if (sold) throw new HttpError(409, 'This course has orders. Set it to Draft instead of deleting it.');
    await this.db.batch([
      this.db.prepare('UPDATE courses SET bump_course_id = NULL, bump_price = NULL WHERE bump_course_id = ?').bind(id),
      this.db.prepare('DELETE FROM courses WHERE id = ?').bind(id),
    ]);
  }
}
