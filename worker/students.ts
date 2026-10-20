import type { AdminStudent, Classroom, MyCourse, Student } from '../shared/types';
import { randomToken, sha256 } from './auth';
import { toSummary, type CourseRow } from './courses';
import { HttpError } from './errors';

interface StudentRow {
  id: number;
  email: string;
  name: string;
  phone: string;
  created_at: number;
  last_login_at: number | null;
}

export const LOGIN_LINK_MINUTES = 30;
export const PURCHASE_LINK_DAYS = 7;

export class Students {
  constructor(private readonly db: D1Database) {}

  byId(id: number) {
    return this.db.prepare('SELECT * FROM students WHERE id = ?').bind(id).first<StudentRow>();
  }

  byEmail(email: string) {
    return this.db.prepare('SELECT * FROM students WHERE email = ?').bind(email.toLowerCase()).first<StudentRow>();
  }

  async me(id: number): Promise<Student | null> {
    const row = await this.byId(id);
    return row && { id: row.id, email: row.email, name: row.name };
  }

  /** Find or create the student for an email; fills in a missing name or phone. */
  async upsert(email: string, name: string, phone: string) {
    const row = await this.db.prepare(`INSERT INTO students (email, name, phone, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (email) DO UPDATE SET name = CASE WHEN students.name = '' THEN excluded.name ELSE students.name END,
        phone = CASE WHEN excluded.phone <> '' THEN excluded.phone ELSE students.phone END
      RETURNING id`).bind(email.toLowerCase(), name, phone, Date.now()).first<{ id: number }>();
    return row!.id;
  }

  enrollStatement(studentId: number, courseId: number, orderId: string | null) {
    return this.db.prepare('INSERT OR IGNORE INTO enrollments (student_id, course_id, order_id, created_at) VALUES (?, ?, ?, ?)')
      .bind(studentId, courseId, orderId, Date.now());
  }

  async revoke(studentId: number, courseId: number) {
    await this.db.prepare('DELETE FROM enrollments WHERE student_id = ? AND course_id = ?').bind(studentId, courseId).run();
  }

  /* ---------- Email sign-in links ---------- */

  async createLoginToken(studentId: number, ttlMs: number) {
    const token = randomToken();
    const now = Date.now();
    await this.db.batch([
      this.db.prepare('DELETE FROM login_tokens WHERE expires_at < ?').bind(now - 24 * 60 * 60 * 1000),
      this.db.prepare('INSERT INTO login_tokens (token_hash, student_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
        .bind(await sha256(token), studentId, now + ttlMs, now),
    ]);
    return token;
  }

  /** Sign-in emails sent to this student in the last `windowMs`. */
  async recentTokens(studentId: number, windowMs: number) {
    const row = await this.db.prepare('SELECT COUNT(*) AS n FROM login_tokens WHERE student_id = ? AND created_at > ?')
      .bind(studentId, Date.now() - windowMs).first<{ n: number }>();
    return row?.n ?? 0;
  }

  /** Spend a sign-in token; returns the student id. */
  async redeem(token: string) {
    const now = Date.now();
    const row = await this.db.prepare(`UPDATE login_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
      RETURNING student_id`).bind(now, await sha256(token), now).first<{ student_id: number }>();
    if (!row) throw new HttpError(410, 'This sign-in link has expired or was already used. Request a new one below.');
    await this.touch(row.student_id);
    return row.student_id;
  }

  touch(studentId: number) {
    return this.db.prepare('UPDATE students SET last_login_at = ? WHERE id = ?').bind(Date.now(), studentId).run();
  }

  /* ---------- Course area ---------- */

  async courses(studentId: number): Promise<MyCourse[]> {
    const { results } = await this.db.prepare(`SELECT c.*,
        (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count,
        (SELECT COALESCE(SUM(duration_minutes), 0) FROM lessons l WHERE l.course_id = c.id) AS total_minutes,
        (SELECT COUNT(*) FROM lesson_progress p JOIN lessons l ON l.id = p.lesson_id WHERE l.course_id = c.id AND p.student_id = e.student_id) AS completed_count,
        (SELECT l.id FROM lessons l WHERE l.course_id = c.id AND l.id NOT IN (SELECT lesson_id FROM lesson_progress WHERE student_id = e.student_id)
          ORDER BY l.position, l.id LIMIT 1) AS next_lesson_id
      FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.student_id = ? ORDER BY e.created_at DESC`)
      .bind(studentId).all<CourseRow & { lesson_count: number; total_minutes: number; completed_count: number; next_lesson_id: number | null }>();
    return results.map((row) => ({ ...toSummary(row), completedCount: row.completed_count, nextLessonId: row.next_lesson_id }));
  }

  async classroom(studentId: number, slug: string): Promise<Classroom> {
    const course = await this.db.prepare(`SELECT c.id, c.slug, c.title, c.image_url FROM courses c
      JOIN enrollments e ON e.course_id = c.id AND e.student_id = ? WHERE c.slug = ?`).bind(studentId, slug)
      .first<{ id: number; slug: string; title: string; image_url: string }>();
    if (!course) throw new HttpError(403, "You don't have access to this course yet.");
    const { results } = await this.db.prepare(`SELECT l.*, p.completed_at FROM lessons l
      LEFT JOIN lesson_progress p ON p.lesson_id = l.id AND p.student_id = ? WHERE l.course_id = ? ORDER BY l.position, l.id`)
      .bind(studentId, course.id).all<{ id: number; section: string; title: string; video_url: string; body: string; duration_minutes: number; completed_at: number | null }>();
    return {
      course: { id: course.id, slug: course.slug, title: course.title, imageUrl: course.image_url },
      lessons: results.map((l) => ({
        id: l.id, section: l.section, title: l.title, durationMinutes: l.duration_minutes, videoUrl: l.video_url, body: l.body,
        completed: l.completed_at !== null,
      })),
    };
  }

  async setProgress(studentId: number, lessonId: number, completed: boolean) {
    const allowed = await this.db.prepare(`SELECT 1 FROM lessons l JOIN enrollments e ON e.course_id = l.course_id AND e.student_id = ?
      WHERE l.id = ?`).bind(studentId, lessonId).first();
    if (!allowed) throw new HttpError(403, "You don't have access to this lesson.");
    await (completed
      ? this.db.prepare('INSERT OR IGNORE INTO lesson_progress (student_id, lesson_id, completed_at) VALUES (?, ?, ?)').bind(studentId, lessonId, Date.now())
      : this.db.prepare('DELETE FROM lesson_progress WHERE student_id = ? AND lesson_id = ?').bind(studentId, lessonId)).run();
  }

  /* ---------- Admin ---------- */

  async list(search: string): Promise<AdminStudent[]> {
    const like = `%${search.replace(/[%_]/g, '')}%`;
    const { results } = await this.db.prepare(`SELECT s.*,
        (SELECT GROUP_CONCAT(c.title, '||') FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.student_id = s.id) AS courses,
        (SELECT COALESCE(SUM(o.total), 0) FROM orders o WHERE o.email = s.email AND o.status = 'paid') AS spent
      FROM students s WHERE s.email LIKE ?1 OR s.name LIKE ?1 OR s.phone LIKE ?1 ORDER BY s.created_at DESC LIMIT 300`)
      .bind(like).all<StudentRow & { courses: string | null; spent: number }>();
    return results.map((row) => ({
      id: row.id, email: row.email, name: row.name, phone: row.phone, createdAt: row.created_at, lastLoginAt: row.last_login_at,
      courses: row.courses ? row.courses.split('||') : [], spent: row.spent,
    }));
  }
}
