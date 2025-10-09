import { atom } from 'nanostores';

export const sidebarStore = atom({
  isOpen: false,
});

export const toggleSidebar = () => {
  const current = sidebarStore.get();
  sidebarStore.set({ ...current, isOpen: !current.isOpen });
};

export const openSidebar = () => {
  sidebarStore.set({ isOpen: true });
};

export const closeSidebar = () => {
  sidebarStore.set({ isOpen: false });
};
