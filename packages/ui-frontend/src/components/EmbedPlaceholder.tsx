interface EmbedPlaceholderProps {
  url: string;
  type?: 'youtube' | 'vimeo' | 'iframe';
  title?: string;
}

export default function EmbedPlaceholder({ url, type = 'iframe', title }: EmbedPlaceholderProps) {
  const handleOpen = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const getIcon = () => {
    switch (type) {
      case 'youtube':
        return '▶️';
      case 'vimeo':
        return '▶️';
      default:
        return '🔗';
    }
  };

  const getLabel = () => {
    switch (type) {
      case 'youtube':
        return 'YouTube Video';
      case 'vimeo':
        return 'Vimeo Video';
      default:
        return 'External Content';
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
        border: '2px dashed #ccc',
        borderRadius: '8px',
        backgroundColor: '#f9f9f9',
        cursor: 'pointer',
        minHeight: '200px',
        textAlign: 'center'
      }}
      onClick={handleOpen}
    >
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>{getIcon()}</div>
      <h3 style={{ margin: '0 0 8px 0', color: '#333' }}>
        {title || getLabel()}
      </h3>
      <p style={{ margin: '0 0 16px 0', color: '#666', fontSize: '14px' }}>
        Click to open in new tab
      </p>
      <button
        style={{
          padding: '10px 20px',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '500'
        }}
        onClick={handleOpen}
      >
        Open {getLabel()}
      </button>
      <div
        style={{
          marginTop: '12px',
          fontSize: '12px',
          color: '#999',
          wordBreak: 'break-all',
          maxWidth: '400px'
        }}
      >
        {url}
      </div>
    </div>
  );
}
