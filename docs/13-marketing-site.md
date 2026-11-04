# 13. Marketing Site

Version 1.0, 03 Nov 2026. Owner: Product and Design.

The public site lives in the same Next.js application under the `(marketing)` route group, rendered statically and served from the Edge. It shares the design tokens from document 09 so the product and the site look like one company.

## 1. Visual direction

The site reads as a serious business software company, not a startup landing page template. Reference points: microsoft.com product pages, Asana and Linear marketing pages for structure, without their decorative flourishes.

- White and canvas gray surfaces, accent blue for actions and highlights, generous whitespace.
- Headings in Segoe UI Semibold (Aptos Display where available), body 16 px on marketing pages, 14 px in embedded product screenshots.
- Real product screenshots at 2x, in a 1 px border with 8 px radius, no browser chrome mockups, no floating 3D devices, no abstract blobs.
- One short product demo video (60 seconds, muted autoplay with controls) on the home page.
- Icons from the same Fluent set as the product.
- Dark mode follows the system.

## 2. Site map

| Path | Page | Purpose |
|---|---|---|
| / | Home | Positioning, views showcase, workflow coverage, integrations, social proof, CTA |
| /features | Features overview | Links to feature pages |
| /features/views | Views | One section per view with screenshot and three-line description |
| /features/planning | Planning | Gantt, dependencies, critical path, baselines, cycles, workload |
| /features/automation | Automation and forms | |
| /features/reporting | Dashboards, portfolios, goals, status updates | |
| /features/integrations | Integrations | Connector grid, API, webhooks |
| /solutions/engineering, /solutions/marketing, /solutions/operations, /solutions/agencies | Solutions | Persona pages mapping workflows to templates |
| /templates and /templates/[slug] | Template gallery | Public, indexable, each with a preview and "Use template" CTA |
| /pricing | Pricing | Tiers, comparison table, FAQ |
| /customers | Customers | Logos and stories (placeholder until available) |
| /changelog | Changelog | Monthly entries |
| /developers | Developer hub | API reference (rendered from OpenAPI), webhooks guide, SDKs |
| /security | Security | Controls, subprocessors, compliance status |
| /about | About | |
| /legal/terms, /legal/privacy, /legal/dpa, /legal/subprocessors | Legal | |
| /sign-in, /sign-up | Auth | Clerk components with the product theme |

## 3. Home page sections

1. **Hero.** Headline (large-title): "Plan, track, and deliver work. In one place, in every view." Subhead: "Lists, boards, Gantt charts, timelines, calendars, and workload in one fast workspace for every team." Two buttons: "Start free" (primary) and "See how it works" (secondary, scrolls to the video). Below: a full-width product screenshot of Gantt with the task pane open.
2. **Views strip.** Eight tabs that swap a screenshot: List, Board, Table, Gantt, Timeline, Calendar, Workload, Dashboard. Caption: "One set of filters. Every view."
3. **Three value pillars.** Calm, Fast, Complete, each with one sentence and a 20 px icon.
4. **Workflows.** Grid of Kanban, Scrum, Shape Up, Gantt plan, Request intake, OKRs, each linking to a template.
5. **Planning depth.** Dependencies, critical path, baselines, workload, with an annotated screenshot.
6. **Integrations.** Logo grid for Slack, Microsoft Teams, GitHub, Google Calendar, Outlook, Zapier, Make, plus "Open API and webhooks".
7. **Security and trust.** SSO-ready, encryption, data export, SOC 2 roadmap statement.
8. **Pricing teaser.** Three tier cards.
9. **Final CTA.** "Start free. No credit card." with the sign-up button.
10. **Footer.** Product, Solutions, Resources, Company, Legal columns; social links; language selector placeholder.

## 4. Pricing page

Decision (03 Nov 2026): TaskParty is free for every workspace during the beta, and workspaces created during the beta receive an early-adopter discount for life when paid tiers launch. The pricing page during beta shows one message ("Free while in beta. Early adopters keep a reduced price.") with a sign-up button and a short FAQ. The tiers below are the draft for the paid launch and stay unpublished until then:

| | Free | Team | Business | Enterprise |
|---|---|---|---|---|
| Price per user per month (annual) | $0 | $9 | $16 | Contact |
| Members | Up to 10 | Unlimited | Unlimited | Unlimited |
| Projects | Unlimited | Unlimited | Unlimited | Unlimited |
| Views | All eight | All eight | All eight | All eight |
| Custom fields | 5 per project | Unlimited | Unlimited plus formula, roll-up, relation | Same |
| Automations | 100 runs per month | 10,000 runs | Unlimited | Unlimited |
| Forms | 1 per project | Unlimited | Unlimited plus branding removal | Same |
| Portfolios and goals | No | Yes | Yes | Yes |
| Baselines, critical path | Yes | Yes | Yes | Yes |
| Guests | 5 | Unlimited | Unlimited | Unlimited |
| API and webhooks | Read only, 1 webhook | Full | Full with higher limits | Custom limits |
| Connectors | Slack or Teams | All | All | All plus custom |
| Admin | Basic | Teams, libraries | Audit log, advanced permissions | SSO, SCIM, data residency, DPA, SLA |
| Support | Community | Email | Priority | Dedicated |

Principle carried from document 01: Gantt, Workload, and Dashboards are never gated behind a higher tier.

Page elements: monthly and annual toggle, tier cards with "Start free", "Start trial", "Contact sales"; full comparison table; FAQ (billing, seats, guests, non-profit and education discounts, cancellation).

## 5. Copy guidelines

- Sentence case headings. No dashes. No exclamation marks.
- Concrete over superlative: "Drag a bar and dependent tasks move with it" beats "Powerful scheduling."
- Each feature paragraph is at most three sentences.
- Say "people" or "teams", not "users", in marketing copy.

## 6. SEO and performance

- Static generation for all marketing routes; revalidate changelog and templates hourly.
- Metadata per page, Open Graph images generated from a template, structured data for SoftwareApplication and Offer.
- Lighthouse targets: Performance 95, Accessibility 100, Best Practices 100, SEO 100.
- Fonts: system Segoe UI with Selawik self-hosted fallback, `font-display: swap`, preloaded.
- Images in AVIF and WebP through `next/image`.

## 7. Analytics and conversion

PostHog with cookie-less tracking by default and a consent banner only where required. Events: page view, CTA click (with location), pricing toggle, template view, sign-up started, sign-up completed.

## 8. Dependencies before build

Final product name and domain (document 02, section 1.3), logo and wordmark, at least six real product screenshots from the Phase 1 build, a 60-second demo video, and the pricing decision.
