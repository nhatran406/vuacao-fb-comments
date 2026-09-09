# SocialPulse AI — Premium Design System Specification

## 1. Brand Vision & Aesthetic
**SocialPulse AI** delivers an advanced market intelligence, sentiment analysis, and social scraping workspace.
The aesthetic combines **AI Generative Style (Multi-stop Mesh Gradients)**, **Glassmorphism (Frosted Glass & Depth)**, and **Fintech Precision UI** (clear metrics, clean cards, crisp borders, and smooth transitions).

---

## 2. Color Palette & Token Definitions

### 2.1 AI Generative Gradients
- **`--gradient-ai-primary`**: `linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #06b6d4 100%)` (Indigo -> Electric Purple -> Cyan)
- **`--gradient-ai-accent`**: `linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)` (Pink Violet Highlight)
- **`--gradient-surface-glass`**: `linear-gradient(180deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.90) 100%)`
- **`--gradient-card-glow`**: `radial-gradient(circle at top right, rgba(124, 58, 237, 0.08), transparent 70%)`
- **`--gradient-success`**: `linear-gradient(135deg, #10b981 0%, #059669 100%)`
- **`--gradient-danger`**: `linear-gradient(135deg, #ef4444 0%, #dc2626 100%)`
- **`--gradient-warning`**: `linear-gradient(135deg, #f59e0b 0%, #d97706 100%)`

### 2.2 Semantic Solid Tones
- **Background Root**: `#0f172a` (Deep Slate for Contrast Accents) & `#f8fafc` (Ultra-crisp canvas)
- **Surface Elevation**: `#ffffff` (Cards), `#f1f5f9` (Light gray pill backgrounds)
- **Borders & Dividers**: `rgba(226, 232, 240, 0.8)` with `rgba(99, 102, 241, 0.2)` on active focus
- **Text Main**: `#0f172a` (Slate 900 - High legibility)
- **Text Muted**: `#64748b` (Slate 500 - Supportive details)

### 2.3 Shadows & Ambient Glows
- **`--shadow-subtle`**: `0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)`
- **`--shadow-card`**: `0 4px 20px -2px rgba(15, 23, 42, 0.05), 0 2px 6px -1px rgba(15, 23, 42, 0.02)`
- **`--shadow-ai-glow`**: `0 8px 25px -4px rgba(99, 102, 241, 0.25)`
- **`--shadow-card-hover`**: `0 12px 30px -4px rgba(99, 102, 241, 0.12), 0 4px 10px -2px rgba(15, 23, 42, 0.04)`

---

## 3. Typography & Micro-Hierarchy
- **Font Stack**: `-apple-system, BlinkMacSystemFont, "Plus Jakarta Sans", "SF Pro Display", "Segoe UI", Roboto, sans-serif`
- **Title Tracking**: `-0.025em` letter-spacing for premium tech look.
- **Metric Numbers**: `tabular-nums` alignment with semi-bold weights for rapid data scanning.

---

## 4. Components & Elevation Rules
1. **App Header**: Rich AI Aurora Gradient with soft blur backdrop and vibrant pulse indicator.
2. **Metric Banners**: Interactive Cards with subtle top borders, glowing numeric pills, and contextual icon badges.
3. **Group Cards**: Rounded `16px` containers, glowing headers, segmented action buttons, and clean row borders.
4. **Action Buttons**:
   - `btn-primary`: AI Gradient fill, white text, subtle hover lift `transform: translateY(-1px)`.
   - `btn-ai`: Translucent violet with gradient border and shimmering glow.
   - `btn-outline`: Crisp Slate border with frosted background hover.
5. **Modal & Floating Widgets**: Full frosted glass (`backdrop-filter: blur(12px)`), rounded corners, smooth entrance transitions.
