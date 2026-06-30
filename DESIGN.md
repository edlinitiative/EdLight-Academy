---
version: alpha
name: EdLight-Academy-design
description: >
  EdLight Academy is a mobile-first educational platform built for Haitian students preparing for the national Baccalauréat exam. The visual language is clean, serious, and motivating — a deep institutional blue (#0857A6) anchors a light blue-gray page surface (#f4f6fb), white cards lift content off the background, and a warm amber-yellow gamification accent rewards progress. The system borrows structural energy from Duolingo-style gamification (XP, streaks, leaderboard) while maintaining the respectability of an academic platform. Light theme only; all text and surfaces are calibrated for strong legibility in outdoor and classroom conditions across Android and iOS.

colors:
  # Brand
  primary: "#0857A6"          # Main brand blue — headers, CTAs, icon tints, shadow color
  primary-light: "#4A93DD"    # Math subject accent, lighter interactive states
  primary-medium: "#0A66C2"   # Chemistry accent (chem), slightly brighter blue
  primary-dark: "#1e3a5f"     # Rarely used deep navy — hero text overlay fallback

  # Tailwind primary scale (NativeWind)
  primary-50: "#eff6ff"       # Chip / badge background for blue context
  primary-100: "#dbeafe"      # Avatar background, light blue tint
  primary-500: "#4A93DD"      # Mid-blue — math color, lighter interactive
  primary-600: "#0857A6"      # primary — the brand canonical
  primary-700: "#0A66C2"      # Hover-adjacent, chemistry subject
  primary-900: "#1e3a5f"      # Deep navy — rarely used

  # Page & surface
  page-bg: "#f4f6fb"          # All screen backgrounds — very light blue-gray
  surface: "#ffffff"          # Card, modal, bottom bar backgrounds
  surface-border: "#e8edf5"   # Card borders — cool blue-tinted light gray
  header-bg: "#0857A6"        # Dashboard hero banner
  header-overlay: "rgba(255,255,255,0.2)"   # Avatar circle on dark header
  header-overlay-dimmer: "rgba(255,255,255,0.15)"  # Chip backgrounds on hero

  # Text
  text-primary: "#0f172a"     # Display / heading text — near-black slate
  text-body: "#111827"        # Body text, card title
  text-secondary: "#374151"   # Secondary body — pill text on exam landing
  text-tertiary: "#64748b"    # Subheadings, description text
  text-muted: "#94a3b8"       # Placeholder, sub-labels, de-emphasized
  text-placeholder: "#9ca3af" # Input placeholders, inactive icons, empty states
  text-on-primary: "#ffffff"  # Text on primary blue backgrounds
  text-blue-200: "#bfdbfe"    # Subtitle text inside blue hero header
  text-blue-300: "#93c5fd"    # Email / tertiary text inside blue header
  text-amber-xp: "#fde68a"    # XP badge text on dark hero

  # Semantic / functional
  success: "#10b981"          # Correct answer, SVT subject, positive states
  success-light: "#22c55e"    # Readiness score 75–90%
  success-bg: "#f0fdf4"       # Correct answer option background
  success-dark: "#059669"     # Correct feedback label
  success-emerald: "#15803d"  # SVT subject (darker)

  warning: "#f59e0b"          # XP, amber accent, selected answer ring, confirm CTA
  warning-bg: "#fffbeb"       # Selected answer background, amber-50
  warning-light: "#fbbf24"    # Level chip zap icon
  warning-text: "#d97706"     # Amber-600 — XP text label

  danger: "#ef4444"           # Streak flame icon, wrong answer, timer critical
  danger-bg: "#fef2f2"        # Wrong answer background, red-50
  danger-dark: "#dc2626"      # Error state, wrong feedback label, logout text
  danger-label: "#fef2f2"     # Soft red backgrounds

  info-blue: "#3b82f6"        # Current question nav dot, quiz player accent
  purple: "#7c3aed"           # University level, Trivia/Zap accent, English subject
  purple-vivid: "#8b5cf6"     # Anglais subject, achievements chip
  orange: "#f97316"           # History subject, readiness mid-range warning
  pink: "#ec4899"             # Achievement chip accent
  teal: "#0891b2"             # Chemistry subject (exams landing)
  teal-dark: "#0e7490"        # Chemistry subject (readiness)

  # Leaderboard rank badges
  gold: "#FFD700"             # Rank 1 crown icon
  gold-bg: "#FFD70020"        # Rank 1 badge background
  gold-text: "#B8860B"        # Rank 1 text
  silver: "#A0A0A0"           # Rank 2 medal icon
  silver-bg: "#C0C0C020"      # Rank 2 badge background
  silver-text: "#808080"      # Rank 2 text
  bronze: "#CD7F32"           # Rank 3 medal icon
  bronze-bg: "#CD7F3220"      # Rank 3 badge background
  bronze-text: "#8B4513"      # Rank 3 text

  # Gamification subject palette (ReadinessCard / ExamLanding)
  subject-math: "#4A93DD"
  subject-phys: "#0857A6"
  subject-chem: "#0e7490"
  subject-svt: "#15803d"
  subject-fr: "#f59e0b"
  subject-en: "#8b5cf6"
  subject-econ: "#10b981"
  subject-hist: "#f97316"

  # Miscellaneous UI
  divider: "#e5e7eb"          # Horizontal rules, nav bar top border, progress track
  divider-soft: "#f0f0f0"     # SVG progress ring track
  overlay-light: "#f3f4f6"    # Locked achievement background, unselected states
  tab-inactive: "#9ca3af"     # Bottom tab bar inactive icons/text
  chevron-muted: "#cbd5e1"    # Widget chevron, de-emphasized arrow

typography:
  # Display headings (screen titles)
  display-lg:
    fontFamily: System        # SF Pro on iOS, Roboto on Android
    fontSize: 26px
    fontWeight: "800"
    color: "#0f172a"
    letterSpacing: -0.5px
    usage: "Screen page titles — Cours, Examens, Trivia Games, Quiz"

  display-md:
    fontFamily: System
    fontSize: 24px
    fontWeight: "bold"
    color: "#111827"
    usage: "Auth screen brand title, results screen headline"

  # Hero text (on dark background)
  hero-greeting:
    fontFamily: System
    fontSize: 24px            # text-2xl
    fontWeight: "700"
    color: "#ffffff"
    usage: "Dashboard greeting — Bonjour, {name}"

  hero-label:
    fontFamily: System
    fontSize: 14px            # text-sm
    fontWeight: "500"
    color: "#bfdbfe"          # blue-200
    usage: "Dashboard top-of-header label ('Tableau de bord')"

  # Section headings
  section-title:
    fontFamily: System
    fontSize: 16px            # text-base
    fontWeight: "700"
    color: "#111827"
    usage: "Section heading above card groups ('Continuer à apprendre', 'Classement')"

  section-title-sm:
    fontFamily: System
    fontSize: 15px
    fontWeight: "700"
    color: "#0f172a"
    usage: "ReadinessCard title, 'Par matière' heading"

  # Card / content headings
  card-title:
    fontFamily: System
    fontSize: 16px
    fontWeight: "800"
    color: "#0f172a"
    lineHeight: 22px
    usage: "Category card and level card primary label"

  card-title-sm:
    fontFamily: System
    fontSize: 14px
    fontWeight: "700"
    color: "#111827"
    usage: "Course card name, quiz card title"

  card-title-semibold:
    fontFamily: System
    fontSize: 14px
    fontWeight: "600"
    color: "#0f172a"
    usage: "Quiz title inside QuizzesScreen"

  # Body text
  body-md:
    fontFamily: System
    fontSize: 14px
    fontWeight: "500"
    color: "#374151"
    usage: "Subject chip text on exam landing, filter pill text"

  body-sm:
    fontFamily: System
    fontSize: 13px
    fontWeight: "400"
    color: "#64748b"
    lineHeight: 18px
    usage: "Card sublabel, description text under level label"

  body-xs:
    fontFamily: System
    fontSize: 12px
    fontWeight: "400"
    color: "#94a3b8"
    usage: "Tertiary card description, lesson count, 'XP' unit suffix"

  # Numerics / stats
  kpi-value:
    fontFamily: System
    fontSize: 20px            # text-xl
    fontWeight: "700"
    color: "#111827"
    usage: "KPI card primary value (streak count, quiz count)"

  widget-value:
    fontFamily: System
    fontSize: 20px
    fontWeight: "800"
    letterSpacing: -0.5px
    lineHeight: 24px
    color: "{accent}"         # Inherits widget accent color
    usage: "HomeWidget big value (rank, count, 'Jouer')"

  donut-pct:
    fontFamily: System
    fontSize: 22px
    fontWeight: "800"
    color: "#111827"
    usage: "SVG donut ring center percentage"

  timer-count:
    fontFamily: System
    fontSize: 14px
    fontWeight: "800"
    color: "{timer-color}"    # Green >8s, amber 5–8s, red <5s
    usage: "Trivia countdown number inside SVG ring"

  score-fraction:
    fontFamily: System
    fontSize: 22px
    fontWeight: "800"
    color: "#111827"
    usage: "Results screen score (e.g. 8/10)"

  # Labels
  chip-text:
    fontFamily: System
    fontSize: 11px
    fontWeight: "600"
    color: "{subject-color}"
    usage: "Subject/level chip label on course cards"

  chip-text-sm:
    fontFamily: System
    fontSize: 10px
    fontWeight: "normal"
    color: "#94a3b8"
    usage: "Widget sub-line text"

  label-tab:
    fontFamily: System
    fontSize: 11px
    fontWeight: "500"
    color: "{active: #0857A6 | inactive: #9ca3af}"
    usage: "Bottom tab bar label"

  label-kpi:
    fontFamily: System
    fontSize: 12px            # text-xs
    fontWeight: "400"
    color: "#6b7280"          # gray-500
    usage: "KPI card label below value"

  label-link:
    fontFamily: System
    fontSize: 14px
    fontWeight: "500"
    color: "#0857A6"
    usage: "'Voir tout' navigation links"

  label-section-count:
    fontFamily: System
    fontSize: 12px
    fontWeight: "400"
    color: "#9ca3af"
    usage: "Count label above lists (e.g., '12 cours')"

  # Initials avatar
  avatar-initials-lg:
    fontFamily: System
    fontSize: 28px
    fontWeight: "800"
    color: "#ffffff"
    usage: "Large profile avatar (80×80)"

  avatar-initials-md:
    fontFamily: System
    fontSize: 16px
    fontWeight: "700"
    color: "#ffffff"
    usage: "Dashboard header avatar (48×48)"

  avatar-initials-sm:
    fontFamily: System
    fontSize: 12px
    fontWeight: "700"
    color: "#0857A6"          # primary-700 via NativeWind text-primary-700
    usage: "Leaderboard row avatar (32×32)"

  # Feedback / answer states
  feedback-correct:
    fontFamily: System
    fontSize: 16px            # text-base
    fontWeight: "700"
    color: "#059669"
    usage: "Answer feedback 'Correct !'"

  feedback-wrong:
    fontFamily: System
    fontSize: 16px
    fontWeight: "700"
    color: "#dc2626"
    usage: "Answer feedback 'Incorrect'"

  answer-option:
    fontFamily: System
    fontSize: 14px
    fontWeight: "500"
    color: "#111827"
    lineHeight: 20px
    usage: "Trivia answer option text"

  answer-letter:
    fontFamily: System
    fontSize: 14px
    fontWeight: "800"
    color: "{labelText}"      # Gray unselected, white when selected
    usage: "Letter badge inside answer option (A, B, C, D)"

rounded:
  none: 0
  sm: 8px                     # rounded-lg — small icon containers (w-7/w-8), filter toggle
  md: 10px                    # rounded-xl for settings tiles, some icon badges
  icon-badge: 10px            # Widget icon container (36×36), category icon (w-8 rounded-lg)
  icon-md: 12px               # Course icon (44×44), category icon (48×48), ExamLanding icon
  card: 16px                  # rounded-2xl — all primary content cards
  card-lg: 16px               # Standard card radius used everywhere
  hero-profile: 28px          # Profile hero bottom corners (borderBottomLeft/RightRadius)
  avatar-sm: 14px             # rounded-2xl on 56×56 achievement badge
  pill: 99px                  # Chip/badge pill shape (borderRadius: 99 or 999 or 100)
  full: 9999px                # Fully round — avatar circles, XP badge, score badge

spacing:
  # Base unit: 4px (standard React Native / Tailwind spacing)
  0: 0
  0.5: 2px
  1: 4px
  1.5: 6px
  2: 8px
  2.5: 10px
  3: 12px
  4: 16px       # Standard card inner padding
  5: 20px       # Horizontal screen padding
  6: 24px       # Section top padding
  7: 28px
  8: 32px       # Bottom scroll padding
  9: 36px
  10: 40px
  12: 48px      # Bottom scroll padding on profile

  # Named semantic aliases
  screen-h-pad: 20px          # Horizontal padding on all screens (px-5)
  card-pad: 16px              # Internal card padding (p-4)
  card-pad-sm: 12px           # Smaller stat/mini cards
  card-pad-widget: 14px       # HomeWidget internal padding
  section-gap: 20px           # Vertical gap between sections (mb-5)
  card-gap: 12px              # Gap between cards in a list (gap-3 / mb-3)
  widget-gap: 10px            # Gap between HomeWidgets (gap between columns and rows)
  kpi-gap: 8px                # Gap between KPI cards (gap-2)
  chip-px: 8px                # Horizontal padding inside subject chips
  chip-py: 2px                # Vertical padding inside subject chips
  pill-px: 12px               # Horizontal padding inside pill tags
  pill-py: 4px                # Vertical padding inside pill tags
  pill-px-md: 16px            # Filter pill wider tap area
  tab-height: 60px            # Bottom tab bar height
  tab-pb: 8px                 # Bottom tab bar paddingBottom
  header-search-h: 44px       # Trivia persistent header height
  icon-sm: 32px               # w-8/h-8 small icon containers
  icon-md: 36px               # w-9/h-9 KPI icon container
  icon-lg: 44px               # w-11/h-11 course icon / standard icon badge
  icon-xl: 48px               # 48×48 category/level icon badge
  avatar-md: 48px             # Dashboard header avatar
  avatar-lg: 80px             # Profile hero avatar

shadows:
  # All shadows use #0857A6 as shadowColor (tinted blue shadows)
  # This gives cards a brand-coherent subtle depth vs generic black shadows

  elevation-0:
    shadowColor: "#000000"    # Generic black — used on round picker / quiz items
    shadowOffset: "0 1px"
    shadowOpacity: 0.04
    shadowRadius: 2px
    elevation: 1              # Android equivalent
    usage: "Answer option cards, quiz round picker rows"

  elevation-1:
    shadowColor: "#0857A6"
    shadowOffset: "0 1px"
    shadowOpacity: 0.05
    shadowRadius: 4px
    elevation: 1
    usage: "KPI cards, mini stat cards, subject chips on exam landing"

  elevation-2:
    shadowColor: "#0857A6"
    shadowOffset: "0 1px"
    shadowOpacity: 0.06
    shadowRadius: 6px
    elevation: 2
    usage: "Standard content cards — courses, categories, leaderboard, readiness, HomeWidgets"

  elevation-2-deep:
    shadowColor: "#0857A6"
    shadowOffset: "0 2px"
    shadowOpacity: 0.07
    shadowRadius: 8px
    elevation: 2
    usage: "ExamLanding level cards (slightly more prominent)"

  elevation-3:
    shadowColor: "#0857A6"
    shadowOffset: "0 2px"
    shadowOpacity: 0.08
    shadowRadius: 8px
    elevation: 3
    usage: "XP progress card floating above hero (-marginTop: 20), highest emphasis"

  elevation-generic-sm:
    shadowColor: "#000000"
    shadowOffset: "0 1px"
    shadowOpacity: 0.05
    shadowRadius: 3px
    elevation: 1
    usage: "Feedback panel, RoundPicker option rows"

  elevation-generic-md:
    shadowColor: "#000000"
    shadowOffset: "0 1px"
    shadowOpacity: 0.06
    shadowRadius: 4px
    elevation: 2
    usage: "Question card in quiz player"

components:
  # ─── CARDS ──────────────────────────────────────────────────────────────────

  card-standard:
    description: "The universal white content card used across all screens."
    backgroundColor: "#ffffff"
    borderRadius: 16px
    borderWidth: 1px
    borderColor: "#e8edf5"
    padding: 16px
    shadow: elevation-2
    usage: "Course cards, leaderboard container, readiness card, stats card, quiz cards"

  card-mini:
    description: "Smaller stat or info card used in compact grids."
    backgroundColor: "#ffffff"
    borderRadius: 12px
    borderWidth: 1px
    borderColor: "#e8edf5"
    padding: 12px
    shadow: elevation-1
    usage: "ExamResults stat mini-cards in a flex-row"

  card-kpi:
    description: "KPI strip card — overlaps the blue header, 4-column row."
    backgroundColor: "#ffffff"
    borderRadius: 16px           # rounded-2xl
    borderWidth: 1px
    borderColor: "#e8edf5"
    padding: 12px                # p-3
    shadow: elevation-1
    layout: "flex-1, items-center, gap-1.5, vertical stack"
    parts:
      icon-container: "36×36, borderRadius 12, tinted background"
      value: "text-xl font-bold text-gray-900"
      label: "text-xs text-gray-500 text-center leading-tight"
    usage: "Dashboard — Streak, Quiz count, Course count, Average score"

  card-course:
    description: "Course list item — horizontal layout with icon badge, progress bar, and percentage."
    backgroundColor: "#ffffff"
    borderRadius: 16px
    borderWidth: 1px
    borderColor: "#e8edf5"
    padding: 16px
    shadow: elevation-2
    layout: "flex-row, icon left, content center, percentage right"
    parts:
      icon-badge:
        size: "44×44"
        borderRadius: 12px
        backgroundColor: "{courseColor}18"   # 10% opacity tint
        icon: BookOpen, size 20, color {courseColor}
      title: "font-bold text-gray-900 text-sm, up to 2 lines"
      chips: "subject chip + level chip, pill shape, 10% tint bg"
      lesson-count: "text-xs text-gray-400"
      percentage: "text-sm font-bold, color: {courseColor} if >0 else #9ca3af"
      progress-bar: "height 4px, full width, appears when pct > 0"
    usage: "CoursesScreen list, DashboardScreen 'Continuer à apprendre'"

  card-category:
    description: "Trivia category card — full-width, icon badge top-left, bottom accent stripe."
    backgroundColor: "#ffffff"
    borderRadius: 16px
    borderWidth: 1px
    borderColor: "#e8edf5"
    shadow: elevation-2
    overflow: hidden
    padding: 16px
    parts:
      icon-badge:
        size: "48×48"
        borderRadius: 12px
        backgroundColor: "{cat.color}18"
        icon: emoji, fontSize 24
      title: "fontWeight 800, fontSize 16, lineHeight 22, color #0f172a"
      description: "fontSize 13, color #64748b, lineHeight 18, maxLines 2"
      count-chip: "self flex-start, borderRadius 99, bg {cat.color}14, px 8 py 3"
      cta-row: "flex-row, gap 4, 'Jouer' text in {cat.color} fontWeight 700 fontSize 14 + ChevronRight"
      bottom-stripe: "height 3, backgroundColor {cat.color}, full width"
    usage: "TriviaScreen category picker"

  card-level-exam:
    description: "Exam level card — left accent stripe + content, used on ExamLanding."
    backgroundColor: "#ffffff"
    borderRadius: 16px
    borderWidth: 1px
    borderColor: "#e8edf5"
    shadow: elevation-2-deep
    overflow: hidden
    layout: "flex-row — 4px left stripe + content area"
    parts:
      left-stripe:
        width: 4px
        backgroundColor: "{level.color}"
      icon-badge:
        size: "48×48"
        borderRadius: 12px
        backgroundColor: "{level.color}14"
        content: emoji, fontSize 26
        marginBottom: 10px
      title: "fontWeight 800, fontSize 16, lineHeight 22, color #0f172a"
      sublabel: "fontSize 13, color #64748b, lineHeight 18"
      description: "fontSize 12, color #94a3b8"
      cta-row: "color {level.color}, fontSize 14, fontWeight 700 + ChevronRight"
    usage: "ExamLandingScreen — Terminale, 9ème Année, Université"

  card-widget:
    description: "HomeWidget — 2×2 tonal grid, each widget is a stat + navigation shortcut."
    backgroundColor: "#ffffff"
    borderRadius: 16px
    borderWidth: 1px
    borderColor: "#e8edf5"
    padding: 14px
    minHeight: 110px
    shadow: elevation-2
    layout: "justifyContent space-between, vertical"
    parts:
      header-row: "flex-row, justify space-between"
      icon-container:
        size: "36×36"
        borderRadius: 10px
        backgroundColor: "{accent}16"    # 9% opacity
        icon: 18px
      chevron: "color #cbd5e1, size 14"
      value: "fontSize 20, fontWeight 800, letterSpacing -0.5, lineHeight 24, color {accent}"
      title: "fontSize 12, fontWeight 600, color #0f172a"
      sub: "fontSize 10, color #94a3b8"
    usage: "DashboardScreen 2×2 grid — Examens, Trivia, Classement, Cours"

  card-readiness:
    description: "Readiness/preparedness composite card with SVG donut and subject progress bars."
    backgroundColor: "#ffffff"
    borderRadius: 16px
    borderWidth: 1px
    borderColor: "#e8edf5"
    padding: 16px
    shadow: elevation-2
    parts:
      header-row: "Target icon #0857A6 + 'Score de préparation' text"
      donut:
        size: "104×104"
        trackStroke: "#f0f0f0, strokeWidth 14"
        progressStroke: "{scoreColor}, strokeWidth 14, strokeLinecap round"
        center-pct: "fontSize 22, fontWeight 800, color #111827"
        center-label: "fontSize 9, color #6b7280, fontWeight 600, uppercase, letterSpacing 0.5"
      subject-bars:
        layout: "flex-1, gap 8 (gap-2)"
        label-row: "flex-row justify-between"
        label-text: "fontSize 12, color #4b5563 (text-gray-600)"
        pct-text: "fontSize 12, fontWeight 600, color {subjectColor}"
        bar-track: "height 6px (h-1.5), bg #f3f4f6, rounded-full"
        bar-fill: "height 6px, rounded-full, bg {subjectColor}, width% dynamic"
      focus-chip:
        borderRadius: 12px    # rounded-xl
        padding: "12px horizontal, 10px vertical"
        backgroundColor: "{focusColor}15"
        label: "fontSize 12, fontWeight 600, color {focusColor} — 'Focus recommandé'"
        subject: "fontSize 14, fontWeight 700, color #1f2937"
        icon: "ChevronRight {focusColor} size 18"
    scoreColors:
      "< 40%": "#ef4444"
      "40–60%": "#f97316"
      "60–75%": "#eab308"
      "75–90%": "#22c55e"
      ">= 90%": "#10b981"

  card-leaderboard:
    description: "Leaderboard container with rank-ordered rows."
    backgroundColor: "#ffffff"
    borderRadius: 16px
    borderWidth: 1px
    borderColor: "#e8edf5"
    padding: 16px
    shadow: elevation-2
    parts:
      header: "Trophy icon #f59e0b + 'Classement de la semaine' + optional rank badge amber-100"
      entry-row:
        layout: "flex-row items-center, py 10px px 12px, borderRadius 12, mb 6px"
        isMe: "bg-blue-50 border border-blue-200"
        notMe: "bg-white border border-gray-100"
        rank-badge: "28×28 circle, colored bg for top 3"
        avatar: "32×32 circle, bg primary-100 (#dbeafe), initials text-primary-700"
        name: "text-sm font-semibold — blue-800 if me, gray-900 otherwise"
        xp: "text-sm font-bold text-amber-600 + 'XP' text-xs text-gray-400"
      my-entry-divider: "border-t border-dashed border-gray-200 when user outside top N"
    rankBadges:
      rank1: "Crown icon #FFD700, bg #FFD70020, text #B8860B"
      rank2: "Medal icon #A0A0A0, bg #C0C0C020, text #808080"
      rank3: "Medal icon #CD7F32, bg #CD7F3220, text #8B4513"
      rank4plus: "rank number, transparent bg, text #6b7280"

  card-stats:
    description: "Stats card with divider-separated rows."
    backgroundColor: "#ffffff"
    borderRadius: 16px
    borderWidth: 1px
    borderColor: "#e8edf5"
    padding: 16px
    shadow: elevation-2
    parts:
      title: "font-bold text-gray-900 mb-1"
      stat-row:
        layout: "flex-row justify-between, py 12px"
        separator: "border-b border-gray-100 (omit on last row)"
        left: "flex-row items-center gap 12px — icon + label text-sm text-gray-700"
        right: "font-bold text-gray-900"

  card-achievement:
    description: "Achievement badge grid — 30% width tiles."
    layout: "flex-row flex-wrap gap-3 (gap 12px)"
    tile:
      size: "56×56"
      borderRadius: 16px          # rounded-2xl
      borderWidth: 1.5px
      borderColor-unlocked: "{achievement.color}"
      borderColor-locked: "#e5e7eb"
      bg-unlocked: "{achievement.color}20"
      bg-locked: "#f3f4f6"
      emoji: "fontSize 28, opacity 1.0 if unlocked else 0.35"
      label: "text-xs text-center font-medium, color {achievement.color} if unlocked else #9ca3af"
      checkmark: "CheckCircle2 {achievement.color} size 12 — only when unlocked"

  # ─── INPUTS ──────────────────────────────────────────────────────────────────

  input-search:
    description: "Search bar inside header area."
    backgroundColor: "#f9fafb"   # bg-gray-50
    borderWidth: 1px
    borderColor: "#e5e7eb"       # border-gray-200
    borderRadius: 12px           # rounded-xl
    padding: "12px vertical, 12px horizontal"
    layout: "flex-row items-center"
    parts:
      icon: "Search, color #9ca3af, size 18"
      text-input: "flex-1, ml 8px, fontSize 14, color #111827"
      placeholder-color: "#9ca3af"
    usage: "CoursesScreen header search"

  input-filter-toggle:
    description: "Icon-only button to show/hide filter row."
    size: "44×44"
    borderRadius: 12px
    backgroundColor-active: "#0857A6"
    backgroundColor-inactive: "#f3f4f6"
    icon: "SlidersHorizontal — white when active, #6b7280 when inactive"

  # ─── BUTTONS ─────────────────────────────────────────────────────────────────

  button-primary:
    description: "Full-width primary CTA button."
    backgroundColor: "#0857A6"
    borderRadius: 12px           # rounded-xl
    paddingVertical: 16px        # py-4
    paddingHorizontal: 40px      # px-10 (for fixed CTAs)
    text:
      color: "#ffffff"
      fontSize: 16px
      fontWeight: "700"
    activeOpacity: 0.85
    usage: "ProfileScreen 'Se connecter', auth flow CTA"

  button-cta-full:
    description: "Full-width CTA with 2xl radius — used in bottom action bars."
    backgroundColor: "{contextColor}"   # amber for confirm, category.color for next
    borderRadius: 16px                  # rounded-2xl
    paddingVertical: 16px               # py-4
    text:
      color: "#ffffff"
      fontSize: 16px
      fontWeight: "700"
    usage: "Trivia confirm button, Next/Results button, Retry button"

  button-secondary:
    description: "Outlined secondary button."
    backgroundColor: "#ffffff"
    borderWidth: 1px
    borderColor: "#d1d5db"
    borderRadius: 16px
    paddingVertical: 16px
    text:
      color: "#374151"
      fontSize: 16px
      fontWeight: "600"
    usage: "Trivia 'Choisir une catégorie' secondary action"

  button-text-link:
    description: "Inline text link with chevron — 'Voir tout'."
    layout: "flex-row items-center gap-1"
    text:
      color: "#0857A6"
      fontSize: 14px
      fontWeight: "500"
    icon: "ChevronRight #0857A6 size 14"
    usage: "Section header navigation links on Dashboard"

  button-destructive:
    description: "Logout / destructive text action."
    layout: "flex-row items-center gap-2, centered"
    icon: "LogOut #dc2626 size 16"
    text:
      color: "#dc2626"
      fontSize: 14px
      fontWeight: "600"

  # ─── CHIPS & PILLS ───────────────────────────────────────────────────────────

  chip-subject:
    description: "Subject or level label chip on course cards."
    borderRadius: 100px
    paddingHorizontal: 8px
    paddingVertical: 2px
    backgroundColor: "{courseColor}18"   # ~10% tint
    text:
      color: "{courseColor}"
      fontSize: 11px
      fontWeight: "600"
    usage: "Course cards subject/level chips"

  chip-level-alt:
    description: "Alternate level chip with slightly lower opacity."
    borderRadius: 100px
    paddingHorizontal: 8px
    paddingVertical: 2px
    backgroundColor: "{courseColor}12"   # ~7% tint
    text:
      color: "{courseColor}"
      fontSize: 11px
      fontWeight: "600"

  chip-filter:
    description: "Horizontal scrollable filter pill — active/inactive toggle."
    borderRadius: 9999px
    paddingHorizontal: 16px
    paddingVertical: 8px
    backgroundColor-active: "#0857A6"
    backgroundColor-inactive: "#f3f4f6"
    text:
      color-active: "#ffffff"
      color-inactive: "#4b5563"
      fontSize: 14px
      fontWeight: "600"
    usage: "CoursesScreen subject and level filter rows"

  chip-xp:
    description: "XP earned badge — amber background, shown in Trivia results."
    backgroundColor: "#fffbeb"   # amber-50
    borderWidth: 1px
    borderColor: "#fde68a"       # amber-200
    borderRadius: 9999px
    paddingHorizontal: 16px
    paddingVertical: 8px
    layout: "flex-row items-center gap 8px"
    parts:
      icon: "Zap #f59e0b size 16"
      text: "text-amber-600 font-bold text-sm"

  chip-score:
    description: "Live score badge in quiz player top bar."
    backgroundColor: "#fffbeb"
    borderWidth: 1px
    borderColor: "#fde68a"
    borderRadius: 9999px
    paddingHorizontal: 10px
    paddingVertical: 4px
    parts:
      star-emoji: "fontSize 13"
      count: "text-amber-600 font-bold text-sm"

  chip-rank:
    description: "Leaderboard rank badge in header."
    backgroundColor: "#fef3c7"   # amber-100
    borderRadius: 9999px
    paddingHorizontal: 8px
    paddingVertical: 2px
    text: "text-xs font-bold text-amber-700"

  chip-hero-badge:
    description: "White-tinted pill on blue hero background — track, level, XP."
    backgroundColor: "rgba(255,255,255,0.15–0.20)"
    borderRadius: 9999px
    paddingHorizontal: 12px
    paddingVertical: 4px
    text:
      color: "#ffffff"
      fontSize: 12px
      fontWeight: "600–700"

  chip-subject-pill:
    description: "Pill-shaped subject link on ExamLanding — white bg, shadow, emoji + label."
    backgroundColor: "#ffffff"
    borderWidth: 1px
    borderColor: "#e8edf5"
    borderRadius: 99px
    paddingHorizontal: 12px
    paddingVertical: 8px
    shadow: elevation-1
    parts:
      emoji: "fontSize 14"
      label: "fontSize 13, fontWeight 500, color #374151"

  # ─── PROGRESS BAR ────────────────────────────────────────────────────────────

  progress-bar:
    description: "Reusable linear progress bar component."
    track:
      backgroundColor: "#e5e7eb"   # bg-gray-200
      borderRadius: 9999px
      height: "{configurable, default 6px}"
      overflow: hidden
    fill:
      borderRadius: 9999px
      backgroundColor: "{color prop, default #0857A6}"
      width: "{value}%"
    variants:
      course-list: "height 4px, color {courseColor}"
      xp-level: "height 8px, color #f59e0b, showLabel true"
      quiz-nav: "height 4px (h-1), color {category.color}"
      readiness-subject: "height 6px (h-1.5), color {subjectColor}, custom bg #f3f4f6"
    usage: "CoursesScreen, DashboardScreen, ProfileScreen XP, TriviaScreen nav bar"

  # ─── SVG TIMER / DONUT ───────────────────────────────────────────────────────

  svg-timer-ring:
    description: "Countdown ring used in Trivia quiz player."
    size: "52×52"
    viewBox: "0 0 120 120"
    track: "Circle r=52, stroke #e5e7eb, strokeWidth 10"
    countdown: "Circle r=52, stroke {timerColor}, strokeWidth 10, strokeDasharray dynamic, strokeLinecap round, rotation -90"
    timerColors:
      ">8s": "#10b981"
      "5–8s": "#f59e0b"
      "<5s": "#ef4444"
    center-text: "fontSize 14, fontWeight 800, color {timerColor}"

  svg-score-ring:
    description: "Results screen score ring."
    size: "140×140"
    viewBox: "0 0 120 120"
    track: "Circle r=52, stroke #e5e7eb, strokeWidth 10"
    arc: "Circle r=52, stroke {scoreColor}, strokeWidth 10, strokeDasharray dynamic, strokeLinecap round"
    scoreColors:
      ">= 80%": "#10b981"
      "60–80%": "#f59e0b"
      "< 60%": "#ef4444"
    center:
      fraction: "fontSize 22, fontWeight 800, color #111827"
      pct: "fontSize 13, fontWeight 700, color {scoreColor}"

  svg-donut-readiness:
    description: "Readiness composite card donut."
    size: "104×104"
    radius: 45px
    track: "stroke #f0f0f0, strokeWidth 14"
    arc: "stroke {scoreColor}, strokeWidth 14, strokeLinecap round, rotation -90"

  # ─── QUESTION NAVIGATOR ──────────────────────────────────────────────────────

  quiz-question-nav:
    description: "Horizontal scrollable row of numbered circles tracking question progress."
    circle-size: "24×24"
    borderRadius: 9999px
    states:
      current: "backgroundColor #3b82f6"
      answered: "backgroundColor #10b981"
      upcoming: "backgroundColor #e5e7eb"
    label:
      fontSize: 9px
      fontWeight: "700"
      color-active: "#ffffff"
      color-inactive: "#9ca3af"

  # ─── ANSWER OPTIONS ──────────────────────────────────────────────────────────

  trivia-answer-option:
    description: "MCQ answer row — letter badge left, text right, state-driven border/bg."
    borderWidth: 2px
    borderRadius: 12px
    layout: "flex-row items-center"
    overflow: hidden
    states:
      unselected:
        borderColor: "#e5e7eb"
        backgroundColor: "#ffffff"
        labelBg: "#f3f4f6"
        labelText: "#6b7280"
      selected-pending:
        borderColor: "#f59e0b"
        backgroundColor: "#fffbeb"
        labelBg: "#f59e0b"
        labelText: "#ffffff"
      confirmed-correct:
        borderColor: "#10b981"
        backgroundColor: "#f0fdf4"
        labelBg: "#10b981"
        labelText: "#ffffff"
        icon: "Check #10b981 size 18"
      confirmed-wrong:
        borderColor: "#ef4444"
        backgroundColor: "#fef2f2"
        labelBg: "#ef4444"
        labelText: "#ffffff"
        icon: "X #ef4444 size 18"
    letter-badge:
      size: "40×40"
      margin: 8px
      borderRadius: 8px
    answer-text:
      fontSize: 14px
      fontWeight: "500"
      lineHeight: 20px
      color: "#111827"

  # ─── FEEDBACK PANEL ──────────────────────────────────────────────────────────

  trivia-feedback:
    description: "Post-answer feedback card with left accent border."
    backgroundColor: "#ffffff"
    borderRadius: 12px           # rounded-xl
    padding: 16px
    borderLeftWidth: 4px
    borderLeftColor-correct: "#10b981"
    borderLeftColor-wrong: "#ef4444"
    shadow: elevation-generic-sm
    parts:
      header-row: "icon + label — Check or X + 'Correct!' or 'Incorrect'"
      wrong-answer: "text-sm text-gray-600 — 'Bonne réponse: {answer}' with emerald-700 value"
      explanation: "text-sm text-gray-500, lineHeight 20, mt 8px"

  # ─── BOTTOM TAB BAR ──────────────────────────────────────────────────────────

  bottom-tab-bar:
    backgroundColor: "#ffffff"     # dark: #111827
    borderTopColor: "#e5e7eb"      # dark: #1f2937
    height: 60px
    paddingBottom: 8px
    tabBarActiveTintColor: "#0857A6"
    tabBarInactiveTintColor: "#9ca3af"
    label:
      fontSize: 11px
      fontWeight: "500"
    tabs:
      - label: "Accueil"
        icon: LayoutDashboard
      - label: "Cours"
        icon: BookOpen
      - label: "Examens"
        icon: ClipboardList
      - label: "Trivia"
        icon: Zap
      - label: "Profil"
        icon: User

  # ─── PROFILE HERO ────────────────────────────────────────────────────────────

  profile-hero:
    description: "Full-bleed blue hero section at top of ProfileScreen."
    backgroundColor: "#0857A6"
    borderBottomLeftRadius: 28px
    borderBottomRightRadius: 28px
    paddingHorizontal: 20px
    paddingTop: 28px
    paddingBottom: 44px
    parts:
      avatar:
        size: "80×80"
        borderRadius: 40px
        backgroundColor: "rgba(255,255,255,0.25)"
        initials: "fontSize 28, fontWeight 800, color #ffffff"
        marginBottom: 14px
      name: "fontSize 22, fontWeight 800, color #ffffff, lineHeight 28"
      email: "fontSize 13, color #93c5fd, marginTop 2"
      badge-row: "flex-row flex-wrap gap 8, marginTop 12"
      badges: "chip-hero-badge — track, level, XP"

  # ─── HERO BANNER (DASHBOARD) ─────────────────────────────────────────────────

  dashboard-header:
    description: "Dashboard top banner — primary blue, overlapped by KPI strip."
    backgroundColor: "#0857A6"
    paddingHorizontal: 20px      # px-5
    paddingTop: 20px             # pt-5
    paddingBottom: 28px          # pb-7
    parts:
      label: "text-blue-200, text-sm, font-medium"
      greeting: "text-white text-2xl font-bold mt-0.5"
      subtitle: "text-blue-200 text-sm mt-1"
      avatar:
        size: "48×48"
        borderRadius: 9999px
        backgroundColor: "rgba(255,255,255,0.2)"
        initials: "text-white font-bold text-base"

  # ─── SETTINGS TILE ───────────────────────────────────────────────────────────

  settings-tile:
    description: "Square settings button — language and theme toggles."
    flex: 1
    backgroundColor: "#ffffff"
    borderWidth: 1px
    borderColor: "#e5e7eb"
    borderRadius: 12px
    paddingVertical: 20px      # py-5
    layout: "items-center justify-center gap-2 (flex column)"
    parts:
      icon: "22px"
      label: "text-xs font-semibold text-gray-700 text-center"

  # ─── STATE VIEWS ─────────────────────────────────────────────────────────────

  state-loading:
    layout: "flex-1 items-center justify-center gap-4 py-16"
    parts:
      spinner: "LoadingSpinner, color #0857A6"
      text: "text-gray-500 text-base"

  state-error:
    layout: "flex-1 items-center justify-center gap-4 py-16 px-6"
    parts:
      icon: "AlertCircle #dc2626 size 40"
      text: "text-gray-700 text-base text-center"
      retry-button: "mt-2 px-5 py-2.5 bg-primary-600 (#0857A6) rounded-xl, text-white font-semibold"

  state-empty:
    layout: "flex-1 items-center justify-center gap-3 py-16 px-6"
    parts:
      icon: "Inbox #9ca3af size 40 (default)"
      text: "text-gray-500 text-base text-center"
---

## Overview

EdLight Academy is a React Native (Expo) app built with NativeWind/Tailwind styling for Haitian students preparing for the national Baccalauréat exam. The design language balances two objectives: the authority of an academic platform and the motivational pull of gamified learning.

The visual system is structured around three surface levels: a very light blue-gray page background (`#f4f6fb`), white card surfaces (`#ffffff`) raised on blue-tinted shadows, and a deep primary blue (`#0857A6`) used for headers, CTAs, and the bottom tab bar active state. Cards are distinguished from the background by a 1px blue-tinted border (`#e8edf5`) and a subtle brand-colored shadow — an intentional choice that gives depth without dark grunge. The result is clean and airy, appropriate for a student-facing study tool used in varied lighting conditions.

Gamification is expressed through a warm amber-yellow accent (`#f59e0b`) applied to XP indicators, the confirm button in Trivia, streak counts, and the leaderboard XP column. The danger red (`#ef4444`) marks streak flames and wrong answers; success green (`#10b981`) marks correct answers and strong readiness scores. These semantic colors are used consistently and sparingly — they always carry meaning rather than being decorative.

Subject colors provide a secondary color coding layer: math is medium blue (`#4A93DD`), physics is the brand blue (`#0857A6`), chemistry is teal (`#0e7490`), biology (SVT) is forest green (`#15803d`), French is amber (`#f59e0b`), English is purple (`#8b5cf6`), economics is emerald (`#10b981`), and history is orange (`#f97316`). These colors appear in icon tints, progress bars, chip backgrounds, and SVG arcs — always at 10–20% opacity for backgrounds and full saturation for text and icons.

Typography uses the system font stack (San Francisco on iOS, Roboto on Android). Display headings are set at 26px / weight 800 with a `-0.5px` letter-spacing for tightness. Section titles run 15–16px / weight 700. Card content is 14px / weight 700 for titles and 13px / weight 400 for descriptions. The type scale is intentionally compact, prioritising information density on mobile screens.

---

## Colors

### Brand Blues

`#0857A6` is the primary brand color. It appears as the Dashboard header background, the bottom tab active state, card shadow color, the primary CTA button fill, and the focus color for refresh spinners. It is the anchor of the entire palette.

`#4A93DD` (primary-500) is the lighter "math blue" used for Mathematics subject indicators across the readiness card, course chips, and subject color mapping.

`#0A66C2` (primary-700) is used for the Chemistry subject track color and as a slightly brighter hover-adjacent state.

`#1e3a5f` (primary-900) is a deep navy reserved for rare high-contrast needs.

### Page Surfaces

`#f4f6fb` — every screen's `SafeAreaView` background. A carefully chosen near-white with just enough blue shift to feel "academic" without being harsh. All scrollable content sits on this surface.

`#ffffff` — card surface. Every content card is white, creating clear separation from the background.

`#e8edf5` — the universal card border color. A cool blue-tinted light gray that relates to the primary palette without being visually heavy.

### Text Hierarchy

`#0f172a` — near-black slate used for display headings and card category titles.
`#111827` — standard body text, card titles, KPI values.
`#374151` — secondary body text; subject chip labels on exam landing.
`#64748b` — tertiary descriptions, card sublabels.
`#94a3b8` — muted/placeholder text, lesson counts, sub-text in widgets.
`#9ca3af` — input placeholders, inactive tab icons, chevron icons.

### Semantic Colors

Correct/success states use `#10b981` (emerald-500). Wrong/danger states use `#ef4444` (red-400). The XP/gamification amber is `#f59e0b`. These three colors are the only truly saturated chromatic accents in the interface and should never be used for non-semantic decoration.

### Leaderboard Rank Medals

Rank 1 uses gold (`#FFD700`), rank 2 uses silver (`#A0A0A0`), rank 3 uses bronze (`#CD7F32`). Each has a matching 12% opacity background and a darker text color for contrast.

---

## Typography

The app uses the platform system font exclusively. No custom typefaces are loaded. All weight/size decisions optimize for legibility on 375–430px wide screens.

| Token | Size | Weight | Color | Usage |
|---|---|---|---|---|
| display-lg | 26px | 800 | #0f172a | Screen page titles |
| display-md | 24px | bold | #111827 | Auth / results headline |
| hero-greeting | 24px | 700 | #ffffff | Dashboard "Bonjour, {name}" |
| section-title | 16px | 700 | #111827 | Section group headings |
| card-title | 16px | 800 | #0f172a | Category / level card heading |
| card-title-sm | 14px | 700 | #111827 | Course card name |
| body-sm | 13px | 400 | #64748b | Description text under card titles |
| body-xs | 12px | 400 | #94a3b8 | Tertiary labels, lesson counts |
| chip-text | 11px | 600 | {subjectColor} | Subject/level chip labels |
| label-tab | 11px | 500 | #0857A6 / #9ca3af | Bottom tab labels |
| kpi-value | 20px | 700 | #111827 | Dashboard KPI numbers |
| widget-value | 20px | 800 | {accent} | HomeWidget stat values |
| donut-pct | 22px | 800 | #111827 | SVG donut center percentage |

The `-0.5px` letter-spacing on display-lg is applied consistently on every screen title. Do not apply this tracking to body text.

Line heights are set explicitly only where needed: card titles use `lineHeight: 22` at `fontSize: 16`, description sublabels use `lineHeight: 18` at `fontSize: 13`, and answer options use `lineHeight: 20` at `fontSize: 14`.

---

## Layout

### Screen Structure

Every screen follows this vertical stack:
1. `SafeAreaView` with `backgroundColor: '#f4f6fb'` as the root container
2. Optional fixed header (white, `border-b border-gray-100`) for search/filter areas
3. `ScrollView` with `paddingBottom: 32` (or 48 on profile)
4. Section groups separated by `marginBottom: 20px` (`mb-5`)
5. Horizontal screen padding is always `20px` (`px-5`)

### Card Spacing

Cards inside scroll lists use `gap-3` (12px) between items. The KPI row uses `gap-2` (8px). The HomeWidgets 2×2 grid uses `gap: 10` between columns and between rows.

### Header Overlap

The Dashboard KPI strip applies `marginTop: -16px` (`-mt-4`) to visually overlap and merge with the blue header, creating a layered depth effect that grounds the cards against the hero surface.

On the Profile screen, the XP progress card applies `marginTop: -20px` to float up over the blue hero, creating a similar overlap pattern.

### Horizontal Scrolls

Filter chip rows and question navigator dots use horizontal `ScrollView` with `showsHorizontalScrollIndicator={false}` and `contentContainerStyle={{ gap: 8 }}`. No snap points are used.

### Grid Layouts

HomeWidgets uses a manual 2-column grid: two `View` containers each with `flex: 1`, each containing two `Widget` components with `gap: 10`. This is the only true grid layout in the app — elsewhere lists are single-column vertical stacks.

Achievement badges use `flex-row flex-wrap` with each item at `width: '30%'` (approximately 3 columns on a standard screen).

---

## Elevation & Depth

The shadow system uses `#0857A6` as the shadow color (not black). This brand-colored shadow subtly unifies all card depth with the primary palette and reads more softly than black shadows on the blue-tinted page background.

Three shadow tiers are defined:

**Tier 1 — Subtle** (`opacity 0.05, radius 4, elevation 1`): KPI cards, subject pills on ExamLanding, mini stat cards. Used for elements that need just enough lift to separate from background without competing with Tier 2 cards.

**Tier 2 — Standard** (`opacity 0.06, radius 6, elevation 2`): The default for all primary content cards — courses, categories, leaderboard, readiness, HomeWidgets, stats. This is the workhorse shadow used on ~90% of surfaced elements.

**Tier 3 — Elevated** (`opacity 0.07–0.08, radius 8, elevation 2–3`): Reserved for the ExamLanding level cards (slightly higher visual prominence) and the Profile XP card that floats above the hero.

Black `shadowColor` (`#000`) is used only inside the Trivia quiz player for question cards and answer options, where the blue-tinted shadow would not read well against the uniform `#f4f6fb` background without a border.

The bottom tab bar sits on a white surface with a `border-t border-gray-200` (`#e5e7eb`) hairline separator — no shadow — keeping it clean and minimal.

---

## Components

### Cards

All primary content uses the `card-standard` pattern: white background, 16px border-radius, 1px `#e8edf5` border, 16px internal padding, Tier 2 shadow. Deviations from this pattern are explicit exceptions:

- **KpiCard**: rounded-2xl (16px), padding p-3, Tier 1 shadow, centered vertical stack
- **CourseCard**: standard card + left icon badge with 10% tint + horizontal row layout + optional progress bar at bottom
- **CategoryCard**: same structure as CourseCard but with a full-width 3px bottom accent stripe in the category's color and a count chip
- **LevelCard**: uses a 4px left accent stripe instead of a bottom stripe, accommodating the horizontal visual weight of the level options
- **Widget (HomeWidget)**: minimum 110px height, `justifyContent: space-between` to push value block to the bottom, 16% tint icon container at top-right

### Buttons

Primary actions use full-width `py-4 rounded-2xl` buttons. In the Trivia quiz, the confirm button is amber (`#f59e0b`) before confirmation; the next/continue button is the category's accent color. Both use `rounded-2xl` (16px) and white bold text.

Secondary and destructive actions are presented as outlined (`border border-gray-300 bg-white`) or as text-only links (logout). Never use a secondary outlined button for critical flows.

The filter toggle button in CoursesScreen is a square icon button (44×44, rounded-xl) that changes from `bg-gray-100` with a gray icon to `bg-primary-600` with a white icon when active — a clear binary toggle state.

### Chips and Pills

Subject/level chips on course cards use `borderRadius: 100`, `px-2 py-0.5`, and a 10–12% opacity background tint derived from the course's own color. This allows each subject to carry its color identity without clashing.

Filter chips in CoursesScreen use `borderRadius: 9999px`, `px-4 py-2`, and binary active/inactive state (primary blue vs. gray-100 background).

Hero badge chips on the Profile screen (track, level, XP) use `rgba(255,255,255,0.15–0.20)` backgrounds on the blue hero — a frosted-glass-adjacent treatment.

### Progress Bars

The `ProgressBar` component accepts `value` (0–100), `color` (default `#0857A6`), `height` (default 6px), and an optional `showLabel` / `label` prop. The track is always `bg-gray-200` with `rounded-full overflow-hidden`. Course list bars run at 4px height; XP level bars run at 8px. All have fully-rounded caps.

### SVG Rings

Three SVG circle/donut widgets appear in the app: the readiness donut (104px, radius 45, strokeWidth 14), the quiz timer countdown ring (52px, radius 52, strokeWidth 10), and the results score ring (140px, radius 52, strokeWidth 10). All use `strokeLinecap="round"`, `rotation="-90"`, and dynamic `strokeDasharray` to animate fill. Track circles use `#e5e7eb` or `#f0f0f0` stroke; fill circles use semantic colors.

### Trivia Answer Options

Answer option rows use `borderWidth: 2` (not 1) for clear selected/unselected distinction. The state machine has four states: unselected (gray border/bg), selected-pending (amber border and bg), confirmed-correct (green), confirmed-wrong (red). The letter badge (A/B/C/D) background transitions in lockstep with the row state. A confirmation check or X icon appears at the trailing edge after answer reveal.

### Leaderboard Rows

Leaderboard entries use a compact row pattern: rank badge circle (28×28), initials avatar (32×32, primary-100 bg), name+school, XP value. The current user's row is highlighted with `bg-blue-50 border border-blue-200`. If the user falls outside the displayed top N, their row is shown below a dashed divider with the same highlighting.

---

## Do's and Don'ts

### Do

- Use `#f4f6fb` for every screen background without exception
- Use `#0857A6` as the `shadowColor` on all content cards — never `#000000` for card-level shadows
- Use `borderRadius: 16` for all primary content cards (course cards, category cards, leaderboard, readiness)
- Use `borderRadius: 99` or `9999` for all pills, chips, and circular badges
- Apply subject colors consistently using the established palette (math = `#4A93DD`, physics = `#0857A6`, etc.)
- Show a ProgressBar only when `pct > 0` on course cards — never render an empty gray bar for zero progress
- Use the 10–18% opacity tint (append hex `12`–`18` to color) for icon container backgrounds and chip backgrounds derived from a dynamic color
- Maintain the amber accent (`#f59e0b`) strictly for XP, gamification, and the trivia confirm action
- Use `activeOpacity={0.82}` on card-level touchable wrappers, `0.85` on full-width CTAs
- Apply `-0.5px` letterSpacing only to display-lg (26px) and widget-value (20px) headings
- Follow French language with Haitian Creole as the secondary language across all user-facing strings

### Don't

- Don't use black `shadowColor` on standard content cards — it breaks the tonal system
- Don't mix borderRadius values arbitrarily; use the defined scale (8, 10, 12, 16, 28, 40, 99, 9999)
- Don't use the amber accent (`#f59e0b`) for non-gamification elements
- Don't add progress bars to course cards when progress is zero — omit the bar entirely
- Don't create new color values for subjects; extend the established `SUBJECT_COLORS` map in ReadinessCard
- Don't use colored shadows for answer option cards inside the Trivia quiz player — use generic black shadows there
- Don't use font weights below 500 for interactive elements (chips, tabs, buttons)
- Don't use `elevation` alone — always pair it with iOS `shadowColor/shadowOffset/shadowOpacity/shadowRadius` for cross-platform consistency
- Don't show the subject label on course cards unless the course has a `level` property
- Don't use letter-spacing on body text (13–14px range) — only on large display tokens

---

## Agent Prompt Guide

When using this DESIGN.md to generate new screens or components for EdLight Academy, follow these principles:

**Starting a new screen:**
Wrap everything in `<SafeAreaView style={{ backgroundColor: '#f4f6fb' }}>` and a `ScrollView` with `contentContainerStyle={{ paddingBottom: 32 }}`. Apply `px-5` (20px) horizontal padding to all content sections. Add `showsVerticalScrollIndicator={false}`.

**Adding a page title:**
```tsx
<Text style={{ fontSize: 26, fontWeight: '800', color: '#0f172a', letterSpacing: -0.5 }}>
  {title}
</Text>
<Text style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>
  {subtitle}
</Text>
```

**Adding a content card:**
```tsx
<View style={{
  backgroundColor: '#ffffff',
  borderRadius: 16,
  borderWidth: 1,
  borderColor: '#e8edf5',
  padding: 16,
  shadowColor: '#0857A6',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 6,
  elevation: 2,
}}>
  {/* card content */}
</View>
```

**Adding a subject/level chip:**
```tsx
<View style={{ backgroundColor: color + '18', borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2 }}>
  <Text style={{ color, fontSize: 11, fontWeight: '600' }}>{label}</Text>
</View>
```

**Adding an icon badge inside a card:**
```tsx
<View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: color + '18', alignItems: 'center', justifyContent: 'center' }}>
  <BookOpen color={color} size={20} />
</View>
```

**Using a primary CTA button:**
```tsx
<TouchableOpacity
  style={{ backgroundColor: '#0857A6', borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}
  activeOpacity={0.85}
>
  <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 16 }}>{label}</Text>
</TouchableOpacity>
```

**Referencing gamification state:**
Always show XP with a `Zap` icon in `#f59e0b`, streaks with a `Flame` icon in `#ef4444`, and trophies/leaderboard rank with a `Trophy` icon in `#f59e0b`. Use `text-amber-600` (NativeWind) or `#d97706` for amber text values.

**Handling dynamic subject colors:**
Use the `SUBJECT_COLORS` map from `ReadinessCard.tsx` as the source of truth. Always derive backgrounds by appending `'14'` or `'18'` to the hex string, and icons/text in full saturation.

**Bilingual strings:**
All user-facing strings must support both French (default) and Haitian Creole. Use the `t(fr, ht)` helper pattern: `const t = (fr, ht) => isCreole ? ht : fr`. Never hard-code French strings without a Creole alternative.
