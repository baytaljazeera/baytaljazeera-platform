import { create } from "zustand";

interface PromotionState {
  hasBannerVisible: boolean;
  bannerHeight: number;
  setHasBannerVisible: (visible: boolean) => void;
  setBannerHeight: (height: number) => void;
}

export const usePromotionStore = create<PromotionState>((set) => ({
  hasBannerVisible: false,
  bannerHeight: 0,
  setHasBannerVisible: (visible) => set({ hasBannerVisible: visible }),
  setBannerHeight: (height) => set({ bannerHeight: height }),
}));
