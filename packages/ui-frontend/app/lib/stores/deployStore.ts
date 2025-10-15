import { atom } from 'nanostores';

export interface AppData {
  name: string;
  shortDescription: string;
  fullDescription: string;
  icon: string | null;
  screenshots: string[];
  promoVideo: string;
  category: string;
  contactEmail: string;
  website: string;
  privacyPolicy: string;
  contentRating: string;
  googlePlayCompliance: boolean;
  hasAds: boolean;
  targetAudience: 'children' | 'general' | 'adults';
  isPaid: boolean;
  distributionCountries: string[];
  minAndroidVersion: string;
  permissions: string[];
  deviceSupport: string;
  versionCode: string;
  versionName: string;
  releaseName: string;
  releaseNotes: string;
}

export const deployStore = atom<AppData>({
  name: '',
  shortDescription: '',
  fullDescription: '',
  icon: null,
  screenshots: [],
  promoVideo: '',
  category: '',
  contactEmail: '',
  website: '',
  privacyPolicy: '',
  contentRating: '',
  googlePlayCompliance: false,
  hasAds: false,
  targetAudience: 'general',
  isPaid: false,
  distributionCountries: [],
  minAndroidVersion: '',
  permissions: [],
  deviceSupport: '',
  versionCode: '',
  versionName: '',
  releaseName: '',
  releaseNotes: '',
});

export const updateDeployData = (data: Partial<AppData>) => {
  deployStore.set({ ...deployStore.get(), ...data });
};

export const clearDeployData = () => {
  deployStore.set({
    name: '',
    shortDescription: '',
    fullDescription: '',
    icon: null,
    screenshots: [],
    promoVideo: '',
    category: '',
    contactEmail: '',
    website: '',
    privacyPolicy: '',
    contentRating: '',
    googlePlayCompliance: false,
    hasAds: false,
    targetAudience: 'general',
    isPaid: false,
    distributionCountries: [],
    minAndroidVersion: '',
    permissions: [],
    deviceSupport: '',
    versionCode: '',
    versionName: '',
    releaseName: '',
    releaseNotes: '',
  });
};

export const loadDeployDataFromStorage = () => {
  if (typeof window !== 'undefined') {
    const savedData = localStorage.getItem('deployment_data');

    if (savedData) {
      try {
        const parsedData = JSON.parse(savedData);

        if (parsedData.appData) {
          deployStore.set(parsedData.appData);
          return true;
        }
      } catch (error) {
        console.error('Error loading deployment data from localStorage:', error);
      }
    }
  }

  return false;
};

if (typeof window !== 'undefined') {
  loadDeployDataFromStorage();
}
