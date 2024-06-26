/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Draft, create as mutativeCreate } from 'mutative';
import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface NavigationStoreProps {
  isReplyModalOpen: boolean;
  isCommandPaletteOpen: boolean;
}

interface NavigationStoreActions {
  openReplyModal: () => void;
  closeReplyModal: () => void;
  closeCommandPallete: () => void;
  toggleCommandPalette: () => void;
  toAccounts: () => void;
  toFeed: () => void;
  toReplies: () => void;
  toNewPost: () => void;
  toSettings: () => void;
}

export interface NavigationStore extends NavigationStoreProps, NavigationStoreActions { }

export const mutative = (config) =>
  (set, get) => config((fn) => set(mutativeCreate(fn)), get);

type StoreSet = (fn: (draft: Draft<NavigationStore>) => void) => void;

const store = (set: StoreSet) => ({
  isCommandPaletteOpen: false,
  isReplyModalOpen: false,
  openReplyModal: () => {
    set((state) => {
      state.isReplyModalOpen = true;
    });
  },
  closeReplyModal: () => {
    set((state) => {
      state.isReplyModalOpen = false;
    });
  },
  closeCommandPallete: () => {
    set((state) => {
      state.isCommandPaletteOpen = false;
    });
  },
  toggleCommandPalette: () => {
    set((state) => {
      // console.log('useNavStore: toggleCommandPalette');
      state.isCommandPaletteOpen = !state.isCommandPaletteOpen;
    });
  },
});
export const useNavigationStore = create<NavigationStore>()(devtools(mutative(store)));
