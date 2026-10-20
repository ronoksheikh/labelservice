-- twobytes.dev course platform. Times are unix milliseconds, money is whole Taka (BDT).

CREATE TABLE courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',          -- a small Markdown subset, see shared/markdown.ts
  image_url TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL DEFAULT 0,
  compare_price INTEGER,                         -- shown struck through when higher than price
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  position INTEGER NOT NULL DEFAULT 0,
  bump_course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL, -- "Exclusive offer" at checkout
  bump_price INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  section TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  video_url TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX lessons_course ON lessons (course_id, position);

CREATE TABLE coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,                     -- stored upper case
  kind TEXT NOT NULL CHECK (kind IN ('percent', 'fixed')),
  amount INTEGER NOT NULL,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE, -- null: every course
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,                    -- stored lower case
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  access_key TEXT NOT NULL,                      -- lets the buyer's browser read its own order status
  course_id INTEGER NOT NULL REFERENCES courses(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  coupon_code TEXT,
  subtotal INTEGER NOT NULL,
  discount INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'paid', 'failed', 'cancelled')),
  payment_provider TEXT,
  payment_ref TEXT,
  visitor_id TEXT,
  source TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);
CREATE INDEX orders_created ON orders (created_at);
CREATE INDEX orders_paid ON orders (status, paid_at);
CREATE INDEX orders_email ON orders (email);

CREATE TABLE order_items (
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id),
  title TEXT NOT NULL,
  price INTEGER NOT NULL,
  is_bump INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (order_id, course_id)
);

CREATE TABLE enrollments (
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  order_id TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (student_id, course_id)
);

CREATE TABLE lesson_progress (
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  completed_at INTEGER NOT NULL,
  PRIMARY KEY (student_id, lesson_id)
);

CREATE TABLE login_tokens (
  token_hash TEXT PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX login_tokens_student ON login_tokens (student_id, created_at);

-- Page views from the public site. Checkouts and purchases are read from orders.
CREATE TABLE page_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_id TEXT NOT NULL,
  path TEXT NOT NULL,
  course_id INTEGER,
  source TEXT NOT NULL DEFAULT 'direct',
  country TEXT,
  device TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX page_views_created ON page_views (created_at);
CREATE INDEX page_views_course ON page_views (course_id, created_at);
