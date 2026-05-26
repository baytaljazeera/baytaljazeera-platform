/**
 * Phase 1 — runtime resolver from string icon names (stored in DB) to the
 * actual lucide-react components. Add new icons here when seed/admin UI
 * needs them. Returns a safe fallback (FileText) when the name is unknown
 * so a typo in DB doesn't render a broken sidebar row.
 */

import {
  LayoutDashboard,
  FileText,
  Headset,
  Users,
  Newspaper,
  UserPlus2,
  BrainCircuit,
  Settings,
  CreditCard,
  Flag,
  MessageSquare,
  Shield,
  Wallet,
  Megaphone,
  Eye,
  MapPin,
  Building2,
  Home,
  HeartHandshake,
  Lock,
  MessageCirclePlus,
  RotateCcw,
  MessageCircle,
  Inbox,
  Crown,
  History,
  Bell,
  Activity,
} from "lucide-react";

const REGISTRY: Record<string, typeof LayoutDashboard> = {
  LayoutDashboard, FileText, Headset, Users, Newspaper, UserPlus2,
  BrainCircuit, Settings, CreditCard, Flag, MessageSquare, Shield,
  Wallet, Megaphone, Eye, MapPin, Building2, Home, HeartHandshake,
  Lock, MessageCirclePlus, RotateCcw, MessageCircle, Inbox, Crown,
  History, Bell, Activity,
};

export function resolveIcon(name: string | null | undefined): typeof LayoutDashboard {
  if (!name) return FileText;
  return REGISTRY[name] || FileText;
}
