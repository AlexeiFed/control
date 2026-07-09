export const designTokens = {
  color: {
    background: "#F3F5F7",
    surface: "#FFFFFF",
    surfaceElevated: "#F8FAFC",
    border: "#CBD5E1",
    text: "#0F172A",
    textMuted: "#475569",
    accent: {
      primary: "#1E3A5F",
      primaryHover: "#172F4D",
      secondary: "#7C3AED",
      danger: "#B91C1C",
      /** Подсветка строки реестра: медкомиссия / периодическая проверка истекают. */
      complianceReminderRow: "rgba(231, 160, 160, 0.5)",
      warning: "#B45309",
      success: "#047857",
      /** Иконка именинников в шапке. */
      birthday: "#DB2777",
    },
    status: {
      active: "#047857",
      sick: "#B91C1C",
      vacation: "#B45309",
      inactive: "#64748B",
    },
    shift: {
      dayFrom: "#38BDF8",
      dayTo: "#22C55E",
      nightFrom: "#6366F1",
      nightTo: "#8B5CF6",
      holidayFrom: "#F59E0B",
      holidayTo: "#EC4899",
      /** Обычная смена — нейтральная подложка (без «радуги» по длительности). */
      regularCellBg: "#E8EEF4",
      reinforcementCellBg: "rgba(185, 28, 28, 0.22)",
      mobilePostCellBg: "rgba(234, 179, 8, 0.35)",
    },
    /**
     * Унифицированные цвета типов смен — единый источник для карточек смен в графике
     * и подсказок в карточке охранника. Пары bg/border/text используются вместе.
     */
    shiftKind: {
      Regular: {
        bg: "#E8EEF4",
        border: "#CBD5E1",
        text: "#0F172A",
      },
      Reinforcement: {
        bg: "rgba(185, 28, 28, 0.22)",
        border: "#B91C1C",
        text: "#7F1D1D",
      },
      RapidResponse: {
        bg: "rgba(234, 179, 8, 0.35)",
        border: "#B45309",
        text: "#78350F",
      },
      ShiftLead: {
        bg: "rgba(99, 102, 241, 0.22)",
        border: "#6366F1",
        text: "#312E81",
      },
    },
  },
  radius: {
    card: "0.875rem",
    button: "0.625rem",
  },
  shadow: {
    glow: "0 18px 42px rgb(15 23 42 / 0.07)",
  },
  scroll: {
    track: "#E2E8F0",
    thumb: "#94A3B8",
    thumbHover: "#64748B",
    size: "0.625rem",
  },
} as const;

export type DesignTokens = typeof designTokens;
