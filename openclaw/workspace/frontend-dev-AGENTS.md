# Frontend Dev Agent — OpenClaw Operating Manual

## 1. Quick Commands

```bash
# Development
npm run dev                          # Start Next.js dev server (hot reload)
npm run build                        # Production build (checks types + bundles)
npm run start                        # Serve production build locally
npm run lint                         # ESLint check across project
npm run lint -- --fix                # Auto-fix lint issues
npx tsc --noEmit                     # Type-check without emitting files

# Testing
npm test                             # Run Jest + React Testing Library suite
npm test -- --watch                  # Watch mode for TDD workflow
npm test -- --coverage               # Generate coverage report
npx playwright test                  # Run end-to-end Playwright tests
npx playwright test --ui             # Interactive Playwright test runner
npx playwright codegen <url>         # Record browser interactions as tests

# Dependencies
npm install <package>                # Add a runtime dependency
npm install -D <package>             # Add a dev dependency
npm outdated                         # Check for outdated packages
npm audit                            # Security vulnerability scan

# Performance & Analysis
npx next info                        # Print Next.js environment info
npx @next/bundle-analyzer            # Analyze bundle sizes
npx lighthouse <url> --output=json   # Run Lighthouse audit

# OpenClaw Platform
openclaw status                      # Check platform health
openclaw gateway status              # Check gateway connectivity
node dist/index.js health            # Gateway health check

# Git
git status                           # Working tree status
git diff --cached                    # Review staged changes before commit
git log --oneline -10                # Recent commit history
```

## 2. Project Map

```
/home/node/.openclaw/workspace/
  AGENTS.md                              # Team-wide agent instructions
  frontend-dev-AGENTS.md                 # This file — frontend role manual
  memory/
    YYYY-MM-DD.md                        # Daily operational notes
  MEMORY.md                              # Long-term persistent memory

  <project>/
    app/                                 # Next.js App Router directory
      layout.tsx                         #   Root layout (wraps all pages)
      page.tsx                           #   Home route (/)
      loading.tsx                        #   Streaming fallback UI
      error.tsx                          #   Error boundary (must be "use client")
      not-found.tsx                      #   404 page
      globals.css                        #   Global styles / Tailwind directives
      (group)/                           #   Route groups (no URL segment)
      [slug]/                            #   Dynamic route segments
        page.tsx
    components/
      ui/                               #   Shared presentational components
      features/                         #   Feature-specific component trees
      layouts/                          #   Layout wrappers and shells
    lib/
      utils.ts                          #   Pure utility functions
      api.ts                            #   API client / fetch wrappers
      constants.ts                      #   App-wide constants
      validations.ts                    #   Zod schemas for form & API validation
    hooks/                              #   Custom React hooks
    stores/                             #   Zustand stores / state management
    types/                              #   Shared TypeScript type definitions
    public/                             #   Static assets (images, fonts, icons)
    tailwind.config.ts                  #   Tailwind configuration
    next.config.mjs                     #   Next.js configuration
    tsconfig.json                       #   TypeScript configuration
    package.json                        #   Dependencies and scripts
    .env.local                          #   Local environment variables (NEVER commit)
```

## 3. Tech Stack

| Layer              | Technology                                     |
| ------------------ | ---------------------------------------------- |
| Framework          | Next.js 14+ (App Router, React Server Components) |
| Language           | TypeScript (strict mode)                       |
| UI Library         | React 18+ (hooks, Suspense, concurrent features) |
| Styling            | Tailwind CSS 3.4+ (utility-first, responsive)  |
| State (client)     | Zustand (lightweight, no boilerplate)           |
| State (server)     | TanStack Query v5 (caching, revalidation)       |
| Forms              | React Hook Form + Zod validation                |
| Unit/Integration   | Jest + React Testing Library                    |
| E2E Testing        | Playwright (multi-browser)                      |
| Linting            | ESLint + eslint-config-next                     |
| Formatting         | Prettier (via editor or pre-commit hook)        |
| Runtime            | Node.js v22+                                    |
| Platform           | OpenClaw Docker workspace                       |

## 4. Standards

### Always Do

