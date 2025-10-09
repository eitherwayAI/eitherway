import { useState, useEffect } from 'react';
import type { GoogleUser } from '~/lib/auth/google';

interface GoogleAuthButtonProps {
  onSuccess: (user: GoogleUser) => void;
  onError: () => void;
  className?: string;
}

export function GoogleAuthButton({ onSuccess, onError, className }: GoogleAuthButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    console.log('🔑 GoogleAuthButton mounted, onSuccess:', onSuccess, 'onError:', onError);
  }, [onSuccess, onError]);

  const handleGoogleLogin = () => {
    console.log('🔑 Google login button clicked!');
    setIsLoading(true);

    const clientId = '631136632309-58183vsuk8cit3qrsfie88as8lsric21.apps.googleusercontent.com';
    const redirectUri = encodeURIComponent(window.location.origin + '/auth/google/callback');
    const scope = encodeURIComponent('openid email profile');
    const responseType = 'code';

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=${responseType}&access_type=offline&prompt=consent`;

    console.log('🔗 Opening popup with URL:', googleAuthUrl);

    const popup = window.open(googleAuthUrl, 'googleAuth', 'width=500,height=600,scrollbars=yes,resizable=yes');

    if (popup) {
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          setIsLoading(false);
        }
      }, 1000);

      window.addEventListener('message', (event) => {
        if (event.origin !== window.location.origin) {
          return;
        }

        if (event.data && typeof event.data === 'object' && event.data.type) {
          console.log('📨 Received Google OAuth message:', event.data);

          if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
            console.log('✅ Google auth success, user:', event.data.user);
            console.log('🎯 Calling onSuccess with user data');
            popup.close();
            onSuccess(event.data.user);
            setIsLoading(false);
          } else if (event.data.type === 'GOOGLE_AUTH_ERROR') {
            console.log('❌ Google auth error:', event.data.error);
            popup.close();
            onError();
            setIsLoading(false);
          }
        }
      });
    } else {
      setIsLoading(false);
      onError();
    }
  };

  useEffect(() => {
    console.log('🔑 GoogleAuthButton mounted, onSuccess:', onSuccess, 'onError:', onError);
  }, [onSuccess, onError]);

  return (
    <div className={className}>
      <button
        onClick={handleGoogleLogin}
        disabled={isLoading}
        className="google-signin-button"
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '8px',
          gap: '8px',
          width: '100%',
          height: '40px',
          backgroundColor: '#5184EC',
          border: 'none',
          borderRadius: '48px',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s',
          opacity: isLoading ? 0.7 : 1,
        }}
        onMouseEnter={(e) => {
          if (!isLoading) {
            e.currentTarget.style.backgroundColor = '#3367d6';
            e.currentTarget.style.boxShadow = '0 4px 8px rgba(66, 133, 244, 0.4)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isLoading) {
            e.currentTarget.style.backgroundColor = '#4285f4';
            e.currentTarget.style.boxShadow = '0 2px 4px rgba(66, 133, 244, 0.3)';
          }
        }}
      >
        {isLoading ? (
          <>
            <div
              className="spin"
              style={{
                width: '16px',
                height: '16px',
                border: '2px solid #f3f3f3',
                borderTop: '2px solid #4285f4',
                borderRadius: '50%',
              }}
            />
            <span>Loading Google Sign-In...</span>
          </>
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '8px',
                gap: '8px',
                width: '24px',
                height: '24px',
                background: '#FFFFFF',
                borderRadius: '64px',
                flex: 'none',
                order: 0,
                flexGrow: 0,
              }}
            >
              <img
                src="/icons/deploy/google.svg"
                alt="Google"
                style={{
                  width: '16px',
                  height: '16px',
                  flex: 'none',
                  order: 0,
                  flexGrow: 0,
                }}
              />
            </div>
            <span
              style={{
                width: '149px',
                height: '14px',
                fontFamily: 'Azeret Mono',
                fontStyle: 'normal',
                fontWeight: '400',
                fontSize: '12px',
                lineHeight: '14px',
                textAlign: 'center',
                color: '#FFFFFF',
                flex: 'none',
                order: 1,
                flexGrow: 0,
              }}
            >
              Sign In with Google
            </span>
          </>
        )}
      </button>
    </div>
  );
}
