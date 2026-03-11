import { create } from "zustand";

interface PromotionState {
  hasBannerVisible: boolean;
  bannerHeight: number;
  dismissSignal: number;
  setHasBannerVisible: (visible: boolean) => void;
  setBannerHeight: (height: number) => void;
  dismissAllOverlays: () => void;
}

export const usePromotionStore = create<PromotionState>((set) => ({
  hasBannerVisible: false,
  bannerHeight: 0,
  dismissSignal: 0,
  setHasBannerVisible: (visible) => set({ hasBannerVisible: visible }),
  setBannerHeight: (height) => set({ bannerHeight: height }),
  dismissAllOverlays: () => set((state) => ({ dismissSignal: state.dismissSignal + 1 })),
}));