1. **Default to Server Components.** Only add `"use client"` when the component needs state, effects, event handlers, or browser APIs. Server Components ship zero client JS.
2. **Co-locate related files.** Keep component, styles, tests, and types together. A `Button/` folder contains `Button.tsx`, `Button.test.tsx`, and `Button.types.ts`.
3. **Type everything explicitly.** Use TypeScript strict mode. Define prop interfaces. Avoid `any` — use `unknown` and narrow with type guards when the type is truly uncertain.
4. **Validate at system boundaries.** Parse API responses and form inputs with Zod schemas. Trust internal types; verify external data.
5. **Use semantic HTML.** Prefer `<button>`, `<nav>`, `<main>`, `<section>`, `<article>` over generic `<div>` wrappers. This provides built-in accessibility and SEO benefits.
6. **Handle all UI states.** Every data-fetching component must account for loading, error, empty, and success states. Use Suspense boundaries and `error.tsx` files.
7. **Set explicit dimensions on media.** Always provide `width` and `height` (or `fill`) on `<Image>` components to prevent Cumulative Layout Shift.
8. **Write tests before marking done.** New components get at least one render test. New features get at least one integration test. Bug fixes get a regression test.
9. **Keep bundles small.** Use dynamic `import()` for heavy libraries. Check bundle impact with `@next/bundle-analyzer` before adding dependencies over 50KB.
10. **Run `npm run build` before reporting completion.** A green production build is the minimum bar for any deliverable.

### Never Do

1. **Never use `any` as a type escape hatch.** If you cannot type something, use `unknown` with runtime narrowing or create a proper generic.
2. **Never fetch data in Client Components when a Server Component can do it.** Server Components can `await` directly — no useEffect/useState dance needed.
3. **Never store server secrets in client-accessible code.** Environment variables without the `NEXT_PUBLIC_` prefix are server-only. Keep API keys, tokens, and secrets there.
4. **Never use `useEffect` for derived state.** If a value can be computed from props or other state, compute it during render. `useMemo` is acceptable for expensive computations.
5. **Never skip the `key` prop on list items.** Use stable, unique identifiers — never array indices (unless the list is static and never reordered).
6. **Never ignore accessibility.** Every interactive element needs a visible label or `aria-label`. Every image needs meaningful `alt` text (or `alt=""` for decorative images).
7. **Never commit `.env.local` or secrets.** Add sensitive files to `.gitignore`. Use `.env.example` to document required variables.
8. **Never suppress TypeScript or ESLint errors.** Fix the root cause. If a rule is genuinely wrong for the project, disable it in config with a comment explaining why.
9. **Never mutate state directly.** Always use setter functions from `useState` or Zustand's `set()`. React depends on immutable updates for correct rendering.
10. **Never add a dependency without checking bundle size.** Use [bundlephobia.com](https://bundlephobia.com) or `@next/bundle-analyzer` first.

## 5. Golden Examples

### Example 1: Server Component with Data Fetching

```tsx
// app/products/page.tsx — Server Component (default, no "use client")
import { ProductCard } from '@/components/features/ProductCard';
import { getProducts } from '@/lib/api';

export default async function ProductsPage() {
  const products = await getProducts(); // Direct async/await, no hooks needed

  if (products.length === 0) {
    return <p className="text-center text-gray-500 py-12">No products found.</p>;
  }

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Products</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </main>
  );
}
```

### Example 2: Client Component with Form (React Hook Form + Zod)

```tsx
// components/features/ContactForm.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const contactSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  message: z.string().min(10, 'Message must be at least 10 characters'),
});

type ContactFormData = z.infer<typeof contactSchema>;

export function ContactForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
  });

  async function onSubmit(data: ContactFormData) {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) reset();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-md" noValidate>
      <div>
        <label htmlFor="name" className="block text-sm font-medium">Name</label>
        <input id="name" {...register('name')} className="mt-1 w-full border rounded px-3 py-2" />
        {errors.name && <p className="text-red-600 text-sm mt-1">{errors.name.message}</p>}
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-medium">Email</label>
        <input id="email" type="email" {...register('email')} className="mt-1 w-full border rounded px-3 py-2" />
        {errors.email && <p className="text-red-600 text-sm mt-1">{errors.email.message}</p>}
      </div>
      <div>
        <label htmlFor="message" className="block text-sm font-medium">Message</label>
        <textarea id="message" rows={4} {...register('message')} className="mt-1 w-full border rounded px-3 py-2" />
        {errors.message && <p className="text-red-600 text-sm mt-1">{errors.message.message}</p>}
      </div>
      <button type="submit" disabled={isSubmitting} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50">
        {isSubmitting ? 'Sending...' : 'Send Message'}
      </button>
    </form>
  );
}
```

### Example 3: Custom Hook with TanStack Query

```tsx
// hooks/useProducts.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Product } from '@/types/product';

async function fetchProducts(): Promise<Product[]> {
  const res = await fetch('/api/products');
  if (!res.ok) throw new Error(`Failed to fetch products: ${res.status}`);
  return res.json();
}

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: fetchProducts,
    staleTime: 5 * 60 * 1000, // 5 minutes before refetch
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetch(`/api/products/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });
}
```

### Example 4: Zustand Store for Client State

```tsx
// stores/uiStore.ts
import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: false,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
```

### Example 5: Accessible, Responsive Tailwind Component

```tsx
// components/ui/Card.tsx
interface CardProps {
  title: string;
  description: string;
  href: string;
  imageSrc: string;
  imageAlt: string;
}

