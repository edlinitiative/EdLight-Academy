/**
 * The app icon set. Every icon is Phosphor (duotone for things that carry
 * meaning, bold for UI glyphs such as chevrons, X and check), wrapped behind
 * the Lucide names the code already used.
 *
 * Ted: "a lot of the icons … look very familiar and are too common that they
 * scream AI". Import from here, never from an icon package directly, so the
 * set stays one family. `fill="currentColor"` (Lucide's way to fill a star)
 * maps to the Phosphor "fill" weight; `strokeWidth` is ignored.
 */
import React from 'react';
import type { Icon as PhosphorIcon, IconProps as PhosphorProps, IconWeight } from '@phosphor-icons/react';
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ArrowElbowDownLeftIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  ArrowsInIcon,
  ArrowsOutIcon,
  AtomIcon,
  BackspaceIcon,
  BankIcon,
  BarbellIcon,
  BellIcon,
  BellRingingIcon,
  BookOpenIcon,
  BookOpenTextIcon,
  BooksIcon,
  BrainIcon,
  BroadcastIcon,
  CalculatorIcon,
  CalendarBlankIcon,
  CalendarCheckIcon,
  CalendarDotsIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CertificateIcon,
  ChalkboardIcon,
  ChartBarIcon,
  ChartLineIcon,
  ChatCircleIcon,
  CheckIcon,
  CheckCircleIcon,
  CheckSquareIcon,
  CircleIcon,
  CircleNotchIcon,
  ClipboardIcon,
  ClipboardTextIcon,
  ClockIcon,
  ClockCounterClockwiseIcon,
  CompassIcon,
  ConfettiIcon,
  CopyIcon,
  CornersInIcon,
  CornersOutIcon,
  CrownIcon,
  CursorClickIcon,
  DatabaseIcon,
  DeviceMobileIcon,
  DiamondIcon,
  DownloadSimpleIcon,
  EyeIcon,
  EyeSlashIcon,
  FastForwardIcon,
  FileTextIcon,
  FilmStripIcon,
  FireIcon,
  FlagIcon,
  FlaskIcon,
  FloppyDiskIcon,
  GameControllerIcon,
  GearSixIcon,
  GiftIcon,
  GlobeIcon,
  GraduationCapIcon,
  HourglassIcon,
  HouseIcon,
  InfoIcon,
  KeyIcon,
  KeyboardIcon,
  LightbulbIcon,
  LightningIcon,
  LinkIcon,
  ListIcon,
  ListChecksIcon,
  LockIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  MedalIcon,
  MegaphoneIcon,
  MoonIcon,
  NotebookIcon,
  PaperPlaneTiltIcon,
  PauseIcon,
  PencilLineIcon,
  PencilSimpleIcon,
  PlayIcon,
  PlayCircleIcon,
  PlusIcon,
  PrinterIcon,
  ProhibitIcon,
  QuestionIcon,
  RepeatIcon,
  RewindIcon,
  ScalesIcon,
  ScrollIcon,
  ShareNetworkIcon,
  ShieldIcon,
  ShieldCheckIcon,
  ShieldWarningIcon,
  ShuffleIcon,
  SigmaIcon,
  SignInIcon,
  SignOutIcon,
  SkipForwardIcon,
  SlidersHorizontalIcon,
  SmileySadIcon,
  SparkleIcon,
  SpeakerHighIcon,
  SpeakerLowIcon,
  SpeakerXIcon,
  SquaresFourIcon,
  StackIcon,
  StarIcon,
  SunIcon,
  SwordIcon,
  TargetIcon,
  ThumbsUpIcon,
  TimerIcon,
  TranslateIcon,
  TrashIcon,
  TrayIcon,
  TrendUpIcon,
  TrophyIcon,
  UploadSimpleIcon,
  UserIcon,
  UserGearIcon,
  UsersIcon,
  VideoCameraIcon,
  WarningIcon,
  WarningCircleIcon,
  WifiHighIcon,
  WifiSlashIcon,
  XIcon,
} from '@phosphor-icons/react';

