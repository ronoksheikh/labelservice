// Static pages, written in the Markdown subset from markdown.ts so the Worker (for search engines)
// and the React app render the same text.

export interface StaticPage {
  path: string;
  title: string;
  description: string;
  body: string;
}

export const ABOUT: StaticPage = {
  path: '/about',
  title: 'About us',
  description: 'twobytes.dev is run by two people: Fahimun Tasin and Ronok Sheikh. Practical, focused courses for learners in Bangladesh.',
  body: `twobytes.dev is a small, independent course platform. The entire platform, from the courses and the videos to this website and the support inbox, is run by **two people**: **Fahimun Tasin** and **Ronok Sheikh**.

That's where the name comes from: two bytes, two builders. We make every course ourselves and answer every email ourselves.

## What we believe

- **Practical over theoretical.** Every course is built around things you will actually use.
- **Short and focused.** No filler. We respect your time.
- **Fair prices in Taka.** Pay with the methods you already use in Bangladesh.
- **Lifetime access.** Buy once, keep learning at your own pace.

## Get in touch

Have a question about a course or your purchase? Email us at [hello@twobytes.dev](mailto:hello@twobytes.dev) and one of us will reply personally.`,
};

export const PRIVACY: StaticPage = {
  path: '/privacy',
  title: 'Privacy policy',
  description: 'How twobytes.dev collects, uses and protects your information.',
  body: `We collect only what we need to sell you a course and give you access to it.

## What we collect

- **Your name, email address and phone number** when you start a checkout.
- **Payment status** from our payment provider. We never see or store your card or mobile banking details.
- **Anonymous usage data**, such as pages viewed, the site that referred you and your country, to understand what works. We don't use advertising trackers.

## How we use it

- To process your order and give you access to your courses.
- To send you your course link, sign-in links and important updates about your purchase.
- To answer your support questions.

We never sell your information. We share it only with the services that run this website (Cloudflare for hosting, Resend for email and our payment provider) and only as much as they need.

## Your choices

You can ask us to correct or delete your information at any time by emailing [hello@twobytes.dev](mailto:hello@twobytes.dev).`,
};

export const TERMS: StaticPage = {
  path: '/terms',
  title: 'Terms of service',
  description: 'The terms for buying and using courses on twobytes.dev.',
  body: `By buying a course on twobytes.dev you agree to these terms.

## Your access

- A purchase gives **one person** lifetime access to the course for personal learning.
- Please don't share your sign-in links, download or redistribute the videos, or resell course material.
- We may update course content over time. You keep access to the latest version.

## Payments

- Prices are shown in Bangladeshi Taka (BDT) and include any applicable charges shown at checkout.
- Coupon codes cannot be combined and have no cash value.

## Accounts

You don't need a password. You sign in with a link sent to the email address you used at checkout, so keep that inbox secure.

## Contact

Questions? Email [hello@twobytes.dev](mailto:hello@twobytes.dev).`,
};

export const REFUNDS: StaticPage = {
  path: '/refunds',
  title: 'Refund policy',
  description: 'Refund policy for courses bought on twobytes.dev.',
  body: `We want you to be happy with what you learn.

- If a course isn't right for you, email [hello@twobytes.dev](mailto:hello@twobytes.dev) within **7 days** of purchase with your order email, and tell us briefly why.
- Refunds are sent back through the original payment method, usually within 7–10 working days.
- Refunds aren't available once most of a course has been completed, or for repeated purchases and refunds of the same course.`,
};

export const STATIC_PAGES = [ABOUT, PRIVACY, TERMS, REFUNDS];

export const FAQ: { q: string; a: string }[] = [
  { q: 'Do I need to create an account?', a: 'No. Just enter your name, email and phone number at checkout. After you pay, we email you a link that opens your course area. No password needed.' },
  { q: 'How do I pay?', a: 'You can pay in Taka with bKash, Nagad, Rocket, Upay or any Visa, Mastercard or Amex card through our secure payment partner.' },
  { q: 'How long do I have access?', a: 'For life. Buy once and watch at your own pace, on any device, as many times as you like. You also get future updates to the course.' },
  { q: 'I bought a course. How do I watch it?', a: 'Open the link in your purchase email, or go to My courses and enter the email you used at checkout. We will send you a fresh sign-in link.' },
  { q: 'Can I get a refund?', a: 'Yes. If a course is not right for you, email us within 7 days of purchase. See the refund policy for details.' },
];