export function Card({ title, description, href, imageSrc, imageAlt }: CardProps) {
  return (
    <article className="group rounded-lg border border-gray-200 overflow-hidden transition-shadow hover:shadow-lg focus-within:ring-2 focus-within:ring-blue-500">
      <img src={imageSrc} alt={imageAlt} width={400} height={225} className="w-full h-auto object-cover" loading="lazy" />
      <div className="p-4 sm:p-6">
        <h3 className="text-lg font-semibold group-hover:text-blue-600 transition-colors">
          <a href={href} className="after:absolute after:inset-0 focus:outline-none">
            {title}
          </a>
        </h3>
        <p className="mt-2 text-sm text-gray-600 line-clamp-2">{description}</p>
      </div>
    </article>
  );
}
```

## 6. Legacy / Avoid

| Deprecated Pattern                    | Use Instead                                          |
| ------------------------------------- | ---------------------------------------------------- |
| `pages/` directory routing            | `app/` directory with App Router                     |
| `getServerSideProps` / `getStaticProps` | Server Components with direct `async/await`         |
| `useEffect` for data fetching         | Server Components or TanStack Query                  |
| Class components / `this.setState`    | Functional components with hooks                     |
| CSS Modules or styled-components      | Tailwind CSS utility classes                         |
| Redux / Redux Toolkit                 | Zustand (client state) + TanStack Query (server state) |
| `<img>` HTML tag                      | `next/image` `<Image>` component                     |
| `<a>` for internal links              | `next/link` `<Link>` component                       |
| `React.FC` type annotation            | Direct prop interface: `function Foo(props: FooProps)` |
| `PropTypes` runtime validation        | TypeScript interfaces + Zod at boundaries            |
| Manual `fetch` + `useEffect` + `useState` | TanStack Query `useQuery` / `useMutation`        |
| Inline styles                         | Tailwind classes or CSS variables                    |
| `var` declarations                    | `const` by default, `let` only when reassignment needed |
| `// @ts-ignore`                       | Fix the type error or use `// @ts-expect-error` with explanation |

## 7. Testing & Verification

### Unit & Integration Tests (Jest + React Testing Library)

- Test **behavior**, not implementation. Query by role, label, or text — never by CSS class or test ID alone.
- Use `screen.getByRole('button', { name: /submit/i })` over `screen.getByTestId('submit-btn')`.
- Test user interactions with `userEvent` (preferred over `fireEvent` for realistic events).
- Mock API calls at the network level with `msw` (Mock Service Worker), not by mocking fetch directly.
- Assert on visible outcomes: text appearing, elements showing/hiding, navigation occurring.

### End-to-End Tests (Playwright)

- Test critical user journeys: signup, login, core feature flow, checkout.
- Use `page.getByRole()` and `page.getByText()` locators for resilient selectors.
- Run against production build (`npm run build && npm run start`) for realistic conditions.
- Configure retries in `playwright.config.ts` for CI stability.

### Verification Checklist

```
[ ] npm run build          — Zero TypeScript errors, clean production bundle
[ ] npm run lint           — Zero ESLint warnings or errors
[ ] npm test               — All unit/integration tests pass
[ ] npx playwright test    — All E2E tests pass
[ ] Manual keyboard nav    — All interactive elements reachable and operable via Tab/Enter/Space
[ ] Lighthouse audit       — Performance 90+, Accessibility 95+, Best Practices 95+
```

## 8. PR / Commit Workflow

### Branch Naming

```
feat/short-description      # New feature
fix/issue-or-bug-name       # Bug fix
refactor/what-changed       # Code improvement (no behavior change)
test/what-is-tested         # Adding or improving tests
```

### Commit Message Format

```
<type>(<scope>): <imperative summary>

<optional body explaining why, not what>
```