export type IconProps = Omit<PhosphorProps, 'ref'> & {
  size?: number | string;
  strokeWidth?: number | string;
  absoluteStrokeWidth?: boolean;
};
export type AppIcon = React.ForwardRefExoticComponent<IconProps & React.RefAttributes<SVGSVGElement>>;
/** Kept so code typed against Lucide still compiles. */
export type LucideIcon = AppIcon;
export type LucideProps = IconProps;

function make(P: PhosphorIcon, base: IconWeight, name: string): AppIcon {
  const C = React.forwardRef<SVGSVGElement, IconProps>(
    ({ strokeWidth: _sw, absoluteStrokeWidth: _asw, fill, weight, className, ...rest }, ref) => (
      <P
        ref={ref}
        weight={weight || (fill && fill !== 'none' ? 'fill' : base)}
        className={className ? `icon ${className}` : 'icon'}
        {...rest}
      />
    ),
  );
  C.displayName = name;
  return C;
}

export const AlertCircle = make(WarningCircleIcon, 'duotone', 'AlertCircle');
export const AlertTriangle = make(WarningIcon, 'duotone', 'AlertTriangle');
export const ArrowLeft = make(ArrowLeftIcon, 'bold', 'ArrowLeft');
export const ArrowRight = make(ArrowRightIcon, 'bold', 'ArrowRight');
export const Atom = make(AtomIcon, 'duotone', 'Atom');
export const Award = make(CertificateIcon, 'duotone', 'Award');
export const Ban = make(ProhibitIcon, 'duotone', 'Ban');
export const BarChart3 = make(ChartBarIcon, 'duotone', 'BarChart3');
export const Bell = make(BellIcon, 'duotone', 'Bell');
export const BellRing = make(BellRingingIcon, 'duotone', 'BellRing');
export const BookOpen = make(BookOpenIcon, 'duotone', 'BookOpen');
export const BookOpenCheck = make(BookOpenTextIcon, 'duotone', 'BookOpenCheck');
export const Brain = make(BrainIcon, 'duotone', 'Brain');
export const Calculator = make(CalculatorIcon, 'duotone', 'Calculator');
export const CalendarCheck = make(CalendarCheckIcon, 'duotone', 'CalendarCheck');
export const CalendarClock = make(CalendarDotsIcon, 'duotone', 'CalendarClock');
export const CalendarDays = make(CalendarDotsIcon, 'duotone', 'CalendarDays');
export const CalendarRange = make(CalendarBlankIcon, 'duotone', 'CalendarRange');
export const Check = make(CheckIcon, 'bold', 'Check');
export const CheckCircle = make(CheckCircleIcon, 'duotone', 'CheckCircle');
export const CheckCircle2 = make(CheckCircleIcon, 'duotone', 'CheckCircle2');
export const CheckSquare = make(CheckSquareIcon, 'duotone', 'CheckSquare');
export const ChevronDown = make(CaretDownIcon, 'bold', 'ChevronDown');
export const ChevronLeft = make(CaretLeftIcon, 'bold', 'ChevronLeft');
export const ChevronRight = make(CaretRightIcon, 'bold', 'ChevronRight');
export const Circle = make(CircleIcon, 'bold', 'Circle');
export const ClipboardCheck = make(ClipboardTextIcon, 'duotone', 'ClipboardCheck');
export const ClipboardList = make(ClipboardIcon, 'duotone', 'ClipboardList');
export const Clock = make(ClockIcon, 'duotone', 'Clock');
export const Compass = make(CompassIcon, 'duotone', 'Compass');
export const Copy = make(CopyIcon, 'bold', 'Copy');
export const CornerDownLeft = make(ArrowElbowDownLeftIcon, 'bold', 'CornerDownLeft');
export const Crown = make(CrownIcon, 'duotone', 'Crown');
export const Database = make(DatabaseIcon, 'duotone', 'Database');
export const Delete = make(BackspaceIcon, 'bold', 'Delete');
export const Download = make(DownloadSimpleIcon, 'bold', 'Download');
export const Dumbbell = make(BarbellIcon, 'duotone', 'Dumbbell');
export const Eye = make(EyeIcon, 'duotone', 'Eye');
export const EyeOff = make(EyeSlashIcon, 'duotone', 'EyeOff');
export const FastForward = make(FastForwardIcon, 'bold', 'FastForward');
export const FileText = make(FileTextIcon, 'duotone', 'FileText');
export const Film = make(FilmStripIcon, 'duotone', 'Film');
export const Flag = make(FlagIcon, 'duotone', 'Flag');
export const Flame = make(FireIcon, 'duotone', 'Flame');
export const FlaskConical = make(FlaskIcon, 'duotone', 'FlaskConical');
export const Frown = make(SmileySadIcon, 'duotone', 'Frown');
export const Gamepad2 = make(GameControllerIcon, 'duotone', 'Gamepad2');
export const Gem = make(DiamondIcon, 'duotone', 'Gem');
export const Gift = make(GiftIcon, 'duotone', 'Gift');
export const Globe = make(GlobeIcon, 'duotone', 'Globe');
export const GraduationCap = make(GraduationCapIcon, 'duotone', 'GraduationCap');
export const HelpCircle = make(QuestionIcon, 'duotone', 'HelpCircle');
export const History = make(ClockCounterClockwiseIcon, 'duotone', 'History');
export const Home = make(HouseIcon, 'duotone', 'Home');
export const Hourglass = make(HourglassIcon, 'duotone', 'Hourglass');
export const Inbox = make(TrayIcon, 'duotone', 'Inbox');
export const Info = make(InfoIcon, 'duotone', 'Info');
export const KeyRound = make(KeyIcon, 'duotone', 'KeyRound');
export const Keyboard = make(KeyboardIcon, 'duotone', 'Keyboard');
export const Landmark = make(BankIcon, 'duotone', 'Landmark');
export const Languages = make(TranslateIcon, 'duotone', 'Languages');
export const Layers = make(StackIcon, 'duotone', 'Layers');
export const LayoutDashboard = make(SquaresFourIcon, 'duotone', 'LayoutDashboard');
export const Library = make(BooksIcon, 'duotone', 'Library');
export const Lightbulb = make(LightbulbIcon, 'duotone', 'Lightbulb');
export const LineChart = make(ChartLineIcon, 'duotone', 'LineChart');
export const Link = make(LinkIcon, 'bold', 'Link');
export const ListChecks = make(ListChecksIcon, 'duotone', 'ListChecks');
export const Loader2 = make(CircleNotchIcon, 'bold', 'Loader2');
export const Lock = make(LockIcon, 'duotone', 'Lock');
export const LogIn = make(SignInIcon, 'duotone', 'LogIn');
export const LogOut = make(SignOutIcon, 'duotone', 'LogOut');
export const MapPin = make(MapPinIcon, 'duotone', 'MapPin');
export const Maximize = make(CornersOutIcon, 'bold', 'Maximize');
export const Maximize2 = make(ArrowsOutIcon, 'bold', 'Maximize2');
export const Medal = make(MedalIcon, 'duotone', 'Medal');
export const Megaphone = make(MegaphoneIcon, 'duotone', 'Megaphone');
export const Menu = make(ListIcon, 'bold', 'Menu');
export const MessageCircle = make(ChatCircleIcon, 'duotone', 'MessageCircle');
export const Minimize = make(CornersInIcon, 'bold', 'Minimize');
export const Minimize2 = make(ArrowsInIcon, 'bold', 'Minimize2');
export const Moon = make(MoonIcon, 'duotone', 'Moon');
export const MousePointerClick = make(CursorClickIcon, 'duotone', 'MousePointerClick');
export const NotebookPen = make(NotebookIcon, 'duotone', 'NotebookPen');
export const PartyPopper = make(ConfettiIcon, 'duotone', 'PartyPopper');
export const Pause = make(PauseIcon, 'bold', 'Pause');
export const PenLine = make(PencilLineIcon, 'duotone', 'PenLine');
export const Pencil = make(PencilSimpleIcon, 'duotone', 'Pencil');
export const Play = make(PlayIcon, 'bold', 'Play');
export const PlayCircle = make(PlayCircleIcon, 'duotone', 'PlayCircle');
export const Plus = make(PlusIcon, 'bold', 'Plus');
export const Printer = make(PrinterIcon, 'duotone', 'Printer');
export const Radio = make(BroadcastIcon, 'duotone', 'Radio');
export const RefreshCw = make(ArrowsClockwiseIcon, 'bold', 'RefreshCw');
export const Repeat = make(RepeatIcon, 'bold', 'Repeat');
export const Rewind = make(RewindIcon, 'bold', 'Rewind');
export const RotateCcw = make(ArrowCounterClockwiseIcon, 'bold', 'RotateCcw');
export const RotateCw = make(ArrowClockwiseIcon, 'bold', 'RotateCw');
export const Save = make(FloppyDiskIcon, 'duotone', 'Save');
export const Scale = make(ScalesIcon, 'duotone', 'Scale');
export const School = make(ChalkboardIcon, 'duotone', 'School');
export const ScrollText = make(ScrollIcon, 'duotone', 'ScrollText');
export const Search = make(MagnifyingGlassIcon, 'bold', 'Search');
export const Send = make(PaperPlaneTiltIcon, 'duotone', 'Send');
export const Settings = make(GearSixIcon, 'duotone', 'Settings');
export const Share2 = make(ShareNetworkIcon, 'duotone', 'Share2');
export const Shield = make(ShieldIcon, 'duotone', 'Shield');
export const ShieldAlert = make(ShieldWarningIcon, 'duotone', 'ShieldAlert');
export const ShieldCheck = make(ShieldCheckIcon, 'duotone', 'ShieldCheck');
export const Shuffle = make(ShuffleIcon, 'bold', 'Shuffle');
export const Sigma = make(SigmaIcon, 'duotone', 'Sigma');
export const SkipForward = make(SkipForwardIcon, 'bold', 'SkipForward');
export const SlidersHorizontal = make(SlidersHorizontalIcon, 'duotone', 'SlidersHorizontal');
export const Smartphone = make(DeviceMobileIcon, 'duotone', 'Smartphone');
export const Sparkles = make(SparkleIcon, 'duotone', 'Sparkles');
export const Star = make(StarIcon, 'duotone', 'Star');
export const Sun = make(SunIcon, 'duotone', 'Sun');
export const Swords = make(SwordIcon, 'duotone', 'Swords');
export const Target = make(TargetIcon, 'duotone', 'Target');
export const ThumbsUp = make(ThumbsUpIcon, 'duotone', 'ThumbsUp');
export const Timer = make(TimerIcon, 'duotone', 'Timer');
export const Trash2 = make(TrashIcon, 'duotone', 'Trash2');
export const TrendingUp = make(TrendUpIcon, 'duotone', 'TrendingUp');
export const Trophy = make(TrophyIcon, 'duotone', 'Trophy');
export const Upload = make(UploadSimpleIcon, 'bold', 'Upload');
export const User = make(UserIcon, 'duotone', 'User');
export const UserCog = make(UserGearIcon, 'duotone', 'UserCog');
export const Users = make(UsersIcon, 'duotone', 'Users');
export const Video = make(VideoCameraIcon, 'duotone', 'Video');
export const Volume1 = make(SpeakerLowIcon, 'duotone', 'Volume1');
export const Volume2 = make(SpeakerHighIcon, 'duotone', 'Volume2');
export const VolumeX = make(SpeakerXIcon, 'duotone', 'VolumeX');
export const Wifi = make(WifiHighIcon, 'duotone', 'Wifi');
export const WifiOff = make(WifiSlashIcon, 'duotone', 'WifiOff');
export const X = make(XIcon, 'bold', 'X');
export const Zap = make(LightningIcon, 'duotone', 'Zap');
