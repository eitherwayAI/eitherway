import React, { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { deployStore, loadDeployDataFromStorage } from '~/lib/stores/deployStore';
import { authStore } from '~/lib/stores/auth';

export const GooglePlayMock = () => {
  const appData = useStore(deployStore);
  const user = useStore(authStore.user);

  useEffect(() => {
    loadDeployDataFromStorage();
  }, []);

  console.log('🔍 GooglePlayMock - user data:', appData);
  console.log('🔍 GooglePlayMock - user.picture:', user?.picture);

  return (
    <div className="min-h-screen bg-white">
      {/* Top Navigation Bar */}
      <div className="bg-white px-8 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <div className="flex items-center space-x-3">
              <svg className="w-10 h-10" aria-hidden="true" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                <path fill="none" d="M0,0h40v40H0V0z"></path>
                <g>
                  <path
                    d="M19.7,19.2L4.3,35.3c0,0,0,0,0,0c0.5,1.7,2.1,3,4,3c0.8,0,1.5-0.2,2.1-0.6l0,0l17.4-9.9L19.7,19.2z"
                    fill="#EA4335"
                  ></path>
                  <path
                    d="M35.3,16.4L35.3,16.4l-7.5-4.3l-8.4,7.4l8.5,8.3l7.5-4.2c1.3-0.7,2.2-2.1,2.2-3.6C37.5,18.5,36.6,17.1,35.3,16.4z"
                    fill="#FBBC04"
                  ></path>
                  <path
                    d="M4.3,4.7C4.2,5,4.2,5.4,4.2,5.8v28.5c0,0.4,0,0.7,0.1,1.1l16-15.7L4.3,4.7z"
                    fill="#4285F4"
                  ></path>
                  <path
                    d="M19.8,20l8-7.9L10.5,2.3C9.9,1.9,9.1,1.7,8.3,1.7c-1.9,0-3.6,1.3-4,3c0,0,0,0,0,0L19.8,20z"
                    fill="#34A853"
                  ></path>
                </g>
              </svg>
              <span className="font-medium text-xl" style={{ color: '#676a6f' }}>
                Google Play
              </span>
            </div>
            <div className="flex space-x-6 items-center">
              <span
                className={`text-sm relative cursor-pointer ${appData.name?.toLowerCase().includes('game') ? 'text-[#01875f]' : 'text-gray-600'}`}
              >
                Games
                {appData.name?.toLowerCase().includes('game') && (
                  <div className="absolute -bottom-3 left-0 w-full h-0.5" style={{ backgroundColor: '#01875f' }}></div>
                )}
              </span>
              <span
                className={`text-sm relative cursor-pointer ${!appData.name?.toLowerCase().includes('game') ? 'text-[#01875f]' : 'text-gray-600'}`}
              >
                Apps
                {!appData.name?.toLowerCase().includes('game') && (
                  <div className="absolute -bottom-3 left-0 w-full h-0.5" style={{ backgroundColor: '#01875f' }}></div>
                )}
              </span>
              <span className="text-sm text-gray-600 cursor-pointer">Books</span>
              <span className="text-sm text-gray-600 cursor-pointer">Kids</span>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <svg className="w-6 h-6 text-gray-600 cursor-pointer" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <svg className="w-6 h-6 text-gray-600 cursor-pointer" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {user?.picture ? (
              <img
                src={user.picture}
                alt={user.name}
                onError={(e) => (e.currentTarget.src = '/icons/appstoreapps/avatar.jpg')}
                className="w-8 h-8 rounded-full"
              />
            ) : (
              <img src="/icons/appstoreapps/avatar.jpg" alt={'avatar'} className="w-8 h-8 rounded-full" />
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8">
        {/* Main App Info - Full Width */}
        <div className="mb-8">
          <div className="flex space-x-6">
            <div className="flex-1">
              <h1 className="text-6xl font-bold text-black mb-8">{appData.name.toUpperCase() || 'App Name'}</h1>
              <p className="font-medium" style={{ color: '#01875f' }}>
                {user?.name || 'Developer'}
              </p>
              <p className="mb-8 text-sm" style={{ color: '#676a6f' }}>
                {appData.hasAds ? 'Contains ads' : 'No ads'}
              </p>

              <div className="flex items-center divide-x divide-gray-300 mb-8">
                <div className="flex flex-col items-center justify-center px-4">
                  <div className="flex items-center w-full justify-center">
                    <span className=" text-lg font-semibold">5.0</span>
                    <span className="text-xl">★</span>
                  </div>
                  <span className="text-sm" style={{ color: '#676a6f' }}>
                    Reviews: 0
                  </span>
                </div>
                <div className="flex flex-col items-center px-4">
                  <span className="text-lg font-semibold">0</span>
                  <span className="text-sm" style={{ color: '#676a6f' }}>
                    Downloads
                  </span>
                </div>
                <div className="flex flex-col items-center px-4">
                  <span className="border border-gray-300 px-2 py-1 text-sm font-medium">3+</span>
                  <span className="text-sm" style={{ color: '#676a6f' }}>
                    Age rating
                  </span>
                </div>
              </div>

              <div className="flex gap-8 items-center">
                <button
                  className="text-white px-8 py-3 rounded-lg text-lg font-medium mb-4"
                  style={{ backgroundColor: '#01875f' }}
                >
                  Install
                </button>

                <div className="flex space-x-6 text-sm mb-4">
                  <div className="flex items-center cursor-pointer">
                    <svg
                      className="w-5 h-5 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      style={{ color: '#01875f' }}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
                      />
                    </svg>
                    <span style={{ color: '#01875f' }}>Share</span>
                  </div>
                  <div className="flex items-center cursor-pointer">
                    <svg
                      className="w-5 h-5 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      style={{ color: '#01875f' }}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                      />
                    </svg>
                    <span style={{ color: '#01875f' }}>Add to wishlist</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center text-sm gap-2" style={{ color: '#676a6f' }}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  height="24px"
                  viewBox="0 -960 960 960"
                  width="24px"
                  fill="#676a6f"
                >
                  <path d="M480-540ZM80-160v-80h400v80H80Zm120-120q-33 0-56.5-23.5T120-360v-360q0-33 23.5-56.5T200-800h560q33 0 56.5 23.5T840-720H200v360h280v80H200Zm600 40v-320H640v320h160Zm-180 80q-25 0-42.5-17.5T560-220v-360q0-25 17.5-42.5T620-640h200q25 0 42.5 17.5T880-580v360q0 25-17.5 42.5T820-160H620Zm100-300q13 0 21.5-9t8.5-21q0-13-8.5-21.5T720-520q-12 0-21 8.5t-9 21.5q0 12 9 21t21 9Zm0 60Z" />
                </svg>
                This app is available for your device
              </div>
            </div>

            {/* App Icon - 240x240 */}
            <div className="w-60 h-60 flex-shrink-0">
              {appData.icon ? (
                <img src={appData.icon} alt="App Icon" className="w-60 h-60 rounded-2xl object-cover" />
              ) : (
                <div className="w-60 h-60 bg-gray-300 rounded-2xl flex items-center justify-center">
                  <span className="text-gray-500 text-4xl">📱</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex space-x-8">
          {/* Main Content */}
          <div className="flex-1 max-w-4xl">
            {/* About This App */}
            <div className="mb-8 mt-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex gap-2 items-center">
                  <h2 className="text-xl font-semibold text-black">About this app</h2>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    height="24px"
                    viewBox="0 -960 960 960"
                    width="24px"
                    fill="#000000"
                  >
                    <path d="M647-440H160v-80h487L423-744l57-56 320 320-320 320-57-56 224-224Z" />
                  </svg>
                </div>
              </div>
              <p className="mb-4" style={{ color: '#676a6f' }}>
                {appData.fullDescription || 'No description available'}
              </p>
              <ul className="list-disc list-inside space-y-2 mb-4" style={{ color: '#676a6f' }}>
                <li>{appData.shortDescription || 'Create and edit forms on the go'}</li>
                <li>{appData.category ? `Category: ${appData.category}` : 'Create forms easily using templates'}</li>
                <li>
                  {appData.contentRating
                    ? `Content Rating: ${appData.contentRating}`
                    : 'Job application form, feedback form'}
                </li>
              </ul>
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: '#676a6f' }}>Updated {new Date().toLocaleDateString('en-US')}</span>
                <span className="bg-gray-200 px-3 py-1 rounded-full" style={{ color: '#676a6f' }}>
                  {appData.category || 'Category'}
                </span>
              </div>
            </div>

            {/* Data Safety */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-black">Data safety</h2>
              </div>
              <p className="mb-6" style={{ color: '#676a6f' }}>
                Safety is determined by how the app collects and to whom it transfers your data. Methods of ensuring
                confidentiality and data protection may vary depending on the use of the app, region, and user's age.
                The developer who provides this information may update it.
              </p>

              <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
                <div className="space-y-6">
                  <div className="flex items-start space-x-4">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      height="24px"
                      viewBox="0 -960 960 960"
                      width="24px"
                      fill="#676a6f"
                    >
                      <path d="M680-80q-50 0-85-35t-35-85q0-6 3-28L282-392q-16 15-37 23.5t-45 8.5q-50 0-85-35t-35-85q0-50 35-85t85-35q24 0 45 8.5t37 23.5l281-164q-2-7-2.5-13.5T560-760q0-50 35-85t85-35q50 0 85 35t35 85q0 50-35 85t-85 35q-24 0-45-8.5T598-672L317-508q2 7 2.5 13.5t.5 14.5q0 8-.5 14.5T317-452l281 164q16-15 37-23.5t45-8.5q50 0 85 35t35 85q0 50-35 85t-85 35Zm0-80q17 0 28.5-11.5T720-200q0-17-11.5-28.5T680-240q-17 0-28.5 11.5T640-200q0 17 11.5 28.5T680-160ZM200-440q17 0 28.5-11.5T240-480q0-17-11.5-28.5T200-520q-17 0-28.5 11.5T160-480q0 17 11.5 28.5T200-440Zm480-280q17 0 28.5-11.5T720-760q0-17-11.5-28.5T680-800q-17 0-28.5 11.5T640-760q0 17 11.5 28.5T680-720Zm0 520ZM200-480Zm480-280Z" />
                    </svg>
                    <div className="flex-1">
                      <h3 className="font-medium text-black mb-2">Data sharing</h3>
                      <p className="text-sm mb-2" style={{ color: '#676a6f' }}>
                        Data is not transferred to third parties
                      </p>
                      <a href="#" className="text-sm cursor-pointer" style={{ color: '#01875f' }}>
                        More details on how developers declare data transfer
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      height="24px"
                      viewBox="0 -960 960 960"
                      width="24px"
                      fill="#676a6f"
                    >
                      <path d="M260-160q-91 0-155.5-63T40-377q0-78 47-139t123-78q25-92 100-149t170-57q117 0 198.5 81.5T760-520q69 8 114.5 59.5T920-340q0 75-52.5 127.5T740-160H520q-33 0-56.5-23.5T440-240v-206l-64 62-56-56 160-160 160 160-56 56-64-62v206h220q42 0 71-29t29-71q0-42-29-71t-71-29h-60v-80q0-83-58.5-141.5T480-720q-83 0-141.5 58.5T280-520h-20q-58 0-99 41t-41 99q0 58 41 99t99 41h100v80H260Zm220-280Z" />
                    </svg>
                    <div className="flex-1">
                      <h3 className="font-medium text-black mb-2">Data collection</h3>
                      <p className="text-sm mb-2" style={{ color: '#676a6f' }}>
                        This app may collect the following types of data
                      </p>
                      <a href="#" className="text-sm cursor-pointer" style={{ color: '#01875f' }}>
                        Personal information, Photos & videos and 2 more
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      height="24px"
                      viewBox="0 -960 960 960"
                      width="24px"
                      fill="#676a6f"
                    >
                      <path d="M280-440h400v-80H280v80ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z" />
                    </svg>
                    <div className="flex-1">
                      <h3 className="font-medium text-black mb-2">Data encryption</h3>
                      <p className="text-sm" style={{ color: '#676a6f' }}>
                        Data is not encrypted
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-4">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      height="24px"
                      viewBox="0 -960 960 960"
                      width="24px"
                      fill="#676a6f"
                    >
                      <path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z" />
                    </svg>
                    <div className="flex-1">
                      <h3 className="font-medium text-black mb-2">Data deletion</h3>
                      <p className="text-sm" style={{ color: '#676a6f' }}>
                        You can send a request to delete this data
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <a href="#" className="text-sm font-medium cursor-pointer" style={{ color: '#01875f' }}>
                More details
              </a>
            </div>

            {/* App Permissions */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-black">App permissions</h2>
              </div>
              <p className="mb-4" style={{ color: '#676a6f' }}>
                This app requires the following permissions to function properly. You can manage these permissions in
                your device settings.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    height="24px"
                    viewBox="0 -960 960 960"
                    width="24px"
                    fill="#000000"
                  >
                    <path d="M480-260q75 0 127.5-52.5T660-440q0-75-52.5-127.5T480-620q-75 0-127.5 52.5T300-440q0 75 52.5 127.5T480-260Zm0-80q-42 0-71-29t-29-71q0-42 29-71t71-29q42 0 71 29t29 71q0 42-29 71t-71 29ZM160-120q-33 0-56.5-23.5T80-200v-480q0-33 23.5-56.5T160-760h126l74-80h240l74 80h126q33 0 56.5 23.5T880-680v480q0 33-23.5 56.5T800-120H160Zm0-80h640v-480H638l-73-80H395l-73 80H160v480Zm320-240Z" />
                  </svg>
                  <span className="text-sm font-medium">Camera</span>
                </div>
                <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    height="24px"
                    viewBox="0 -960 960 960"
                    width="24px"
                    fill="#000000"
                  >
                    <path d="M120-160v-160h720v160H120Zm80-40h80v-80h-80v80Zm-80-440v-160h720v160H120Zm80-40h80v-80h-80v80Zm-80 280v-160h720v160H120Zm80-40h80v-80h-80v80Z" />
                  </svg>
                  <span className="text-sm font-medium">Storage</span>
                </div>
                <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    height="24px"
                    viewBox="0 -960 960 960"
                    width="24px"
                    fill="#000000"
                  >
                    <path d="M480-480q33 0 56.5-23.5T560-560q0-33-23.5-56.5T480-640q-33 0-56.5 23.5T400-560q0 33 23.5 56.5T480-480Zm0 294q122-112 181-203.5T720-552q0-109-69.5-178.5T480-800q-101 0-170.5 69.5T240-552q0 71 59 162.5T480-186Zm0 106Q319-217 239.5-334.5T160-552q0-150 96.5-239T480-880q127 0 223.5 89T800-552q0 100-79.5 217.5T480-80Zm0-480Z" />
                  </svg>
                  <span className="text-sm font-medium">Location</span>
                </div>
                <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    height="24px"
                    viewBox="0 -960 960 960"
                    width="24px"
                    fill="#000000"
                  >
                    <path d="M480-400q-50 0-85-35t-35-85v-240q0-50 35-85t85-35q50 0 85 35t35 85v240q0 50-35 85t-85 35Zm0-240Zm-40 520v-123q-104-14-172-93t-68-184h80q0 83 58.5 141.5T480-320q83 0 141.5-58.5T680-520h80q0 105-68 184t-172 93v123h-80Zm40-360q17 0 28.5-11.5T520-520v-240q0-17-11.5-28.5T480-800q-17 0-28.5 11.5T440-760v240q0 17 11.5 28.5T480-480Z" />
                  </svg>
                  <span className="text-sm font-medium">Microphone</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="w-72 flex-shrink-0 pl-8 mt-8">
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-black">Similar apps</h3>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  height="24px"
                  viewBox="0 -960 960 960"
                  width="24px"
                  fill="#000000"
                >
                  <path d="M647-440H160v-80h487L423-744l57-56 320 320-320 320-57-56 224-224Z" />
                </svg>
              </div>
              <div className="space-y-4">
                {[
                  {
                    name: 'OKX Web3 Wallet',
                    dev: 'OKX Labs',
                    icon: '/icons/appstoreapps/1.png',
                    rating: '4.7',
                  },
                  {
                    name: 'Xverse Bitcoin & Stacks Wallet',
                    dev: 'Secret Key Labs',
                    icon: '/icons/appstoreapps/2.png',
                    rating: '4.8',
                  },
                  {
                    name: 'MetaMask - Blockchain Wallet',
                    dev: 'ConsenSys Software Inc.',
                    icon: '/icons/appstoreapps/3.png',
                    rating: '4.6',
                  },
                  { name: 'Kwork', dev: 'RemoteFirst', icon: '/icons/appstoreapps/4.webp', rating: '4.2' },
                  { name: 'Livestock Manager', dev: 'Livestock Farm Co.', icon: '/icons/appstoreapps/5.webp' },
                  {
                    name: 'SurveyHeart: Form, Poll & Quiz',
                    dev: 'SurveyHeart LLP',
                    icon: '/icons/appstoreapps/6.webp',
                    rating: '4.0',
                  },
                ].map((app, i) => (
                  <div key={i} className="flex items-center space-x-3 cursor-pointer">
                    <img src={app.icon} alt={app.name} className="w-16 h-16 rounded-lg object-cover" />
                    <div className="flex-1">
                      <p className="font-medium text-sm text-black mb-1">{app.name}</p>
                      <p className="text-xs" style={{ color: '#676a6f' }}>
                        {app.dev}
                      </p>
                      {app.rating && (
                        <p className="text-sm mb-1 gap-2 flex items-center" style={{ color: '#676a6f' }}>
                          <span className="text-xl">★</span> {app.rating}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
