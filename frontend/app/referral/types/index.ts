export type ReferralData = {
  id: string;
  status: string;
  created_at: string;
  referred_name: string;
  collapse_reason?: string;
  collapsed_at?: string;
  floor_number: number;
  risk_score?: number;
  risk_level?: string;
  triggered_rules?: any[];
  ai_explanation?: string;
};

export type AmbassadorStats = {
  ambassador_code: string;
  built_floors?: number;
  collapsed_floors?: number;
  healthy_floors?: number;
  floors_consumed?: number;
  available_floors?: number;
  current_floors: number;
  flagged_floors: number;
  flagged_floors_details?: Array<{
    id: string;
    status: string;
    created_at: string;
    referred_name: string;
    collapse_reason?: string;
    collapsed_at?: string;
    floor_number: number;
  }>;
  total_floors_earned: number;
  max_floors: number;
  rewards_config: Array<{
    floors: number;
    plan_name: string;
    plan_months: number;
    plan_tier?: string;
  }>;
  available_reward: {
    floors: number;
    plan_name: string;
    plan_months: number;
  } | null;
  can_consume: boolean;
  consumption_enabled: boolean;
  pending_request: any;
  referrals: ReferralData[];
  consumptions: Array<{
    id: string;
    consumed_at: string;
    plan_name: string;
    floors_consumed: number;
  }>;
};

export type BuildingData = {
  buildingNumber: number;
  floors: Array<{
    floorNumber: number;
    referral?: ReferralData;
    status: 'empty' | 'completed' | 'flagged' | 'suspicious';
  }>;
  status: 'empty' | 'partial' | 'complete' | 'flagged';
  totalFloors: number;
  flaggedCount: number;
  suspiciousCount: number;
};

export type ShareTextConfig = {
  main_title: string;
  code_line: string;
  benefit_line: string;
  cta_line: string;
};

export type WalletData = {
  total_completed_buildings: number;
  total_flagged_buildings: number;
  net_buildings: number;
  balance_usd: number;
  total_withdrawn: number;
  pending_withdrawal: number;
  available_balance: number;
  withdrawal_history: Array<{
    id: string;
    amount: number;
    status: string;
    requested_at: string;
    processed_at?: string;
    payment_method?: string;
  }>;
};

export type RewardTier = {
  floors: number;
  plan_name: string;
  plan_months: number;
  plan_tier?: string;
};
