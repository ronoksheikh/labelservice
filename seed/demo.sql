-- Demo content for local development: bun run db:seed:local (also uploads the cover images to local R2).
DELETE FROM lesson_progress; DELETE FROM enrollments; DELETE FROM order_items; DELETE FROM orders; DELETE FROM login_tokens;
DELETE FROM students; DELETE FROM coupons; DELETE FROM lessons; DELETE FROM page_views; DELETE FROM courses;

INSERT INTO courses (id, slug, title, subtitle, description, image_url, price, compare_price, status, position, created_at, updated_at) VALUES
(1, 'youtube-blueprint', 'The YouTube Blueprint: Make Content Creation Your Career',
 'Have you ever dreamt of becoming a YouTuber? This is your step-by-step plan to ideate, script, film and edit videos, then grow and earn as a creator.',
 'Have you ever dreamt of becoming a YouTuber? This is your blueprint to getting there. Whether you want to take up content creation as a **full-time career** or a part-time job, this all-in-one course is your plan of action.

Learn to ideate, script, film, and edit amazing videos. Then understand the secret to getting lakhs of followers and making money as a content creator. It''s time to live your dream life!

## What you will learn

- Finding a niche that works for you
- Writing scripts that keep people watching
- Filming with just your phone
- Editing, thumbnails and titles that get clicks
- Monetization: AdSense, sponsors and your own products

*Note: This course is in Bangla with English subtitles. If you have a coupon code, you can use it at checkout.*',
 '/media/demo/youtube-blueprint.jpg', 2990, 4990, 'published', 1, 1760900000000, 1760900000000),
(2, 'fullstack-web-react', 'Full-Stack Web Development with React',
 'Build and deploy real web apps with React, TypeScript and Cloudflare. From your first component to a live product.',
 'Go from writing your first component to shipping a full-stack product on the internet.

## Inside the course

1. Modern JavaScript and TypeScript
2. React fundamentals and hooks
3. Building APIs with Hono on Cloudflare Workers
4. Databases with Cloudflare D1
5. Deploying, domains and going live

Every module ends with a project you can put in your portfolio.',
 '/media/demo/fullstack-web.jpg', 3490, NULL, 'published', 2, 1760900000000, 1760900000000),
(3, 'ai-tools-masterclass', 'AI Tools Masterclass',
 'LIVE-style workshop: learn the AI tools that save hours every week, for students, freelancers and creators.',
 'Learn the AI tools that save hours every week. Practical walkthroughs for writing, research, design and code.',
 '/media/demo/ai-masterclass.jpg', 990, 1490, 'published', 3, 1760900000000, 1760900000000);

UPDATE courses SET bump_course_id = 3, bump_price = 490 WHERE id = 1;

INSERT INTO lessons (course_id, section, title, video_url, body, duration_minutes, position) VALUES
(1, 'Getting started', 'Welcome to the course', 'https://www.youtube.com/watch?v=M7lc1UVf-VE', 'Download the **course workbook** before you start.', 6, 0),
(1, 'Getting started', 'Finding your niche', 'https://www.youtube.com/watch?v=M7lc1UVf-VE', '', 18, 1),
(1, 'Making videos', 'Writing a script that hooks', 'https://www.youtube.com/watch?v=M7lc1UVf-VE', '', 24, 2),
(1, 'Making videos', 'Filming with your phone', 'https://www.youtube.com/watch?v=M7lc1UVf-VE', '', 21, 3),
(1, 'Making videos', 'Editing basics', 'https://www.youtube.com/watch?v=M7lc1UVf-VE', '', 32, 4),
(1, 'Growing', 'Thumbnails and titles', 'https://www.youtube.com/watch?v=M7lc1UVf-VE', '', 15, 5),
(1, 'Growing', 'Making money as a creator', 'https://www.youtube.com/watch?v=M7lc1UVf-VE', '', 27, 6),
(2, 'Foundations', 'How the web works', 'https://www.youtube.com/watch?v=M7lc1UVf-VE', '', 12, 0),
(2, 'Foundations', 'TypeScript in one hour', 'https://www.youtube.com/watch?v=M7lc1UVf-VE', '', 58, 1),
(2, 'React', 'Your first component', 'https://www.youtube.com/watch?v=M7lc1UVf-VE', '', 22, 2),
(2, 'Backend', 'APIs with Hono', 'https://www.youtube.com/watch?v=M7lc1UVf-VE', '', 35, 3),
(3, '', 'AI for everyday work', 'https://www.youtube.com/watch?v=M7lc1UVf-VE', '', 45, 0);

INSERT INTO coupons (code, kind, amount, course_id, max_uses, expires_at, active, created_at) VALUES
('LAUNCH20', 'percent', 20, NULL, NULL, NULL, 1, 1760900000000),
('FREEBIE', 'percent', 100, 3, 50, NULL, 1, 1760900000000);
