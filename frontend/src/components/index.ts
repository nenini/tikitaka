/**
 * BloomTalk 공용 컴포넌트 배럴.
 *   import { Button, Card, CoachToast, Screen } from '@/components'
 *
 * 스타일은 전역 index.css 가 로드하는 디자인 시스템(tokens.css + components.css)에서 나온다.
 * 각 컴포넌트는 `.bt-*` 클래스를 감싸는 얇은 타입 래퍼다.
 *
 * ⚠️ 규칙
 *  - 여기서는 `export *` 를 쓰지 않는다. 폴더가 늘어나면 서로 다른 폴더의 동명 export 가 조용히 충돌한다.
 *  - **패키지 내부**에서는 상대경로로 import 한다(`../Icon`). 하위 컴포넌트가 다시 이 배럴을 참조하면
 *    순환 의존성이 생긴다. `@/components` 는 외부 소비 코드에서만 쓴다.
 */

/* ── Icon ── */
export { Icon, iconNames } from './Icon'
export type { IconName, IconProps } from './Icon'

/* ── UI ── */
export { ExitToHomeButton } from './ui/ExitToHomeButton'
export type { ExitToHomeButtonProps } from './ui/ExitToHomeButton'

export {
  Button,
  IconButton,
  CallBar,
  Card,
  CardButton,
  CardLink,
  CardHeader,
  Chip,
  TagChip,
  Badge,
  Hedge,
  Avatar,
  ScoreRing,
  Progress,
  Steps,
  Field,
  Input,
  Textarea,
  useFieldContext,
  Switch,
  Segmented,
  Select,
  Rating,
  Callout,
  ListRow,
  ListRowButton,
  ListRowLink,
  Modal,
  AlertDialog,
  ConsentRow,
  Skeleton,
  EmptyState,
  Spinner,
} from './ui'
export type {
  ButtonProps,
  ButtonVariant,
  ButtonSize,
  IconButtonProps,
  IconButtonState,
  CallBarProps,
  CardProps,
  CardButtonProps,
  CardLinkProps,
  CardHeaderProps,
  CardVariant,
  ChipProps,
  BadgeProps,
  BadgeTone,
  HedgeProps,
  AvatarProps,
  AvatarSize,
  AvatarStatus,
  ScoreRingProps,
  ProgressProps,
  StepsProps,
  FieldProps,
  FieldContextValue,
  FieldLabelProps,
  InputProps,
  TextareaProps,
  SwitchProps,
  SegmentedProps,
  SegmentedOption,
  SelectProps,
  SelectOption,
  RatingProps,
  CalloutProps,
  CalloutTone,
  ListRowProps,
  ListRowButtonProps,
  ListRowLinkProps,
  ListRowContent,
  ModalProps,
  ModalBaseProps,
  ModalAccessibleName,
  AlertDialogProps,
  ConsentRowProps,
  SkeletonProps,
  EmptyStateProps,
  SpinnerProps,
} from './ui'

/* ── Layout ── */
export {
  Stack,
  Cluster,
  VisuallyHidden,
  Screen,
  BottomNavigation,
  BottomNav,
  ThemeProvider,
  useTheme,
  ThemeToggle,
  DarkScope,
  THEME_STORAGE_KEY,
} from './layout'
export type {
  StackProps,
  ClusterProps,
  VisuallyHiddenProps,
  ScreenProps,
  BottomNavigationProps,
  BottomNavProps,
  BottomNavItemDef,
  BottomNavFab,
  BottomNavLinkRenderer,
  BottomNavLinkRenderProps,
  ThemeMode,
  ResolvedTheme,
  Theme,
  ThemeContextValue,
  ThemeProviderProps,
  ThemeToggleProps,
  DarkScopeProps,
} from './layout'

/* ── Chat ── */
export { ChatBubble, TypingIndicator } from './chat'
export type { ChatBubbleProps, ChatBubbleSide, TypingIndicatorProps } from './chat'

/* ── Session ── */
export { CoachToast, TopicButton, QuestionCard, SessionTimer, CallControls, ConnectionIndicator } from './session'
export type {
  CoachToastProps,
  TopicButtonProps,
  QuestionCardProps,
  QuestionOption,
  QuestionCardState,
  SessionTimerProps,
  SessionTimerThresholds,
  CallControlsProps,
  ConnectionIndicatorProps,
  ConnectionState,
} from './session'
