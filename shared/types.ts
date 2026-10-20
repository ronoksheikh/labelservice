// Shapes sent between the Worker and the React app.

export type CourseStatus = 'draft' | 'published';
export type OrderStatus = 'initiated' | 'paid' | 'failed' | 'cancelled';

export interface LessonOutline {
  id: number;
  section: string;
  title: string;
  durationMinutes: number;
}

export interface BumpOffer {
  courseId: number;
  slug: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  price: number;
  regularPrice: number;
}

export interface CourseSummary {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  price: number;
  comparePrice: number | null;
  lessonCount: number;
  totalMinutes: number;
}

export interface CourseDetail extends CourseSummary {
  description: string;
  lessons: LessonOutline[];
  bump: BumpOffer | null;
}

export interface CouponQuote {
  code: string;
  discount: number;
  label: string;
}

export interface CheckoutRequest {
  slug: string;
  name: string;
  email: string;
  phone: string;
  coupon?: string;
  bump?: boolean;
  visitorId?: string;
  source?: string;
}

export interface CheckoutResponse {
  orderId: string;
  key: string;
  /** Where to send the buyer to pay. Null when no payment is needed or the gateway is not connected yet. */
  redirectUrl: string | null;
}

export interface OrderReceipt {
  id: string;
  status: OrderStatus;
  name: string;
  email: string;
  items: { courseId: number; slug: string; title: string; price: number }[];
  subtotal: number;
  discount: number;
  total: number;
  createdAt: number;
  paidAt: number | null;
  /** True when this browser was signed in to the course area by this request. */
  signedIn: boolean;
}

export interface Student {
  id: number;
  email: string;
  name: string;
}

export interface MyCourse extends CourseSummary {
  completedCount: number;
  nextLessonId: number | null;
}

export interface Lesson extends LessonOutline {
  videoUrl: string;
  body: string;
  completed: boolean;
}

export interface Classroom {
  course: { id: number; slug: string; title: string; imageUrl: string };
  lessons: Lesson[];
}

/* ---------- Admin ---------- */

export interface AdminCourse {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  imageUrl: string;
  price: number;
  comparePrice: number | null;
  status: CourseStatus;
  position: number;
  bumpCourseId: number | null;
  bumpPrice: number | null;
  createdAt: number;
  updatedAt: number;
  lessonCount: number;
  studentCount: number;
}

export interface AdminLesson {
  id?: number;
  section: string;
  title: string;
  videoUrl: string;
  body: string;
  durationMinutes: number;
}

export interface AdminCourseInput {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  imageUrl: string;
  price: number;
  comparePrice: number | null;
  status: CourseStatus;
  position: number;
  bumpCourseId: number | null;
  bumpPrice: number | null;
  lessons: AdminLesson[];
}

export interface Coupon {
  id: number;
  code: string;
  kind: 'percent' | 'fixed';
  amount: number;
  courseId: number | null;
  courseTitle: string | null;
  maxUses: number | null;
  usedCount: number;
  expiresAt: number | null;
  active: boolean;
  createdAt: number;
}

export type CouponInput = Omit<Coupon, 'id' | 'usedCount' | 'createdAt' | 'courseTitle'>;

export interface AdminOrder {
  id: string;
  status: OrderStatus;
  name: string;
  email: string;
  phone: string;
  courseTitle: string;
  items: string[];
  couponCode: string | null;
  subtotal: number;
  discount: number;
  total: number;
  source: string | null;
  paymentProvider: string | null;
  paymentRef: string | null;
  paymentMethod: string | null;
  createdAt: number;
  paidAt: number | null;
}

export interface AdminStudent {
  id: number;
  email: string;
  name: string;
  phone: string;
  createdAt: number;
  lastLoginAt: number | null;
  courses: string[];
  spent: number;
}

export interface DailyStat {
  date: string;
  visitors: number;
  views: number;
  checkouts: number;
  purchases: number;
  revenue: number;
}

export interface Stats {
  days: number;
  totals: Omit<DailyStat, 'date'> & { conversionRate: number; checkoutRate: number };
  daily: DailyStat[];
  courses: { id: number; title: string; views: number; checkouts: number; purchases: number; revenue: number }[];
  sources: { source: string; visitors: number; purchases: number }[];
  countries: { country: string; visitors: number }[];
  recentOrders: AdminOrder[];
}
