import { useState } from 'react';

type ViewMode = 'code' | 'preview';
type DeviceMode = 'desktop' | 'mobile';
type PreviewStatus = 'ready' | 'building' | 'stopped';

interface ViewToolbarProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  deviceMode?: DeviceMode;
  onDeviceModeChange?: (mode: DeviceMode) => void;
  previewStatus?: PreviewStatus;
  previewUrl?: string;
  onRefresh?: () => void;
}

export default function ViewToolbar({
  currentView,
  onViewChange,
  deviceMode = 'desktop',
  onDeviceModeChange,
  previewStatus = 'stopped',
  previewUrl = '',
  onRefresh,
}: ViewToolbarProps) {
  const [urlInputFocused, setUrlInputFocused] = useState(false);

  const getStatusColor = () => {
    switch (previewStatus) {
      case 'ready':
        return '#21c352';
      case 'building':
        return '#ffc107';
      case 'stopped':
        return '#ff5252';
      default:
        return '#666';
    }
  };

  const getStatusText = () => {
    switch (previewStatus) {
      case 'ready':
        return 'Live';
      case 'building':
        return 'Building';
      case 'stopped':
        return 'Stopped';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="view-toolbar">
      {/* View Switcher */}
      <div className="view-switcher">
        <button
          className={`view-tab ${currentView === 'code' ? 'active' : ''}`}
          onClick={() => onViewChange('code')}
        >
          <svg className="view-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
            />
          </svg>
          <span>Code Editor</span>
        </button>
        <button
          className={`view-tab ${currentView === 'preview' ? 'active' : ''}`}
          onClick={() => onViewChange('preview')}
        >
          <svg className="view-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
          <span>Live Preview</span>
        </button>
      </div>

      <div className="toolbar-divider" />

      {/* Device Mode Toggle - Only show in preview mode */}
      {currentView === 'preview' && onDeviceModeChange && (
        <>
          <div className="device-mode-toggle">
            <button
              className={`device-btn ${deviceMode === 'desktop' ? 'active' : ''}`}
              onClick={() => onDeviceModeChange('desktop')}
              title="Desktop Mode"
            >
              <svg className="device-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </button>
            <button
              className={`device-btn ${deviceMode === 'mobile' ? 'active' : ''}`}
              onClick={() => onDeviceModeChange('mobile')}
              title="Mobile Mode"
            >
              <svg className="device-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
            </button>
          </div>

          <div className="toolbar-divider" />
        </>
      )}

      {/* Preview Status - Only show in preview mode */}
      {currentView === 'preview' && (
        <>
          <div className="preview-status">
            <div className="status-indicator" style={{ backgroundColor: getStatusColor() }} />
            <span className="status-text">{getStatusText()}</span>
          </div>

          <div className="toolbar-divider" />

          {/* Preview URL */}
          {previewUrl && (
            <div className="preview-url-container">
              <svg className="url-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                />
              </svg>
              <input
                type="text"
                className={`preview-url-input ${urlInputFocused ? 'focused' : ''}`}
                value={previewUrl}
                readOnly
                onFocus={() => setUrlInputFocused(true)}
                onBlur={() => setUrlInputFocused(false)}
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
            </div>
          )}

          {/* Refresh Button */}
          {onRefresh && previewUrl && (
            <>
              <div className="toolbar-divider" />
              <button className="refresh-btn" onClick={onRefresh} title="Refresh Preview">
                <svg className="refresh-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