**Types:** `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `style`

**Examples:**

```
feat(products): add search filtering to product list page
fix(auth): prevent redirect loop when session expires
perf(images): convert hero images to AVIF with fallback
test(contact): add E2E test for form submission flow
```

### Definition of Done

- [ ] Code compiles: `npm run build` passes
- [ ] Lint clean: `npm run lint` shows zero issues
- [ ] Tests pass: `npm test` and `npx playwright test` green
- [ ] Types safe: `npx tsc --noEmit` passes
- [ ] Accessibility: keyboard navigation works, no console a11y warnings
- [ ] Reviewed: self-review diff, no debug code, no console.log statements
- [ ] Documented: updated relevant docs if behavior changed

## 9. Boundaries

### Always (no approval needed)

- Read any file in the workspace
- Run `npm run dev`, `npm run build`, `npm run lint`, `npm test`, `npx tsc --noEmit`
- Install dev dependencies (`npm install -D`)
- Create or modify files under `components/`, `hooks/`, `stores/`, `lib/`, `types/`
- Create or modify test files
- Fix lint errors and type errors
- Write to daily memory file (`workspace/memory/YYYY-MM-DD.md`)

### Ask First

- Install runtime dependencies that add >50KB to bundle
- Modify `next.config.mjs`, `tsconfig.json`, `tailwind.config.ts`, or ESLint config
- Change authentication or authorization logic
- Delete existing components or features
- Modify environment variable schemas
- Restructure the `app/` directory routing
- Deploy or push to remote

### Never

- Commit `.env.local`, API keys, tokens, or secrets
- Disable TypeScript strict mode or ESLint rules globally
- Push directly to `main` without review
- Run `rm -rf` on project directories
- Access or exfiltrate user/private data
- Fabricate test results or skip failing tests
- Bypass security controls or safety boundaries

## 10. Troubleshooting

### 1. "Module not found" after adding import

**Cause:** Missing dependency or incorrect path alias.
**Fix:** `npm install <package>` then verify `tsconfig.json` has `"@/*": ["./src/*"]` path alias configured.

### 2. Hydration mismatch error in console

**Cause:** Server-rendered HTML differs from client-rendered output. Common with `Date.now()`, `Math.random()`, or browser-only APIs.
**Fix:** Wrap browser-dependent code in `useEffect` or gate with `typeof window !== 'undefined'`. Move dynamic content to Client Components.

### 3. "Text content does not match server-rendered HTML"

**Cause:** Extension or third-party script modifying DOM before hydration.
**Fix:** Add `suppressHydrationWarning` to the affected element or move content to a Client Component with `useEffect` for browser-specific values.

### 4. Next.js `<Image>` component shows broken image

**Cause:** External domain not configured in `next.config.mjs`.
**Fix:** Add the domain to `images.remotePatterns` in `next.config.mjs`:
```js
images: { remotePatterns: [{ protocol: 'https', hostname: 'example.com' }] }
```

### 5. Tailwind classes not applying

**Cause:** Class name not in Tailwind's content scan paths or using dynamic class construction.
**Fix:** Ensure `tailwind.config.ts` content array includes all component paths. Use complete class names (e.g., `text-red-500`) — never construct them dynamically (`text-${color}-500`).

### 6. `useEffect` runs twice in development

**Cause:** React Strict Mode intentionally double-invokes effects in dev to catch bugs.
**Fix:** This is expected behavior. Ensure effects are idempotent and have proper cleanup functions. Do not disable Strict Mode.

### 7. TanStack Query returns stale data

**Cause:** Stale time too long or missing query invalidation after mutation.
**Fix:** Call `queryClient.invalidateQueries({ queryKey: ['resource'] })` in the mutation's `onSuccess` callback. Adjust `staleTime` if appropriate.

### 8. Playwright test fails with "locator resolved to hidden element"

**Cause:** Element exists in DOM but is not visible (CSS `display: none`, off-screen, etc.).
**Fix:** Use `await page.getByRole('button', { name: 'Submit' }).waitFor({ state: 'visible' })` before interacting.

### 9. `npm run build` fails with "Type error" but IDE shows no errors

**Cause:** IDE TypeScript version differs from project version, or files excluded from `tsconfig.json`.
**Fix:** Run `npx tsc --noEmit` to see exact errors. Ensure all source files are included in `tsconfig.json`'s `include` array.

### 10. Layout shift (CLS) on page load

**Cause:** Images without dimensions, dynamically injected content, or fonts loading late.
**Fix:** Set explicit `width`/`height` on all images, use `font-display: swap` in font declarations, and reserve space for async content with skeleton placeholders.

## 11. How to Improve

- **Record daily learnings.** Write notable patterns, fixes, and mistakes to `workspace/memory/YYYY-MM-DD.md` at end of each session.
- **Update long-term memory.** When a pattern is confirmed across multiple sessions, promote it to `workspace/MEMORY.md`.
- **Track bundle size trends.** Note bundle sizes after significant changes. A steadily growing bundle signals the need for code splitting.
- **Monitor Lighthouse scores.** Run audits after feature work. Regressions in Performance or Accessibility scores should be fixed before marking done.
- **Review this manual quarterly.** Remove outdated guidance, add new proven patterns, and update version numbers as the stack evolves.
- **Learn from production errors.** When bugs reach production, add a troubleshooting entry here and a regression test in the test suite.
- **Update the Legacy / Avoid table.** When the team officially adopts a new pattern or deprecates an old one, record it in Section 6 so all agents stay aligned.
